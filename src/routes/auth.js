import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../supabase.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password, device_id } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Username dan password wajib diisi' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (error) return res.status(500).json({ message: 'Kesalahan server' });
  if (!user || !user.is_active) {
    return res.status(401).json({ message: 'Username atau password salah' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: 'Username atau password salah' });

  // Device binding hanya untuk satpam
  if (user.role === 'satpam') {
    if (!device_id) {
      return res.status(400).json({ message: 'Device ID diperlukan untuk login satpam' });
    }
    // Jika sudah ada device_token dan berbeda → blokir
    if (user.device_token && user.device_token !== device_id) {
      return res.status(403).json({ message: 'Akun sedang digunakan di perangkat lain. Hubungi admin untuk melepas sesi.' });
    }
    // Update device_token & last_login
    await supabase
      .from('users')
      .update({ device_token: device_id, last_login: new Date().toISOString() })
      .eq('id', user.id);
  }

  res.json({
    data: {
      token: signToken(user),
      user: { id: user.id, username: user.username, name: user.name, role: user.role, site_id: user.site_id },
    },
  });
});

// POST /api/auth/logout — hapus device binding
router.post('/logout', async (req, res) => {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.json({ data: { ok: true } });
  try {
    const { verifyToken } = await import('../middleware/auth.js');
    const user = verifyToken(auth.slice(7));
    await supabase.from('users').update({ device_token: null }).eq('id', user.id);
  } catch { /* ignore */ }
  res.json({ data: { ok: true } });
});

export default router;
