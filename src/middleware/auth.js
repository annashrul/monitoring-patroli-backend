import jwt from 'jsonwebtoken';
import config from '../config.js';

/** Middleware: wajib login (Bearer JWT). Menempelkan payload token ke req.user. */
export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token tidak ditemukan' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    return res.status(401).json({ message: 'Token tidak valid atau kedaluwarsa' });
  }
}

/** Middleware: batasi endpoint untuk role tertentu. owner bisa akses semua endpoint admin. */
export function requireRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole) return res.status(403).json({ message: 'Anda tidak memiliki akses' });
    if (userRole === 'owner') return next();
    if (roles.includes(userRole)) return next();
    return res.status(403).json({ message: 'Anda tidak memiliki akses' });
  };
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    config.jwtSecret,
    { expiresIn: '12h' }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}
