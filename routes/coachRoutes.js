const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../middleware/auth');
const { getCoaches, createCoach, updateCoach, deleteCoach } = require('../controllers/coachController');

// @pipeline  GET /api/coaches
router.get('/', getCoaches);

// @pipeline  POST /api/coaches
router.post('/', authenticate, requireRoles('admin'), createCoach);
router.put('/:id', authenticate, requireRoles('admin'), updateCoach);
router.delete('/:id', authenticate, requireRoles('admin'), deleteCoach);

module.exports = router;