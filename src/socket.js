import { Server } from 'socket.io';
import { verifyToken } from './middleware/auth.js';

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
    // Join room by user ID untuk targeted emit
    socket.join(`user:${socket.user.id}`);
    socket.on('disconnect', () => {
      console.log(`Socket terputus: ${socket.user.name}`);
    });
  });

  return io;
}

/** Emit event ke user spesifik via socket room user:<id> */
export function emitToUser(userId, event, data) {
  if (io) io.to(`user:${userId}`).emit(event, data);
}
