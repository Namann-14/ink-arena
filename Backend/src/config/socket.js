import { Server } from 'socket.io';
import { handleSocketConnection } from '../sockets/socketHandler.js';
import { socketAuthMiddleware } from '../auth/authMiddleware.js';

/**
 * Initializes and configures Socket.IO server
 * @param {Object} httpServer - HTTP server instance from Express
 * @returns {Object} Socket.IO server instance
 */
export function initializeSocket(httpServer) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

  const io = new Server(httpServer, {
    cors: {
      origin: [allowedOrigin, 'http://localhost:5173', 'http://localhost:8080'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['polling', 'websocket'],  // polling first so proxies/firewalls can handshake, then upgrades
  });

  // Clerk authentication middleware — verifies session token and populates socket.user
  io.use(socketAuthMiddleware);

  // Connection event handler
  io.on('connection', (socket) => {
    handleSocketConnection(io, socket);
  });

  // Global error handler
  io.on('error', (error) => {
    console.error('[Socket.IO] Server error:', error);
  });

  console.log('[Socket.IO] Server initialized');

  return io;
}
