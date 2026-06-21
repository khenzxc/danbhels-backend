const db = require('../config/db');

// --- SAFE TIMEZONE HELPER (ASIA/MANILA) ---
// Sinasalba nito ang server-side UTC timezone drift ng Vercel / Render.
const getLocalDateString = (dateObj = new Date()) => {
  return dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  // Ang 'en-CA' ay direktang nagbibigay ng malinis na format na YYYY-MM-DD
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
        -- 1. Kapag ang expiry_date ay nakalipas na kumpara sa CURDATE(), 'Expired' na talaga siya.
        -- 2. Kapag ang expiry_date ay NGAYONG ARAW (Equal sa CURDATE()), at ito ay ONE_DAY pass,
        --    mananatili itong 'Active' buong araw at magiging 'Expired' paglampas ng 11:59 PM (bukas na araw).
        -- 3. Pinupuwersa din nitong maging 'Active' ang display status kung ang expiry_date ay valid pa kahit 'Expired' ang nakasulat sa row text.
        CASE 
          WHEN m.expiry_date < CURDATE() THEN 'Expired'
          WHEN m.expiry_date >= CURDATE() AND m.status = 'Expired' THEN 'Active'
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

    // 3. TAMANG PAGKUKALKULA NG RENEWAL/EXTENSION DATES
    const todayStr = getLocalDateString(); // Laging nakabase sa Manila Date (e.g. "2026-06-22")
    const currentExpiryStr = member.expiry_date ? getLocalDateString(new Date(member.expiry_date)) : null;

    // Ang extension ay mangyayari lamang kung ang member ay ACTIVE pa, mas mahaba ang expiry sa araw na ito,
    // at HINDI 'ONE_DAY' pass ang kanyang nirerenew.
    const isExtension = currentExpiryStr &&
      currentExpiryStr > todayStr &&
      member.status === 'Active' &&
      plan_id !== 'ONE_DAY' &&
      Number(plan.duration_days) !== 1;

    let baseDate = new Date();

    if (isExtension) {
      // Kung active extension, doon magsisimula ang dagdag sa dulo ng kanyang kasalukuyang expiry_date
      baseDate = new Date(member.expiry_date);
      baseDate.setDate(baseDate.getDate() + Number(plan.duration_days || 30));
    } else {
      // Kung expired na o bagong walk-in daily pass, magsisimula ang bilang NGAYONG ARAW.
      baseDate = new Date(); 

      // Kung HINDI daily pass, doon pa lang natin dadagdagan ng kaaukulang bilang ng araw.
      if (plan_id !== 'ONE_DAY' && Number(plan.duration_days) !== 1) {
        baseDate.setDate(baseDate.getDate() + Number(plan.duration_days || 30));
      }
      // NOTE: Kapag ONE_DAY, ang baseDate ay mananatiling petsa ngayon. 
      // Ise-save ito bilang expiry date ngayon upang gumana ang 11:59 PM expiration limit.
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

    // --- MANILA TIMEZONE - SAFE REGISTRATION DATE LOGIC ---
    const todayStr = getLocalDateString(); // Halimbawa: "2026-06-22"
    let expiryDateObj = new Date();

    // Kung ONE_DAY pass, ang nakatagong expiry date string ay kapareho lang ng araw na ito.
    if (plan_id === 'ONE_DAY' || Number(plan.duration_days) === 1) {
      // Mananatiling walang dagdag ang expiryDateObj para maging katumbas ng araw na ito
    } else {
      // Para sa mga Monthly, 3 Months, atbp.
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