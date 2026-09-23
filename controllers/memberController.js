const db = require('../config/db');

// --- SAFE TIMEZONE HELPER (ASIA/MANILA) ---
const getLocalDateString = (dateObj = new Date()) => {
  return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
};

// @desc    Kuhanin ang buong listahan ng gym members
// @route   GET /api/members
exports.getMembers = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        m.member_id AS id, 
        m.name, 
        m.email,
        p.plan_name AS plan, 
        DATE_FORMAT(m.expiry_date, '%Y-%m-%d') AS expiryDate, 
        CASE 
          WHEN m.expiry_date <= DATE(CONVERT_TZ(NOW(), @@session.time_zone, '+08:00')) THEN 'Expired'
          ELSE 'Active' 
        END AS status, 
        m.payment_status AS payment, 
        DATE_FORMAT(m.joined_date, '%Y-%m-%d') AS joined
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.plan_id
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'SYSTEM_ERROR: Fetching member ledger failed.' });
  }
};

exports.updateMember = async (req, res) => {
  const memberId = req.params.memberId;
  const { name, email, payment_status, plan_id } = req.body;
  const updates = [];
  const values = [];

  if (typeof name === 'string' && name.trim()) {
    updates.push('name = ?');
    values.push(name.trim());
  }

  if (typeof email === 'string') {
    const trimmedEmail = email.trim();
    if (trimmedEmail) {
      updates.push('email = ?');
      values.push(trimmedEmail.toLowerCase());
    }
  }

  if (plan_id) {
    updates.push('plan_id = ?');
    values.push(plan_id);
  }

  if (payment_status) {
    updates.push('payment_status = ?');
    values.push(payment_status);
  }

  if (!updates.length) {
    return res.status(400).json({ error: 'NO_MEMBER_FIELDS_TO_UPDATE' });
  }

  try {
    const [result] = await db.query(`UPDATE members SET ${updates.join(', ')} WHERE member_id = ?`, [...values, memberId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'MEMBER_NOT_FOUND' });
    }

    res.json({ message: 'MEMBER_UPDATED' });
  } catch (error) {
    console.error('MEMBER_UPDATE_ERROR:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'EMAIL_ALREADY_IN_USE' });
    }
    res.status(500).json({ error: 'MEMBER_UPDATE_FAILED' });
  }
};

exports.deleteMember = async (req, res) => {
  const memberId = String(req.params.memberId || '').trim();
  if (!memberId) return res.status(400).json({ error: 'MEMBER_ID_REQUIRED' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [members] = await connection.query(
      'SELECT member_id FROM members WHERE member_id = ? FOR UPDATE',
      [memberId]
    );
    if (!members.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'MEMBER_NOT_FOUND' });
    }

    await connection.query('DELETE FROM renewal_logs WHERE member_id = ?', [memberId]);
    await connection.query('DELETE FROM members WHERE member_id = ?', [memberId]);
    await connection.commit();

    res.json({ message: 'MEMBER_DELETED', memberId });
  } catch (error) {
    await connection.rollback();
    console.error('MEMBER_DELETE_ERROR:', error);
    res.status(500).json({ error: 'MEMBER_DELETE_FAILED' });
  } finally {
    connection.release();
  }
};

// @desc    Kuhanin ang renewal at registration history ng isang miyembro
// @route   GET /api/members/:memberId/history
exports.getMemberHistory = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        r.transaction_id AS id,
        p.plan_name AS plan,
        r.amount_paid AS amount,
        CASE WHEN r.voided_at IS NULL THEN r.payment_status ELSE 'Voided' END AS payment,
        r.voided_at AS voidedAt,
        DATE_FORMAT(r.new_expiry_date, '%Y-%m-%d') AS expiryDate,
        r.renewal_date AS createdAt
      FROM renewal_logs r
      LEFT JOIN plans p ON r.plan_id = p.plan_id
      WHERE r.member_id = ?
      ORDER BY r.transaction_id DESC
    `, [req.params.memberId]);

    res.json(rows);
  } catch (error) {
    console.error('MEMBER_HISTORY_ERROR:', error);
    res.status(500).json({ error: 'MEMBER_HISTORY_FETCH_FAILED' });
  }
};

// @desc    Iproseso ang pagpapalawig o pagpapanibago ng membership account
// @route   POST /api/members/renew
exports.renewMember = async (req, res) => {
  const { member_id, plan_id, payment_status } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [planRows] = await connection.query(
      `SELECT plan_id, plan_name, price, duration_days FROM plans WHERE plan_id = ?`,
      [plan_id]
    );

    if (planRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'PLAN_NOT_FOUND' });
    }
    const plan = planRows[0];

    const [memberRows] = await connection.query(
      `SELECT member_id, expiry_date, status FROM members WHERE member_id = ?`,
      [member_id]
    );

    if (memberRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'MEMBER_NOT_FOUND' });
    }
    const member = memberRows[0];

    const todayStr = getLocalDateString(); 
    const currentExpiryStr = member.expiry_date ? getLocalDateString(new Date(member.expiry_date)) : null;

    // Mas malaki sa "ngayon" ibig sabihin may natitira pang araw (Active Extension)
    const isExtension = currentExpiryStr && currentExpiryStr > todayStr; 
    const duration = (plan_id === 'ONE_DAY' || Number(plan.duration_days) === 1) ? 1 : Number(plan.duration_days || 30);

    let newExpiryDate;

    if (isExtension) {
      // KUNG EXTENSION: Idagdag ang duration sa kasalukuyang expiry_date sa DB
      const [dateResult] = await connection.query(
        `SELECT DATE_FORMAT(DATE_ADD(?, INTERVAL ? DAY), '%Y-%m-%d') AS calculatedDate`,
        [member.expiry_date, duration]
      );
      newExpiryDate = dateResult[0].calculatedDate;
    } else {
      // KUNG EXPIRED NA / DAILY PASS RENEWAL: 
      // Ngayong araw sa Manila + duration ng plan. Kung 1 day, magiging bukas ang expiry.
      const [dateResult] = await connection.query(
        `SELECT DATE_FORMAT(DATE_ADD(DATE(CONVERT_TZ(NOW(), @@session.time_zone, '+08:00')), INTERVAL ? DAY), '%Y-%m-%d') AS calculatedDate`,
        [duration]
      );
      newExpiryDate = dateResult[0].calculatedDate;
    }

    await connection.query(
      `
      UPDATE members
      SET
        plan_id = ?,
        expiry_date = ?,
        status = 'Active',
        payment_status = ?
      WHERE member_id = ?
      `,
      [plan_id, newExpiryDate, payment_status || 'Paid', member_id]
    );

    const transactionType = isExtension ? 'EXTEND' : 'RENEW';

    await connection.query(
      `
      INSERT INTO renewal_logs
      (member_id, plan_id, amount_paid, payment_status, new_expiry_date)
      VALUES (?, ?, ?, ?, ?)
      `,
      [member_id, plan_id, plan.price, payment_status || 'Paid', newExpiryDate]
    );

    await connection.commit();

    res.json({
      message: isExtension ? 'MEMBER_PLAN_EXTENDED' : 'MEMBER_PLAN_RENEWED',
      type: transactionType,
      member_id,
      plan: plan.plan_name,
      newExpiryDate
    });

  } catch (error) {
    await connection.rollback();
    console.error('TRANSACTION_ERROR:', error);
    res.status(500).json({ error: 'RENEWAL_OR_EXTENSION_FAILED' });
  } finally {
    connection.release();
  }
};

// @desc    Magrehistro ng bagong miyembro/atleta sa matrix pipeline
// @route   POST /api/members
exports.createMember = async (req, res) => {
  const { name, email, plan_id, payment_status } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [planRows] = await connection.query(
      `SELECT plan_id, plan_name, price, duration_days FROM plans WHERE plan_id = ?`,
      [plan_id]
    );

    if (planRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'SELECTED_PLAN_NOT_FOUND' });
    }
    const plan = planRows[0];

    const randomDigits = Math.floor(100 + Math.random() * 900);
    const generatedMemberId = `IR-${randomDigits}`;

    const todayStr = getLocalDateString(); 
    const duration = (plan_id === 'ONE_DAY' || Number(plan.duration_days) === 1) ? 1 : Number(plan.duration_days || 30);

    // SQL-based calculation para sa bagong member registration expiration
    const [dateResult] = await connection.query(
      `SELECT DATE_FORMAT(DATE_ADD(DATE(CONVERT_TZ(NOW(), @@session.time_zone, '+08:00')), INTERVAL ? DAY), '%Y-%m-%d') AS calculatedDate`,
      [duration]
    );
    const formattedExpiryDate = dateResult[0].calculatedDate;

    await connection.query(
      `
      INSERT INTO members (member_id, name, email, plan_id, joined_date, expiry_date, status, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [generatedMemberId, name, email || null, plan_id, todayStr, formattedExpiryDate, 'Active', payment_status || 'Paid']
    );

    await connection.query(
      `
      INSERT INTO renewal_logs (member_id, plan_id, amount_paid, payment_status, new_expiry_date)
      VALUES (?, ?, ?, ?, ?)
      `,
      [generatedMemberId, plan_id, plan.price, payment_status || 'Paid', formattedExpiryDate]
    );

    await connection.commit();
    res.status(201).json({ status: 'success', memberId: generatedMemberId });

  } catch (error) {
    await connection.rollback();
    console.error('// CRITICAL_MEMBER_CREATION_FAILED:', error);
    res.status(500).json({ error: 'REGISTRATION_PIPELINE_FAILED' });
  } finally {
    connection.release();
  }
};