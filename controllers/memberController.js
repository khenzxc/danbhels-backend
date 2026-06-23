const db = require('../config/db');

// --- SAFE TIMEZONE HELPER (ASIA/MANILA) ---
const getLocalDateString = (dateObj = new Date()) => {
  return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
};

const getManilaDate = () => {
  const manilaStr = getLocalDateString(); 
  return new Date(manilaStr);
};

// @desc    Kuhanin ang buong listahan ng gym members
// @route   GET /api/members
exports.getMembers = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        m.member_id AS id, 
        m.name, 
        p.plan_name AS plan, 
        DATE_FORMAT(m.expiry_date, '%Y-%m-%d') AS expiryDate, 
        -- Tamang-tama ang `<=` mo rito. Pagpatak ng 12:00 AM ng araw ng expiry_date,
        -- papasok na siya sa 'Expired' status dahil kapantay na nito ang kasalukuyang petsa.
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

    // Active lang ang extension kung ang expiry date sa database ay mas malaki sa araw na ito
    const isExtension = currentExpiryStr && currentExpiryStr > todayStr; 

    let calculatedDate;
    const duration = (plan_id === 'ONE_DAY' || Number(plan.duration_days) === 1) ? 1 : Number(plan.duration_days || 30);

    if (isExtension) {
      // Kung nag-extend at Active pa, idugtong sa dulo ng lumang expiry ang duration
      calculatedDate = new Date(member.expiry_date);
      calculatedDate.setDate(calculatedDate.getDate() + duration);
    } else {
      // KUNG EXPIRED NA / DAILY PASS RENEWAL:
      // Magsisimula ngayon (e.g. June 23) + 1 araw (duration ng daily). Ang bagsak ay June 24.
      // Pagpatak ng 12:00 AM ng June 24, automatic na 'Expired' na siya agad sa system.
      calculatedDate = getManilaDate(); 
      calculatedDate.setDate(calculatedDate.getDate() + duration);
    }
    
    const newExpiryDate = getLocalDateString(calculatedDate);

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
  const { name, plan_id, payment_status } = req.body;
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
    let expiryDateObj = getManilaDate(); 

    // Kung 1 Day, magdadagdag ng eksaktong 1 araw para maging bukas ang expiry date.
    // Bukas ng 12:00 AM, automatic 'Expired' na ang status sa DB query.
    const duration = (plan_id === 'ONE_DAY' || Number(plan.duration_days) === 1) ? 1 : Number(plan.duration_days || 30);
    expiryDateObj.setDate(expiryDateObj.getDate() + duration);

    const formattedJoinedDate = todayStr;
    const formattedExpiryDate = getLocalDateString(expiryDateObj);

    await connection.query(
      `
      INSERT INTO members (member_id, name, plan_id, joined_date, expiry_date, status, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [generatedMemberId, name, plan_id, formattedJoinedDate, formattedExpiryDate, 'Active', payment_status || 'Paid']
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