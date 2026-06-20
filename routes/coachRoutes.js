const express = require('express');
const router = express.Router();
// Isinama ang createCoach handler mula sa controller matrix
const { getCoaches, createCoach } = require('../controllers/coachController');

router.get('/', getCoaches);

// PIPELINE NODE: Saluhin ang POST request para sa pag-add ng coach
router.post('/', createCoach);

module.exports = router;