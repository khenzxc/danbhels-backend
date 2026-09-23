const db = require('../config/db');

// @desc    Kuhanin ang buong listahan ng gym coaches sa ledger
// @route   GET /api/coaches
exports.getCoaches = async (req, res) => {
  try {
    // ALIGNMENT FIX: Isinama ang 'coach_id AS id' para eksaktong tumugma sa key loops ng iyong frontend component views
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
  const name = String(req.body.name || '').trim();
  const specialty = String(req.body.specialty || '').trim();
  const shift = String(req.body.shift || '').trim();
  const status = req.body.status === 'On Leave' ? 'On Leave' : 'Active';
  if (!name || !specialty || !shift) return res.status(400).json({ error: 'COACH_DETAILS_REQUIRED' });
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. GENERATE CUSTOM 'CH-' PREFIX COACH_ID (Dahil VARCHAR at hindi auto-increment base sa Workbench)
    let generatedCoachId;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const randomDigits = Math.floor(100 + Math.random() * 900);
      const candidate = `CH-${randomDigits}`;
      const [existing] = await connection.query('SELECT coach_id FROM coaches WHERE coach_id = ? LIMIT 1', [candidate]);
      if (!existing.length) {
        generatedCoachId = candidate;
        break;
      }
    }
    if (!generatedCoachId) {
      await connection.rollback();
      return res.status(500).json({ error: 'COACH_ID_GENERATION_FAILED' });
    }

    // 2. DATABASE DEPLOYMENT OPERATION INSERTION
    await connection.query(
      `
      INSERT INTO coaches (coach_id, name, specialty, shift, status)
      VALUES (?, ?, ?, ?, ?)
      `,
      [generatedCoachId, name, specialty, shift, status]
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
    res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({
      error: error.code === 'ER_DUP_ENTRY' ? 'COACH_ALREADY_EXISTS' : 'COACH_REGISTRATION_PIPELINE_FAILED'
    });
  } finally {
    connection.release();
  }
};

// @route   PUT /api/coaches/:id
exports.updateCoach = async (req, res) => {
  const specialty = String(req.body.specialty || '').trim();
  const shift = String(req.body.shift || '').trim();
  const status = req.body.status === 'On Leave' ? 'On Leave' : 'Active';
  if (!specialty || !shift) return res.status(400).json({ error: 'COACH_DETAILS_REQUIRED' });

  try {
    const [result] = await db.query(
      'UPDATE coaches SET specialty = ?, shift = ?, status = ? WHERE coach_id = ?',
      [specialty, shift, status, req.params.id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'COACH_NOT_FOUND' });
    res.json({ message: 'COACH_UPDATED' });
  } catch (error) {
    console.error('// COACH_UPDATE_FAILED:', error);
    res.status(500).json({ error: 'COACH_UPDATE_FAILED' });
  }
};

// @route   DELETE /api/coaches/:id
exports.deleteCoach = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM coaches WHERE coach_id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'COACH_NOT_FOUND' });
    res.json({ message: 'COACH_DELETED' });
  } catch (error) {
    console.error('// COACH_DELETE_FAILED:', error);
    res.status(500).json({ error: 'COACH_DELETE_FAILED' });
  }
};