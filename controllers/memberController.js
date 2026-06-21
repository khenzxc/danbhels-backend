const db = require('../config/db');

// @desc    Kuhanin ang buong listahan ng gym members
// @route   GET /api/members
exports.getMembers = async (req, res) => {
  try {
    // I-update ito sa loob ng exports.getMembers sa membersController.js
    const [rows] = await db.query(`
  SELECT 
    m.member_id AS id, 
    m.name, 
    p.plan_name AS plan, 
    DATE_FORMAT(m.expiry_date, '%Y-%m-%d') AS expiryDate, 
    -- SAFE TIMEZONE CHECK: Kung ang expiry_date ay mas mababa o katumbas na ng kasalukuyang petsa, 'Expired' na agad
    CASE 
      WHEN m.expiry_date < CURDATE() THEN 'Expired'
      WHEN m.expiry_date = CURDATE() AND p.duration_days = 1 THEN 'Expired' -- Kung 1 day pass at araw na ng expiry, expired na dapat ngayong araw
      ELSE m.status 
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

    // 1. KUNIN ANG PLANO (SOURCE OF TRUTH)
    const [planRows] = await connection.query(
      `SELECT plan_id, plan_name, price, duration_days FROM plans WHERE plan_id = ?`,
      [plan_id]
    );

    if (planRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'PLAN_NOT_FOUND' });
    }
    const plan = planRows[0];

    // 2. KUNIN ANG KASALUKUYANG STATUS NG MEMBER
    const [memberRows] = await connection.query(
      `SELECT member_id, expiry_date, status FROM members WHERE member_id = ?`,
      [member_id]
    );

    if (memberRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'MEMBER_NOT_FOUND' });
    }
    const member = memberRows[0];

    // 3. LOGIC GAP FIX: IALAM KUNG EXTEND O RENEW
    let baseDate = new Date();
    const today = new Date();
    const currentExpiry = member.expiry_date ? new Date(member.expiry_date) : null;

    // Kung active pa at hindi ONE_DAY, pwede siyang magpa-extend ng araw sa dulo ng kasalukuyang expiry niya
    const isExtension = currentExpiry &&
      currentExpiry > today &&
      member.status === 'Active' &&
      plan_id !== 'ONE_DAY';

    if (isExtension) {
      baseDate = new Date(currentExpiry.getTime());
      // Dagdagan ng araw base sa piniling plano (30 days, etc.)
      baseDate.setDate(baseDate.getDate() + Number(plan.duration_days || 30));
    } else {
      // Kung bagong renew (expired na siya) O kaya nag-avail ng ONE_DAY pass ngayon:
      baseDate = today;

      // KUNG HINDI ONE_DAY, tsaka lang natin dadagdagan ng mga araw. 
      // Kung ONE_DAY, mananatiling 'today' ang petsa para mag-expire mamayang 11:59 PM (hatinggabi).
      if (plan_id !== 'ONE_DAY' && Number(plan.duration_days) !== 1) {
        baseDate.setDate(baseDate.getDate() + Number(plan.duration_days || 30));
      }
    }
    const newExpiryDate = baseDate.toISOString().split('T')[0];

    // 5. I-UPDATE ANG PROFILING NG GYM MEMBER
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

    // 6. I-REHISTRO SA TRANSACTION AUDIT TRAIL (RENEWAL_LOGS)
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
  const { name, plan_id, status, payment_status } = req.body;
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

    // --- BAGONG LOGIC PARA SA PETSA ---
    const today = new Date();
    const expiryDateObj = new Date();

    // KUNG ANG PLAN_ID AY PARA SA DAILY PASS / 1 DAY
    if (plan_id === 'ONE_DAY' || Number(plan.duration_days) === 1) {
      // Ang expiry_date ay ngayon ding araw na 'to, para pagpatak ng 12:00 AM bukas, EXPIRED na siya.
      expiryDateObj.setDate(today.getDate());
    } else {
      // Normal na dagdag ng araw para sa mga buwanang plano (30 days, etc.)
      expiryDateObj.setDate(today.getDate() + Number(plan.duration_days || 30));
    }

    const formattedJoinedDate = today.toISOString().split('T')[0];
    const formattedExpiryDate = expiryDateObj.toISOString().split('T')[0];
    // ---------------------------------

    await connection.query(
      `
      INSERT INTO members (member_id, name, plan_id, joined_date, expiry_date, status, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [generatedMemberId, name, plan_id, formattedJoinedDate, formattedExpiryDate, status || 'Active', payment_status || 'Paid']
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