const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate, requireRoles } = require('../middleware/auth');
const {
  login,
  me,
  updateProfile,
  changePassword,
  listStaff,
  createStaff,
  updateStaffStatus
} = require('../controllers/authController');

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

router.post('/login', loginLimiter, login);
router.get('/me', authenticate, me);
router.put('/profile', authenticate, updateProfile);
router.put('/password', authenticate, changePassword);
router.get('/staff', authenticate, requireRoles('admin'), listStaff);
router.post('/staff', authenticate, requireRoles('admin'), createStaff);
router.patch('/staff/:id/status', authenticate, requireRoles('admin'), updateStaffStatus);

module.exports = router;