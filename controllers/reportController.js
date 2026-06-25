const db = require('../config/db');

// @desc    Gumawa ng malalim na operational sales financial report
// @route   GET /api/reports/sales
exports.getSalesReport = async (req, res) => {
  try {
    // 1. REVENUE (CURRENT MONTH)
    const [revenueRows] = await db.query(`
      SELECT IFNULL(SUM(amount_paid), 0) AS gross_revenue 
      FROM renewal_logs 
      WHERE LOWER(payment_status) = 'paid'
        AND YEAR(renewal_date) = YEAR(CURRENT_DATE())
        AND MONTH(renewal_date) = MONTH(CURRENT_DATE())
    `);

    // FIXED: Binubura ang dependency sa static status column para sa real-time accurate reflection
    // ACTIVE MEMBERS: Ang expiry date ay mas malaki o katumbas ng petsa ngayon sa Manila (+08:00)
    const [activeRows] = await db.query(`
      SELECT COUNT(*) AS live_active_nodes 
      FROM members 
      WHERE expiry_date > DATE(CONVERT_TZ(NOW(), @@session.time_zone, '+08:00'))
    `);

    // FIXED: EXPIRED MEMBERS: Ang expiry date ay lumipas o katumbas na ng araw na ito
    const [expiredRows] = await db.query(`
      SELECT COUNT(*) AS expired_system_locks 
      FROM members 
      WHERE expiry_date <= DATE(CONVERT_TZ(NOW(), @@session.time_zone, '+08:00'))
    `);

    // 4. SALES LEDGER
    const [ledgerRows] = await db.query(`
      SELECT
        r.transaction_id AS id,
        m.name,
        p.plan_name AS plan,
        -- FIXED: I-sync ang dynamic badge computation dito sa ledger preview
        CASE 
          WHEN m.expiry_date <= DATE(CONVERT_TZ(NOW(), @@session.time_zone, '+08:00')) THEN 'Expired'
          ELSE 'Active' 
        END AS status,
        r.payment_status AS payment,
        r.amount_paid,
        r.renewal_date AS createdAt  
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

// @desc    Kuhanin ang pangunahing billing at analytics para sa real-time admin metrics
// @route   GET /api/reports/metrics
exports.getDashboardMetrics = async (req, res) => {
  try {
    const [revenueRows] = await db.query(`
      SELECT IFNULL(SUM(amount_paid), 0) AS gross_revenue 
      FROM renewal_logs 
      WHERE LOWER(payment_status) = 'paid'
        AND YEAR(renewal_date) = YEAR(CURRENT_DATE())
        AND MONTH(renewal_date) = MONTH(CURRENT_DATE())
    `);
    
    // FIXED: Ikinabit ang parehong time-zone check para siguradong tumugma sa kabilang view
    const [activeRows] = await db.query(`
      SELECT COUNT(*) AS live_active_nodes 
      FROM members 
      WHERE expiry_date > DATE(CONVERT_TZ(NOW(), @@session.time_zone, '+08:00'))
    `);
    
    // FIXED: Ikinabit ang parehong time-zone check para siguradong tumugma sa kabilang view
    const [expiredRows] = await db.query(`
      SELECT COUNT(*) AS expired_system_locks 
      FROM members 
      WHERE expiry_date <= DATE(CONVERT_TZ(NOW(), @@session.time_zone, '+08:00'))
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