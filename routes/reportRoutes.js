const express = require('express');
const router = express.Router();
const { getSalesReport, getDashboardMetrics } = require('../controllers/reportController');

router.get('/sales', getSalesReport);
router.get('/metrics', getDashboardMetrics);

module.exports = router;