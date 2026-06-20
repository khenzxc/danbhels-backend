const db = require('../config/db');

// @desc    Kuhanin ang buong listahan ng gym coaches sa ledger
// @route   GET /api/coaches
exports.getCoaches = async (req, res) => {
  try {
    // ALIGNMENT FIX: Ginawang 'coach_id AS id' upang direktang pumasok sa key mapping ng frontend React views
    const [rows] = await db.query(`
      SELECT 
        coach_id AS id, 
        name, 
        specialty, 
        shift, 
        status 
      FROM coaches
    `);
    res.json(rows);
  } catch (error) {
    console.error("// LEDGER_FETCH_ERROR:", error);
    res.status(500).json({ error: 'SYSTEM_ERROR: Fetching coach roster failed.' });
  }
};

// @desc    Magrehistro ng bagong coach/trainer sa system core matrix
// @route   POST /api/coaches
exports.createCoach = async (req, res) => {
  const { name, specialty, shift, status } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. GENERATE CUSTOM 'CH-' PREFIX COACH_ID (Dahil VARCHAR at hindi auto-increment base sa Workbench)
    const randomDigits = Math.floor(100 + Math.random() * 900); // 3-digit hash engine logs
    const generatedCoachId = `CH-${randomDigits}`;

    // 2. DATABASE DEPLOYMENT OPERATION INSERTION
    await connection.query(
      `
      INSERT INTO coaches (coach_id, name, specialty, shift, status)
      VALUES (?, ?, ?, ?, ?)
      `,
      [generatedCoachId, name, specialty, shift, status || 'Active']
    );

    await connection.commit();

    res.status(201).json({
      status: 'success',
      message: 'SYSTEM_LOG: Trainer profile successfully registered in cluster.',
      coachId: generatedCoachId
    });

  } catch (error) {
    await connection.rollback();
    console.error('// CRITICAL_COACH_CREATION_FAILED:', error);
    res.status(500).json({
      error: 'COACH_REGISTRATION_PIPELINE_FAILED',
      details: error.message
    });
  } finally {
    connection.release();
  }
};
};s