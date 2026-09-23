const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../middleware/auth');
const { getPlans, createPlan, updatePlanPrice, deletePlan } = require('../controllers/planController');

router.get('/', getPlans);
router.post('/', authenticate, requireRoles('admin', 'staff'), createPlan);
router.put('/:id', authenticate, requireRoles('admin', 'staff'), updatePlanPrice);
router.delete('/:id', authenticate, requireRoles('admin', 'staff'), deletePlan);

module.exports = router;