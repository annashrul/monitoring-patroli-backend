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

  // Device binding untuk satpam: 1 device ↔ 1 akun (bidirectional)
  if (user.role === 'satpam') {
    if (!device_id) {
      return res.status(400).json({ message: 'Device ID diperlukan untuk login satpam' });
    }

    // Cek apakah device_id ini sudah dipakai oleh akun satpam LAIN
    const { data: otherUser } = await supabase
      .from('users')
      .select('id, name')
      .eq('device_token', device_id)
      .neq('id', user.id)
      .maybeSingle();
    if (otherUser) {
      return res.status(403).json({ message: `Perangkat ini sudah terdaftar untuk ${otherUser.name}. Hubungi admin untuk melepas sesi.` });
    }

    // Cek apakah akun ini sudah login di perangkat LAIN
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

// POST /api/auth/logout — tidak hapus device binding (biarkan admin yang Lepas)
router.post('/logout', async (req, res) => {
  res.json({ data: { ok: true } });
});

export default router;
