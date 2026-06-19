const db = require('../config/db');

// @desc    Gumawa ng malalim na operational sales financial report
// @route   GET /api/reports/sales
exports.getSalesReport = async (req, res) => {
  try {
    // TOTAL REVENUE
    const [revenueRows] = await db.query(`
      SELECT IFNULL(SUM(amount_paid), 0) AS gross_revenue FROM renewal_logs WHERE LOWER(payment_status) = 'paid'
    `);
    
    // ACTIVE MEMBERS
    const [activeRows] = await db.query(`
      SELECT COUNT(*) AS live_active_nodes FROM members WHERE LOWER(status) = 'active'
    `);
    
    // EXPIRED MEMBERS
    const [expiredRows] = await db.query(`
      SELECT COUNT(*) AS expired_system_locks FROM members WHERE LOWER(status) = 'expired'
    `);

    // SALES LEDGER
    const [ledgerRows] = await db.query(`
      SELECT
        r.transaction_id AS id,
        m.name,
        p.plan_name AS plan,
        m.status,
        r.payment_status AS payment,
        r.amount_paid
      FROM renewal_logs r
      LEFT JOIN members m ON r.member_id = m.member_id
      LEFT JOIN plans p ON r.plan_id = p.plan_id
      ORDER BY r.transaction_id DESC
      LIMIT 50
    `);

    res.json({
      gross_revenue: revenueRows[0].gross_revenue,
      live_active_nodes: activeRows[0].live_active_nodes,
      expired_system_locks: expiredRows[0].expired_system_locks,
      ledger: ledgerRows
    });
  } catch (error) {
    console.error('SALES_REPORT_ERROR:', error);
    res.status(500).json({ error: 'SALES_REPORT_GENERATION_FAILED' });
  }
};

// @desc    Kuhanin ang pangunahing bilang at analytics para sa real-time admin metrics
// @route   GET /api/reports/metrics
exports.getDashboardMetrics = async (req, res) => {
  try {
    const [revenueRows] = await db.query(`
      SELECT IFNULL(SUM(amount_paid), 0) AS gross_revenue FROM renewal_logs WHERE LOWER(payment_status) = 'paid'
    `);
    const [activeRows] = await db.query(`
      SELECT COUNT(*) AS live_active_nodes FROM members WHERE LOWER(status) = 'active'
    `);
    const [expiredRows] = await db.query(`
      SELECT COUNT(*) AS expired_system_locks FROM members WHERE LOWER(status) = 'expired'
    `);

    res.json({
      gross_revenue: revenueRows[0].gross_revenue,
      live_active_nodes: activeRows[0].live_active_nodes,
      expired_system_locks: expiredRows[0].expired_system_locks
    });
  } catch (error) {
    console.error('METRICS_ERROR:', error);
    res.status(500).json({ error: 'METRICS_FETCH_FAILED' });
  }
};