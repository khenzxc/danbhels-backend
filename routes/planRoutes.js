const express = require('express');
const router = express.Router();
const { getPlans, createPlan, updatePlanPrice, deletePlan } = require('../controllers/planController');

router.get('/', getPlans);
router.post('/', createPlan);
router.put('/:id', updatePlanPrice);
router.delete('/:id', deletePlan);

module.exports = router;