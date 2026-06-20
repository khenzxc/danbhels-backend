const express = require('express');
const router = express.Router();
// FIXED: Idinagdag ang createMember handler mula sa iyong controller controller node
const { getMembers, renewMember, createMember } = require('../controllers/memberController');

router.get('/', getMembers);
router.post('/renew', renewMember);

// FIXED GATEWAY Node: Para sa "POST /api/members" na tinatawagan ng AddMemberModal
router.post('/', createMember);

module.exports = router;