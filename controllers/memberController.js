const db = require('../config/db');

// --- SAFE TIMEZONE HELPER (ASIA/MANILA) ---
const getLocalDateString = (dateObj = new Date()) => {
  return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  // Nagbabalik ng format na YYYY-MM-DD base sa oras sa Pilipinas
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
        -- TAMANG EXPIRY QUERY LOGIC:
        -- 1. Kapag ang expiry_date ay mas mababa sa kasalukuyang petsa (CURDATE()), 'Expired' na talaga siya.
        -- 2. Kung ang expiry_date ay katumbas o higit pa sa CURDATE(), awtomatiko siyang 'Active' sa frontend.
        CASE 
          WHEN m.expiry_date < CURDATE() THEN 'Expired'
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

    // 3. CRITICAL LOGIC FIX: EXTEND VS NEW RENEWAL
    const todayStr = getLocalDateString(); 
    const currentExpiryStr = member.expiry_date ? getLocalDateString(new Date(member.expiry_date)) : null;

    // MAG-EEXTEND LANG: Kung may expiry date siya, HINDI pa ito lumalagpas sa araw na ito,
    // at HINDI 'ONE_DAY' pass ang binibili niya.
    const isExtension = currentExpiryStr && 
                        currentExpiryStr >= todayStr && 
                        member.status !== 'Expired';

    let calculatedDate;

    if (isExtension) {
      // === KUNG HINDI PA EXPIRED (MAG-EEXTEND SA DULO NG LUMANG EXPIRY) ===
      calculatedDate = new Date(member.expiry_date);
      calculatedDate.setDate(calculatedDate.getDate() + Number(plan.duration_days || 30));
    } else {
      // === KUNG EXPIRED NA (MAGSISISIMULA NGAYONG ARAW ANG BILANG) ===
      calculatedDate = new Date(); // Petsa Ngayon

      // Kung regular plan (30 days, 6 months, etc.), magdagdag ng araw mula NGAYONG ARAW.
      // Kung ONE_DAY o 1 day duration, mananatili itong ngayong araw para mag-expire mamayang 11:59 PM.
      if (plan_id !== 'ONE_DAY' && Number(plan.duration_days) !== 1) {
        calculatedDate.setDate(calculatedDate.getDate() + Number(plan.duration_days || 30));
      }
    }
    
    const newExpiryDate = getLocalDateString(calculatedDate);

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

    // --- MANILA TIMEZONE LOGIC PARA SA BAGONG MEMBER ---
    const todayStr = getLocalDateString(); 
    let expiryDateObj = new Date(); // Magsisimula ngayon ang bilang ng bagong gawa

    // Kung ONE_DAY o duration ay 1, ang expiry_date ay magiging "Ngayong araw" din.
    if (plan_id === 'ONE_DAY' || Number(plan.duration_days) === 1) {
      // Walang dadagdagang araw para mag-expire mamayang hatinggabi.
    } else {
      // Magdaragdag ng araw mula sa kasalukuyang petsa.
      expiryDateObj.setDate(expiryDateObj.getDate() + Number(plan.duration_days || 30));
    }

    const formattedJoinedDate = todayStr;
    const formattedExpiryDate = getLocalDateString(expiryDateObj);
    // -----------------------------------------------------

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