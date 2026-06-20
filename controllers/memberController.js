const db = require('../config/db');

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
        m.status, 
        m.payment_status AS payment, 
        DATE_FORMAT(m.joined_date, '%Y-%m-%d') AS joined
      FROM members m
      LEFT JOIN plans p ON m.plan_id = p.plan_id
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      error: 'SYSTEM_ERROR: Fetching member ledger failed.',
      details: error.message 
    });
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

    const isExtension = currentExpiry &&
      currentExpiry > today &&
      member.status === 'Active' &&
      plan.plan_id !== 'ONE_DAY';

    if (isExtension) {
      baseDate = new Date(currentExpiry.getTime());
    } else {
      baseDate = today;
    }

    // 4. DAGDAGAN NG DURASYON NG PLANO
    baseDate.setDate(baseDate.getDate() + Number(plan.duration_days || 30));
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
// FIXED: Idinagdag ang createMember module upang maalis ang 404 block routing fail
exports.createMember = async (req, res) => {
  // Sinalo ang payment_status na pinadala ng AddMemberModal component layout
  const { name, plan_id, status, payment_status } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. KUNIN ANG IMPORMASYON NG PLANO UPANG MAKUHA ANG DURATION_DAYS
    const [planRows] = await connection.query(
      `SELECT plan_name, price, duration_days FROM plans WHERE plan_id = ?`,
      [plan_id]
    );

    if (planRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'SELECTED_PLAN_NOT_FOUND' });
    }
    const plan = planRows[0];

    // 2. KALKULAHIN ANG EXPIRY DATE MULA SA KASALUKUYANG ARAW (joined_date)
    const today = new Date();
    const expiryDateObj = new Date();
    expiryDateObj.setDate(today.getDate() + Number(plan.duration_days || 30));
    
    const formattedJoinedDate = today.toISOString().split('T')[0];
    const formattedExpiryDate = expiryDateObj.toISOString().split('T')[0];

    // 3. I-INSERT ANG BAGONG ATHLETE PROFILE RECORD SA ATING DATABASE
    const [insertResult] = await connection.query(
      `
      INSERT INTO members (name, plan_id, joined_date, expiry_date, status, payment_status)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [name, plan_id, formattedJoinedDate, formattedExpiryDate, status || 'Active', payment_status || 'Paid']
    );

    const newMemberId = insertResult.insertId;

    // 4. OPTIONAL: GUMAWA RIN NG ENTRY SA RENEWAL_LOGS PARA SA INITIAL PAYMENT TRANSACTION
    await connection.query(
      `
      INSERT INTO renewal_logs (member_id, plan_id, amount_paid, payment_status, new_expiry_date)
      VALUES (?, ?, ?, ?, ?)
      `,
      [newMemberId, plan_id, plan.price, payment_status || 'Paid', formattedExpiryDate]
    );

    await connection.commit();

    res.status(201).json({
      status: 'success',
      message: 'SYSTEM_LOG: New athlete profile deployed to core matrix.',
      memberId: newMemberId
    });

  } catch (error) {
    await connection.rollback();
    console.error('// CRITICAL_MEMBER_CREATION_FAILED:', error);
    res.status(500).json({ 
      error: 'REGISTRATION_PIPELINE_FAILED', 
      details: error.message 
    });
  } finally {
    connection.release();
  }
};