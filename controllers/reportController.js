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
        AND voided_at IS NULL
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
        CASE WHEN r.voided_at IS NULL THEN r.payment_status ELSE 'Voided' END AS payment,
        r.amount_paid,
        'membership' AS transactionType,
        r.voided_at AS voidedAt,
        r.void_reason AS voidReason,
        r.renewal_date AS createdAt  
      FROM renewal_logs r
      LEFT JOIN members m ON r.member_id = m.member_id
      LEFT JOIN plans p ON r.plan_id = p.plan_id
      ORDER BY r.transaction_id DESC
      LIMIT 50
    `);

    const [productLedgerRows] = await db.query(`
      SELECT
        s.sale_id AS id,
        i.name,
        'Product sale' AS plan,
        CASE WHEN s.voided_at IS NULL THEN 'Paid' ELSE 'Voided' END AS payment,
        s.total_amount AS amount_paid,
        'product' AS transactionType,
        s.item_id AS itemId,
        s.quantity,
        s.unit_price AS unitPrice,
        s.voided_at AS voidedAt,
        s.void_reason AS voidReason,
        s.sold_at AS createdAt
      FROM product_sales s
      JOIN inventory_items i ON i.item_id = s.item_id
      ORDER BY s.sale_id DESC
      LIMIT 50
    `);

    const [productRevenueRows] = await db.query(`
      SELECT IFNULL(SUM(total_amount), 0) AS product_revenue
      FROM product_sales
      WHERE YEAR(sold_at) = YEAR(CURRENT_DATE())
        AND MONTH(sold_at) = MONTH(CURRENT_DATE())
        AND voided_at IS NULL
    `);
    const membershipRevenue = Number(revenueRows[0].gross_revenue);
    const productRevenue = Number(productRevenueRows[0].product_revenue);
    const combinedLedger = [...ledgerRows, ...productLedgerRows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      gross_revenue: revenueRows[0].gross_revenue,
      membership_revenue: membershipRevenue,
      product_revenue: productRevenue,
      combined_revenue: membershipRevenue + productRevenue,
      live_active_nodes: activeRows[0].live_active_nodes,
      expired_system_locks: expiredRows[0].expired_system_locks,
      ledger: combinedLedger,
      membership_ledger: ledgerRows,
      product_ledger: productLedgerRows
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
    const requestedDays = Number.parseInt(req.query.days, 10);
    const trendDays = [7, 30, 90].includes(requestedDays) ? requestedDays : 7;
    const trendType = ['combined', 'membership', 'products'].includes(req.query.type) ? req.query.type : 'combined';

    const [revenueRows] = await db.query(`
      SELECT
        IFNULL(SUM(CASE WHEN LOWER(payment_status) = 'paid' AND voided_at IS NULL AND DATE(renewal_date) = CURRENT_DATE() THEN amount_paid ELSE 0 END), 0) AS daily_income,
        IFNULL(SUM(CASE WHEN LOWER(payment_status) = 'paid' AND voided_at IS NULL AND YEAR(renewal_date) = YEAR(CURRENT_DATE()) AND MONTH(renewal_date) = MONTH(CURRENT_DATE()) THEN amount_paid ELSE 0 END), 0) AS monthly_income,
        IFNULL(SUM(CASE WHEN LOWER(payment_status) = 'paid' AND voided_at IS NULL THEN amount_paid ELSE 0 END), 0) AS lifetime_income
      FROM renewal_logs 
    `);

    const [productRevenueRows] = await db.query(`
      SELECT
        IFNULL(SUM(CASE WHEN voided_at IS NULL AND DATE(sold_at) = CURRENT_DATE() THEN total_amount ELSE 0 END), 0) AS product_daily_income,
        IFNULL(SUM(CASE WHEN voided_at IS NULL AND YEAR(sold_at) = YEAR(CURRENT_DATE()) AND MONTH(sold_at) = MONTH(CURRENT_DATE()) THEN total_amount ELSE 0 END), 0) AS product_monthly_income
      FROM product_sales
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

    const [memberRows] = await db.query(`
      SELECT
        COUNT(*) AS total_members,
        SUM(joined_date = CURRENT_DATE()) AS new_members_today,
        SUM(YEAR(joined_date) = YEAR(CURRENT_DATE()) AND MONTH(joined_date) = MONTH(CURRENT_DATE())) AS new_members_this_month,
        SUM(expiry_date > CURRENT_DATE() AND expiry_date <= DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)) AS expiring_soon
      FROM members
    `);

    const trendSources = {
      membership: `
        SELECT DATE(renewal_date) AS day, SUM(amount_paid) AS sales
        FROM renewal_logs
        WHERE LOWER(payment_status) = 'paid'
          AND voided_at IS NULL
          AND renewal_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${trendDays - 1} DAY)
        GROUP BY DATE(renewal_date)
      `,
      products: `
        SELECT DATE(sold_at) AS day, SUM(total_amount) AS sales
        FROM product_sales
        WHERE voided_at IS NULL
          AND sold_at >= DATE_SUB(CURRENT_DATE(), INTERVAL ${trendDays - 1} DAY)
        GROUP BY DATE(sold_at)
      `
    };
    const dailySalesQuery = trendType === 'combined'
      ? `${trendSources.membership} UNION ALL ${trendSources.products}`
      : trendSources[trendType];

    const [trendRows] = await db.query(`
      WITH RECURSIVE dates AS (
        SELECT CURRENT_DATE() AS day
        UNION ALL
        SELECT DATE_SUB(day, INTERVAL 1 DAY)
        FROM dates
        WHERE day > DATE_SUB(CURRENT_DATE(), INTERVAL ${trendDays - 1} DAY)
      ), daily_sales AS (
        ${dailySalesQuery}
      )
      SELECT
        dates.day,
        COALESCE(SUM(daily_sales.sales), 0) AS sales
      FROM dates
      LEFT JOIN daily_sales ON daily_sales.day = dates.day
      GROUP BY dates.day
      ORDER BY dates.day ASC
    `);

    res.json({
      gross_revenue: revenueRows[0].monthly_income,
      daily_income: revenueRows[0].daily_income,
      monthly_income: revenueRows[0].monthly_income,
      lifetime_income: revenueRows[0].lifetime_income,
      product_daily_income: productRevenueRows[0].product_daily_income,
      product_monthly_income: productRevenueRows[0].product_monthly_income,
      live_active_nodes: activeRows[0].live_active_nodes,
      expired_system_locks: expiredRows[0].expired_system_locks,
      total_members: memberRows[0].total_members || 0,
      new_members_today: memberRows[0].new_members_today || 0,
      new_members_this_month: memberRows[0].new_members_this_month || 0,
      expiring_soon: memberRows[0].expiring_soon || 0,
      trend_days: trendDays,
      trend: trendRows
    });
  } catch (error) {
    console.error('METRICS_ERROR:', error);
    res.status(500).json({ error: 'METRICS_FETCH_FAILED' });
  }
};

exports.updateTransaction = async (req, res) => {
  const transactionType = req.body.transactionType;
  const transactionId = Number(req.params.transactionId);
  if (!Number.isInteger(transactionId) || transactionId < 1) return res.status(400).json({ error: 'TRANSACTION_ID_REQUIRED' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    if (req.body.operation === 'void') {
      const reason = String(req.body.reason || '').trim().slice(0, 255);
      if (!reason) {
        await connection.rollback();
        return res.status(400).json({ error: 'VOID_REASON_REQUIRED' });
      }
      if (transactionType === 'membership') {
        const [transactionRows] = await connection.query(
          'SELECT member_id FROM renewal_logs WHERE transaction_id = ? AND voided_at IS NULL FOR UPDATE',
          [transactionId]
        );
        if (!transactionRows.length) {
          await connection.rollback();
          return res.status(404).json({ error: 'TRANSACTION_NOT_FOUND_OR_ALREADY_VOIDED' });
        }

        const memberId = transactionRows[0].member_id;
        const [result] = await connection.query('UPDATE renewal_logs SET voided_at = CURRENT_TIMESTAMP, void_reason = ? WHERE transaction_id = ? AND voided_at IS NULL', [reason, transactionId]);
        if (!result.affectedRows) {
          await connection.rollback();
          return res.status(404).json({ error: 'TRANSACTION_NOT_FOUND_OR_ALREADY_VOIDED' });
        }

        const [previousRows] = await connection.query(
          `SELECT plan_id, payment_status, new_expiry_date
           FROM renewal_logs
           WHERE member_id = ? AND voided_at IS NULL
           ORDER BY renewal_date DESC, transaction_id DESC
           LIMIT 1`,
          [memberId]
        );

        if (previousRows.length) {
          const previous = previousRows[0];
          await connection.query(
            `UPDATE members
             SET plan_id = ?, expiry_date = ?, payment_status = ?,
                 status = CASE WHEN ? <= DATE(CONVERT_TZ(NOW(), @@session.time_zone, '+08:00')) THEN 'Expired' ELSE 'Active' END
             WHERE member_id = ?`,
            [previous.plan_id, previous.new_expiry_date, previous.payment_status, previous.new_expiry_date, memberId]
          );
        } else {
          await connection.query(
            `UPDATE members
             SET expiry_date = joined_date, payment_status = 'Pending', status = 'Expired'
             WHERE member_id = ?`,
            [memberId]
          );
        }
      } else if (transactionType === 'product') {
        const [sales] = await connection.query('SELECT item_id, quantity FROM product_sales WHERE sale_id = ? AND voided_at IS NULL FOR UPDATE', [transactionId]);
        if (!sales.length) {
          await connection.rollback();
          return res.status(404).json({ error: 'TRANSACTION_NOT_FOUND_OR_ALREADY_VOIDED' });
        }
        await connection.query('UPDATE inventory_items SET quantity = quantity + ? WHERE item_id = ?', [sales[0].quantity, sales[0].item_id]);
        await connection.query('UPDATE product_sales SET voided_at = CURRENT_TIMESTAMP, void_reason = ? WHERE sale_id = ?', [reason, transactionId]);
      } else {
        await connection.rollback();
        return res.status(400).json({ error: 'TRANSACTION_TYPE_REQUIRED' });
      }
      await connection.commit();
      return res.json({ message: 'TRANSACTION_VOIDED', transactionType, voidReason: reason });
    }

    await connection.rollback();
    return res.status(400).json({ error: 'TRANSACTION_EDIT_DISABLED_USE_VOID' });

  } catch (error) {
    await connection.rollback();
    console.error('TRANSACTION_UPDATE_ERROR:', error);
    res.status(500).json({ error: 'TRANSACTION_UPDATE_FAILED' });
  } finally {
    connection.release();
  }
};