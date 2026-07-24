import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { supabase, BUCKET } from '../supabase.js';

const router = Router();

const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // maks 5 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    cb(new Error('File harus berupa gambar (jpg/png/webp)'));
  },
});

// POST /api/upload/foto — upload foto bukti laporan (multipart, field: "foto")
router.post(
  '/foto',
  (req, res, next) => {
    upload.single('foto')(req, res, (err) => {
      if (err) {
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Ukuran foto maksimal 5 MB'
            : err.message || 'File tidak valid';
        return res.status(400).json({ message: msg });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'File foto wajib diunggah' });

    const ext =
      req.file.mimetype === 'image/png'
        ? 'png'
        : req.file.mimetype === 'image/webp'
          ? 'webp'
          : 'jpg';
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomBytes(8).toString('hex')}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, req.file.buffer, { contentType: req.file.mimetype });

    if (error) {
      return res.status(500).json({ message: 'Gagal mengunggah foto: ' + error.message });
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    res.json({ data: { url: data.publicUrl, path } });
  }
);

export default router;
