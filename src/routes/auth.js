import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../supabase.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
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

  res.json({
    data: {
      token: signToken(user),
      user: { id: user.id, username: user.username, name: user.name, role: user.role },
    },
  });
});

export default router;
