const jwt = require('jsonwebtoken');

const getSecret = () => process.env.JWT_SECRET || 'local-development-secret-change-me';

const authenticate = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' });

  try {
    req.user = jwt.verify(token, getSecret());
    next();
  } catch {
    res.status(401).json({ error: 'INVALID_OR_EXPIRED_TOKEN' });
  }
};

const requireRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'INSUFFICIENT_PERMISSIONS' });
  }
  next();
};

module.exports = { authenticate, requireRoles, getSecret };
