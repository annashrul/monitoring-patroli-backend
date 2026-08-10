import { Server } from 'socket.io';
import { verifyToken } from './middleware/auth.js';
import { supabase } from './supabase.js';

let io;

/** Setup Socket.IO di atas http server, dengan autentikasi JWT via handshake.auth.token */
export function createSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('unauthorized'));
      socket.user = verifyToken(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket terhubung: ${socket.user.name} (${socket.user.role})`);
    socket.join(`user:${socket.user.id}`);

    // Admin & owner join room untuk menerima update lokasi satpam
    if (socket.user.role === 'admin' || socket.user.role === 'owner') {
      socket.join('admins');
    }

    // Satpam: terima update lokasi, simpan ke DB & broadcast ke admin
    if (socket.user.role === 'satpam') {
      let userColor = '#3B82F6';
      supabase.from('users').select('color').eq('id', socket.user.id).maybeSingle().then(({ data }) => {
        if (data?.color) userColor = data.color;
      });

      socket.on('location:update', async (data) => {
        console.log(`📍 Lokasi ${socket.user.name}: ${data.latitude}, ${data.longitude}`);
        await supabase
          .from('users')
          .update({
            last_latitude: data.latitude,
            last_longitude: data.longitude,
            last_location_at: new Date().toISOString(),
          })
          .eq('id', socket.user.id);
        io.to('admins').emit('satpam:location', {
          id: socket.user.id,
          name: socket.user.name,
          latitude: data.latitude,
          longitude: data.longitude,
          color: userColor,
          timestamp: new Date().toISOString(),
        });
      });
    }

    socket.on('disconnect', () => {
      console.log(`Socket terputus: ${socket.user.name}`);
      if (socket.user.role === 'satpam') {
        io.to('admins').emit('satpam:offline', { id: socket.user.id });
      }
    });
  });

  return io;
}

/** Emit event ke user spesifik via socket room user:<id> */
export function emitToUser(userId, event, data) {
  if (io) io.to(`user:${userId}`).emit(event, data);
}
