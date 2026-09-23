const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../middleware/auth');
const { getMembers, getMemberHistory, renewMember, createMember, updateMember, deleteMember } = require('../controllers/memberController');

router.get('/', authenticate, requireRoles('admin', 'staff'), getMembers);
router.get('/:memberId/history', authenticate, requireRoles('admin', 'staff'), getMemberHistory);
router.post('/renew', authenticate, requireRoles('admin', 'staff'), renewMember);
router.post('/', authenticate, requireRoles('admin', 'staff'), createMember);
router.put('/:memberId', authenticate, requireRoles('admin'), updateMember);
router.patch('/:memberId', authenticate, requireRoles('admin'), updateMember);
router.delete('/:memberId', authenticate, requireRoles('admin'), deleteMember);

module.exports = router;