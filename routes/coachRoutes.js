const express = require('express');
const router = express.Router();
const { getCoaches, createCoach } = require('../controllers/coachController');

// @pipeline  GET /api/coaches
router.get('/', getCoaches);

// @pipeline  POST /api/coaches
router.post('/', createCoach);

module.exports = router;