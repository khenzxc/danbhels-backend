const db = require('../config/db');

// @desc    Kuhanin ang listahan ng mga tagapagsanay/coaches
// @route   GET /api/coaches
exports.getCoaches = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT coach_id AS id, name, specialty, shift, status FROM coaches');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'DB_FETCH_FAILED' });
  }
};