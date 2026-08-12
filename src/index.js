import express from 'express';
import http from 'http';
import cors from 'cors';
import config from './config.js';
import { createSocketServer } from './socket.js';
import { startShiftWatcher } from './services/shiftWatcher.js';
import { supabase } from './supabase.js';
import { authRequired } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import sitesRoutes from './routes/sites.js';
import postsRoutes from './routes/posts.js';
import scanRoutes from './routes/scan.js';
import scanLogsRoutes from './routes/scanLogs.js';
import shiftsRoutes from './routes/shifts.js';
import usersRoutes from './routes/users.js';
import uploadRoutes from './routes/upload.js';
import { ensureBucket } from './supabase.js';

const app = express();
app.use(cors());
app.use(express.json());

// Publik
app.get('/api/health', (req, res) => res.json({ data: { status: 'ok' } }));
app.get('/api/config/status-labels', async (req, res) => {
  const { data, error } = await supabase.from('app_config').select('key,value').in('key', ['label_green','label_yellow','label_red','color_green','color_yellow','color_red']);
  const config = {};
  (data || []).forEach((r) => { config[r.key] = r.value; });
  res.json({ data: {
    green:  { label: config.label_green  || 'Aman',        color: config.color_green  || '#16a34a' },
    yellow: { label: config.label_yellow || 'Scan Ulang',  color: config.color_yellow || '#f59e0b' },
    red:    { label: config.label_red    || 'Belum',       color: config.color_red    || '#dc2626' },
  }});
});
app.use('/api/auth', authRoutes);

// Terproteksi (JWT)
app.use('/api/sites', authRequired, sitesRoutes);
app.use('/api/posts', authRequired, postsRoutes);
app.use('/api/scan', authRequired, scanRoutes);
app.use('/api/scan-logs', authRequired, scanLogsRoutes);
app.use('/api/shifts', authRequired, shiftsRoutes);
app.use('/api/users', authRequired, usersRoutes);
app.use('/api/upload', authRequired, uploadRoutes);

// 404 & error handler
app.use((req, res) => res.status(404).json({ message: 'Endpoint tidak ditemukan' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Kesalahan server' });
});

const server = http.createServer(app);
const io = createSocketServer(server);
app.set('io', io);
startShiftWatcher(io);

server.listen(config.port, () => {
  console.log(`Backend berjalan di http://localhost:${config.port}`);
  console.log(`Timezone aplikasi: ${config.appTimezone}`);
  ensureBucket(); // pastikan bucket storage foto tersedia
});
