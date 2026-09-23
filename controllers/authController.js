const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { getSecret } = require('../middleware/auth');

const publicUser = (user) => ({
  id: user.user_id,
  email: user.email,
  fullName: user.full_name,
  role: user.role,
  status: user.status,
  joined: user.created_at
});

const createToken = (user) => jwt.sign(
  { id: user.user_id, email: user.email, role: user.role, fullName: user.full_name },
  getSecret(),
  { expiresIn: '8h' }
);

const getUserByEmail = async (email) => {
  const [rows] = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0];
};

exports.login = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'EMAIL_AND_PASSWORD_REQUIRED' });

  try {
    const user = await getUserByEmail(email);
    const validPassword = user && await bcrypt.compare(password, user.password_hash);
    if (!user || !validPassword || user.status !== 'Active') {
      return res.status(401).json({ error: 'INVALID_LOGIN' });
    }

    await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?', [user.user_id]);
    res.json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    console.error('LOGIN_ERROR:', error);
    res.status(500).json({ error: 'LOGIN_FAILED' });
  }
};

exports.me = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE user_id = ? LIMIT 1', [req.user.id]);
    if (!rows[0] || rows[0].status !== 'Active') return res.status(401).json({ error: 'USER_NOT_FOUND' });
    res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    console.error('AUTH_PROFILE_ERROR:', error);
    res.status(500).json({ error: 'PROFILE_FETCH_FAILED' });
  }
};

exports.updateProfile = async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!fullName || !email) return res.status(400).json({ error: 'NAME_AND_EMAIL_REQUIRED' });

  try {
    const [result] = await db.query('UPDATE users SET full_name = ?, email = ? WHERE user_id = ?', [fullName, email, req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const user = await getUserByEmail(email);
    res.json({ user: publicUser(user), token: createToken(user) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'EMAIL_ALREADY_IN_USE' });
    console.error('PROFILE_UPDATE_ERROR:', error);
    res.status(500).json({ error: 'PROFILE_UPDATE_FAILED' });
  }
};

exports.changePassword = async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (newPassword.length < 8) return res.status(400).json({ error: 'PASSWORD_MINIMUM_8_CHARACTERS' });

  try {
    const [rows] = await db.query('SELECT password_hash FROM users WHERE user_id = ?', [req.user.id]);
    if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      return res.status(400).json({ error: 'CURRENT_PASSWORD_INVALID' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [passwordHash, req.user.id]);
    res.json({ message: 'PASSWORD_CHANGED' });
  } catch (error) {
    console.error('PASSWORD_CHANGE_ERROR:', error);
    res.status(500).json({ error: 'PASSWORD_CHANGE_FAILED' });
  }
};

exports.listStaff = async (req, res) => {
  const [rows] = await db.query(`
    SELECT user_id AS id, email, full_name AS fullName, role, status, created_at AS joined, last_login AS lastLogin
    FROM users
    ORDER BY created_at DESC
  `);
  res.json(rows);
};

exports.createStaff = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const fullName = String(req.body.fullName || '').trim();
  const password = String(req.body.password || '');
  const role = req.body.role === 'admin' ? 'admin' : 'staff';
  if (!email || !fullName || password.length < 8) return res.status(400).json({ error: 'VALID_STAFF_DETAILS_REQUIRED' });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (email, password_hash, full_name, role, status) VALUES (?, ?, ?, ?, ?)',
      [email, passwordHash, fullName, role, 'Active']
    );
    res.status(201).json({ id: result.insertId, message: 'STAFF_CREATED' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'EMAIL_ALREADY_IN_USE' });
    console.error('STAFF_CREATE_ERROR:', error);
    res.status(500).json({ error: 'STAFF_CREATE_FAILED' });
  }
};

exports.updateStaffStatus = async (req, res) => {
  const status = req.body.status === 'Inactive' ? 'Inactive' : 'Active';
  if (Number(req.params.id) === Number(req.user.id)) return res.status(400).json({ error: 'CANNOT_DISABLE_CURRENT_USER' });
  const [result] = await db.query('UPDATE users SET status = ? WHERE user_id = ?', [status, req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'STAFF_NOT_FOUND' });
  res.json({ message: 'STAFF_STATUS_UPDATED' });
};
