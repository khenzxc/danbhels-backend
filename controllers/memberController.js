const db = require('../config/db');

// Helper function para makuha ang Local Date YYYY-MM-DD (Umiwas sa UTC ISOString bug)
const getLocalDateString = (dateObj) => {
  const offset = dateObj.getTimezoneOffset();
  const localDate = new Date(dateObj.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
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
        -- KUNG KASALUKUYANG ARAW O NAKARAAN NA: Expired na agad pagpatak ng araw na 'yun o pag lumipas na
        CASE 
          WHEN m.expiry_date < CURDATE() THEN 'Expired'
          WHEN m.expiry_date = CURDATE() AND (p.plan_id = 'ONE_DAY' OR p.duration_days = 1) THEN 'Expired'
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

    // 1. KUNIN ANG PLANO
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

// 3. LOGIC FIX: TAMANG PAGKUKALKULA NG RENEWAL PARA SA DAILY PASS
    let baseDate = new Date(); // KUKUHA NG PETSA NGAYON (Local Server Time)
    const todayStr = getLocalDateString(baseDate);
    const currentExpiryStr = member.expiry_date ? getLocalDateString(new Date(member.expiry_date)) : null;

    // Tingnan kung Active pa ang account AT magpapalawig lang (Hindi ONE_DAY)
    const isExtension = currentExpiryStr &&
      currentExpiryStr > todayStr &&
      member.status === 'Active' &&
      plan_id !== 'ONE_DAY' &&
      Number(plan.duration_days) !== 1;

    if (isExtension) {
      // KUNG ACTIVE PA AT EXTENSION: Doon magsisimula ang dagdag sa dulo ng kasalukuyang expiry_date
      baseDate = new Date(member.expiry_date);
      baseDate.setDate(baseDate.getDate() + Number(plan.duration_days || 30));
    } else {
      // KUNG EXPIRED NA AT RENEWAL (Dito papasok ang Daily Pass mo):
      // Ang baseDate ay itatakda NATIN NGAYONG ARAW.
      baseDate = new Date(); 

      // Kung HINDI daily pass (e.g., 30 days, 60 days), tsaka lang natin dadagdagan ng araw ang baseDate.
      if (plan_id !== 'ONE_DAY' && Number(plan.duration_days) !== 1) {
        baseDate.setDate(baseDate.getDate() + Number(plan.duration_days || 30));
      }
      // NOTE: Kung ONE_DAY pass ito, HINDI natin dadagdagan ang araw. 
      // Ang baseDate ay mananatiling "PETSA NGAYON". Dahil dito, ang expiry_date niya ay magiging "NGAYON".
      // Ibig sabihin, VALID siya buong araw na ito at mag-eexpire pagpatak ng 12:00 AM bukas.
    }
    
    const newExpiryDate = getLocalDateString(baseDate);

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

    // 6. I-REHISTRO SA TRANSACTION AUDIT TRAIL
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

    // --- FIX: SAFE LOCAL DATE LOGIC ---
    const today = new Date();
    const expiryDateObj = new Date();

    // Kung ONE_DAY o duration ay 1, ang expiry_date ay "Ngayong araw" din.
    if (plan_id === 'ONE_DAY' || Number(plan.duration_days) === 1) {
      // Hindi gagalawin ang expiryDateObj, ibig sabihin itatakda ito sa petsa NGAYON.
      expiryDateObj.setDate(today.getDate());
    } else {
      // Kung buwanan o higit pa, doon lang magdadagdag ng araw.
      expiryDateObj.setDate(today.getDate() + Number(plan.duration_days || 30));
    }

    const formattedJoinedDate = getLocalDateString(today);
    const formattedExpiryDate = getLocalDateString(expiryDateObj);
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