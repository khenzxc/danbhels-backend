const express = require('express');
const router = express.Router();
const { getMembers, renewMember } = require('../controllers/memberController');

router.get('/', getMembers);
router.post('/renew', renewMember);

module.exports = router;