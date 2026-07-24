import { Server } from 'socket.io';
import { verifyToken } from './middleware/auth.js';

/** Setup Socket.IO di atas http server, dengan autentikasi JWT via handshake.auth.token */
export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*' }, // development: izinkan semua origin
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
    socket.on('disconnect', () => {
      console.log(`Socket terputus: ${socket.user.name}`);
    });
  });

  return io;
}
