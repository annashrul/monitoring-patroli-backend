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
    { id: user.id, username: user.username, name: user.name, role: user.role, site_id: user.site_id || null, color: user.color || '#3B82F6' },
    config.jwtSecret,
    { expiresIn: '12h' }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

/** Helper: ambil site_id user untuk filtering (owner tidak difilter).
 * Fallback: jika token belum ada site_id, lookup dari DB. */
export async function getScopeFilter(req) {
  const user = req.user;
  if (!user || user.role === 'owner') return null;
  if (user.site_id !== undefined) return user.site_id || null;

  // Fallback: token lama belum ada site_id, ambil dari DB
  try {
    const { supabase } = await import('../supabase.js');
    const { data } = await supabase.from('users').select('site_id').eq('id', user.id).maybeSingle();
    if (data?.site_id) {
      user.site_id = data.site_id; // cache di req.user
      return data.site_id;
    }
  } catch { /* ignore */ }
  return null;
}
