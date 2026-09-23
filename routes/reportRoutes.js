const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../middleware/auth');
const { getSalesReport, getDashboardMetrics, updateTransaction } = require('../controllers/reportController');

router.get('/sales', authenticate, requireRoles('admin', 'staff'), getSalesReport);
router.get('/metrics', authenticate, requireRoles('admin', 'staff'), getDashboardMetrics);
router.patch('/sales/:transactionId', authenticate, requireRoles('admin', 'staff'), updateTransaction);

module.exports = router;