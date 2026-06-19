const db = require('../config/db');

// @desc    Kuhanin ang lahat ng available membership plans
// @route   GET /api/plans
exports.getPlans = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT plan_id, plan_name, category, price, duration_days FROM plans ORDER BY category, plan_name
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'PLAN_FETCH_FAILED' });
  }
};

// @desc    Gumawa ng bagong fitness program plan
// @route   POST /api/plans
exports.createPlan = async (req, res) => {
  try {
    const { plan_name, category, price, duration_days, duration_type } = req.body;
    const planId = plan_name.toUpperCase().replace(/\s+/g, '_');

    await db.query(
      `
      INSERT INTO plans (plan_id, plan_name, category, price, duration_days, duration_type)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [planId, plan_name, category, price, duration_days, duration_type]
    );
    res.json({ message: 'PLAN_CREATED' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'PLAN_CREATE_FAILED' });
  }
};

// @desc    I-update ang presyo ng lumang plano
// @route   PUT /api/plans/:id
exports.updatePlanPrice = async (req, res) => {
  try {
    const { price } = req.body;
    await db.query('UPDATE plans SET price = ? WHERE plan_id = ?', [price, req.params.id]);
    res.json({ message: 'PLAN_UPDATED' });
  } catch (error) {
    res.status(500).json({ error: 'PLAN_UPDATE_FAILED' });
  }
};

// @desc    Burahin ang plano kung walang naka-enroll na miyembro
// @route   DELETE /api/plans/:id
exports.deletePlan = async (req, res) => {
  try {
    const planId = req.params.id;
    const [members] = await db.query('SELECT COUNT(*) AS total FROM members WHERE plan_id = ?', [planId]);

    if (members[0].total > 0) {
      return res.status(400).json({ error: 'PLAN_IN_USE' });
    }

    await db.query('DELETE FROM plans WHERE plan_id = ?', [planId]);
    res.json({ message: 'PLAN_DELETED' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'PLAN_DELETE_FAILED' });
  }
};