import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { supabase, BUCKET } from '../supabase.js';

const router = Router();

const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    cb(new Error('File harus berupa gambar (jpg/png/webp)'));
  },
});

export function uploadSingleFoto(req, res, next) {
  upload.single('foto')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran foto maksimal 5 MB' : err.message || 'File tidak valid';
      return res.status(400).json({ message: msg });
    }
    if (!req.file) return res.status(400).json({ message: 'File foto wajib diunggah' });
    next();
  });
}

export async function saveFotoToStorage(file) {
  const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomBytes(8).toString('hex')}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file.buffer, { contentType: file.mimetype });
  if (error) throw new Error('Gagal mengunggah foto: ' + error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// POST /api/upload/foto
router.post('/foto', uploadSingleFoto, async (req, res) => {
  try {
    const url = await saveFotoToStorage(req.file);
    res.json({ data: { url } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

export default router;
