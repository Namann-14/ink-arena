import roomManager from '../rooms/roomManager.js';
import { generateUserId } from '../utils/idGenerator.js';
import { startGame, handleGuess, handleDrawerDisconnect, checkPlayerCount, resetGame, handleWordSelection } from '../game/gameEngine.js';

// ── Rate limiting for guess submissions ──────────────────────────────────────
/** @type {Map<string, number[]>} socketId → array of timestamps */
const guessRateMap = new Map();
const RATE_WINDOW = 5000;  // 5 seconds
const RATE_MAX = 10;    // max 10 guesses per window

function isRateLimited(socketId) {
  const now = Date.now();
  const timestamps = guessRateMap.get(socketId) || [];
  const recent = timestamps.filter(t => now - t < RATE_WINDOW);
  recent.push(now);
  guessRateMap.set(socketId, recent);
  return recent.length > RATE_MAX;
}

/**
 * Socket event handler â€” all callbacks are async to support Redis-backed roomManager.
 */
export function handleSocketConnection(io, socket) {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Log every incoming socket event (except high-frequency drawing events)
  const SILENT_EVENTS = new Set(['draw_stroke', 'draw_stroke_batch', 'request_sync_strokes']);
  socket.onAny((event, ...args) => {
    if (SILENT_EVENTS.has(event)) return;
    const payload = args[0] && typeof args[0] === 'object' ? JSON.stringify(args[0]) : args[0];
    console.log(`[Socket][IN] event="${event}" socket=${socket.id} payload=${payload}`);
  });

  // ============================================
  // Event: create_room
  // ============================================
  socket.on('create_room', async (payload, callback) => {
    try {
      const { roomId, username } = payload;

      if (!roomId || typeof roomId !== 'string') {
        const error = { success: false, error: 'Invalid room ID' };
        socket.emit('room_error', error);
        if (callback) callback(error);
        return;
      }

      if (await roomManager.roomExists(roomId)) {
        console.log(`[Socket][create_room] BLOCKED — room "${roomId}" already exists`);
        const error = { success: false, error: 'Room already exists' };
        socket.emit('room_error', error);
        if (callback) callback(error);
        return;
      }

      await roomManager.createRoom(roomId);

      // Auto-join the creator as a player if username provided
      if (username && typeof username === 'string' && username.trim().length > 0) {
        const userId = socket.user?.clerkId || generateUserId();
        const player = { userId, username: username.trim(), socketId: socket.id, isConnected: true, score: 0 };
        await roomManager.joinRoom(roomId, player);
        await roomManager.setRoomHost(roomId, userId);
        socket.join(roomId);
        const players = await roomManager.getRoomPlayers(roomId);
        const response = { success: true, roomId, userId, username: player.username, message: 'Room created and joined' };
        socket.emit('room_created', response);
        io.to(roomId).emit('player_list_update', {
          roomId,
          hostId: userId,
          players: players.map(p => ({ userId: p.userId, username: p.username, isConnected: p.isConnected, score: p.score }))
        });
        if (callback) callback(response);
      } else {
        const response = { success: true, roomId, message: 'Room created successfully' };
        socket.emit('room_created', response);
        if (callback) callback(response);
      }

      console.log(`[Socket] Room ${roomId} created by ${socket.id}`);

    } catch (error) {
      console.error('[Socket] Error creating room:', error.message);
      const errorResponse = { success: false, error: error.message };
      socket.emit('room_error', errorResponse);
      if (callback) callback(errorResponse);
    }
  });

  // ============================================
  // Event: join_room
  // ============================================
  socket.on('join_room', async (payload, callback) => {
    try {
      const { roomId, username } = payload;

      if (!roomId || typeof roomId !== 'string') {
        const error = { success: false, error: 'Invalid room ID' };
        socket.emit('room_error', error);
        if (callback) callback(error);
        return;
      }
      if (!username || typeof username !== 'string' || username.trim().length === 0) {
        const error = { success: false, error: 'Invalid username' };
        socket.emit('room_error', error);
        if (callback) callback(error);
        return;
      }

      if (!(await roomManager.roomExists(roomId))) {
        console.log(`[Socket][join_room] BLOCKED — room "${roomId}" does not exist`);
        const error = { success: false, error: 'Room does not exist' };
        socket.emit('room_error', error);
        if (callback) callback(error);
        return;
      }

      // Use Clerk ID if authenticated, otherwise fallback to generated ID
      const userId = socket.user?.clerkId || generateUserId();
      const player = { userId, username: username.trim(), socketId: socket.id, isConnected: true, score: 0 };

      await roomManager.joinRoom(roomId, player);
      socket.join(roomId);

      const [players, room] = await Promise.all([
        roomManager.getRoomPlayers(roomId),
        roomManager.getRoom(roomId)
      ]);

      const response = { success: true, roomId, userId, username: player.username, message: 'Joined room successfully' };
      socket.emit('room_joined', response);
      if (callback) callback(response);

      io.to(roomId).emit('player_list_update', {
        roomId,
        hostId: room ? room.hostId : '',
        players: players.map(p => ({ userId: p.userId, username: p.username, isConnected: p.isConnected, score: p.score }))
      });

      console.log(`[Socket] ${username} joined room ${roomId}`);

    } catch (error) {
      console.error('[Socket] Error joining room:', error.message);
      const errorResponse = { success: false, error: error.message };
      socket.emit('room_error', errorResponse);
      if (callback) callback(errorResponse);
    }
  });

  // ============================================
  // Event: send_message
  // ============================================
  socket.on('send_message', async (payload, callback) => {
    try {
      const { roomId, message } = payload;

      if (!roomId || typeof roomId !== 'string') {
        const error = { success: false, error: 'Invalid room ID' };
        socket.emit('room_error', error);
        if (callback) callback(error);
        return;
      }
      if (!message || typeof message !== 'string') {
        const error = { success: false, error: 'Invalid message' };
        socket.emit('room_error', error);
        if (callback) callback(error);
        return;
      }

      if (!(await roomManager.roomExists(roomId))) {
        const error = { success: false, error: 'Room does not exist' };
        socket.emit('room_error', error);
        if (callback) callback(error);
        return;
      }

      const playerInfo = await roomManager.getPlayerBySocketId(socket.id);
      if (!playerInfo) {
        const error = { success: false, error: 'Player not in any room' };
        socket.emit('room_error', error);
        if (callback) callback(error);
        return;
      }

      const room = await roomManager.getRoom(roomId);
      const player = room.players.get(playerInfo.userId);

      io.to(roomId).emit('receive_message', {
        roomId,
        userId: player.userId,
        username: player.username,
        message: message.trim(),
        timestamp: Date.now()
      });

      if (callback) callback({ success: true });

    } catch (error) {
      console.error('[Socket] Error sending message:', error.message);
      const errorResponse = { success: false, error: error.message };
      socket.emit('room_error', errorResponse);
      if (callback) callback(errorResponse);
    }
  });

  // ============================================
  // Event: reconnect_player
  // ============================================
  socket.on('reconnect_player', async (payload, callback) => {
    try {
      const { roomId, userId } = payload;

      if (!roomId || typeof roomId !== 'string') {
        const error = { success: false, error: 'Invalid room ID' };
        socket.emit('room_error', error);
        if (callback) callback(error);
        return;
      }
      if (!userId || typeof userId !== 'string') {
        const error = { success: false, error: 'Invalid user ID' };
        socket.emit('room_error', error);
        if (callback) callback(error);
        return;
      }

      const player = await roomManager.reassignSocketOnReconnect(roomId, userId, socket.id);
      socket.join(roomId);

      const [players, room] = await Promise.all([
        roomManager.getRoomPlayers(roomId),
        roomManager.getRoom(roomId)
      ]);

      const response = { success: true, roomId, userId: player.userId, username: player.username, message: 'Reconnected successfully' };
      socket.emit('room_joined', response);
      if (callback) callback(response);

      io.to(roomId).emit('player_reconnected', { roomId, userId: player.userId, username: player.username, timestamp: Date.now() });
      io.to(roomId).emit('player_list_update', {
        roomId,
        hostId: room ? room.hostId : '',
        players: players.map(p => ({ userId: p.userId, username: p.username, isConnected: p.isConnected, score: p.score }))
      });

      console.log(`[Socket] ${player.username} reconnected to room ${roomId}`);

    } catch (error) {
      console.error('[Socket] Error reconnecting player:', error.message);
      const errorResponse = { success: false, error: error.message };
      socket.emit('room_error', errorResponse);
      if (callback) callback(errorResponse);
    }
  });

  // ============================================
  // Event: start_game
  // ============================================
  socket.on('start_game', async (payload, callback) => {
    try {
      const { roomId, totalRounds, difficulty } = payload;

      if (!roomId || typeof roomId !== 'string') {
        const error = { success: false, error: 'Invalid room ID' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const rounds = totalRounds || 3;
      if (typeof rounds !== 'number' || rounds < 1 || rounds > 10) {
        const error = { success: false, error: 'Total rounds must be between 1 and 10' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const room = await roomManager.getRoom(roomId);
      if (!room) {
        const error = { success: false, error: 'Room does not exist' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      if (room.gameState === 'playing' || room.gameState === 'round_end') {
        console.log(`[Socket][start_game] BLOCKED — gameState is already "${room.gameState}" for room ${roomId}`);
        const error = { success: false, error: 'Game already in progress' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const playerInfo = await roomManager.getPlayerBySocketId(socket.id);
      if (!playerInfo || playerInfo.roomId !== roomId) {
        const error = { success: false, error: 'You are not in this room' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const result = await startGame(room, rounds, io, difficulty || 'medium');
      if (!result.success) {
        const error = { success: false, error: result.error };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      if (callback) callback({ success: true, message: 'Game started', totalRounds: rounds });
      console.log(`[Socket] Game started in room ${roomId} with ${rounds} rounds`);

    } catch (error) {
      console.error('[Socket] Error starting game:', error.message);
      const errorResponse = { success: false, error: error.message };
      socket.emit('game_error', errorResponse);
      if (callback) callback(errorResponse);
    }
  });

  // ============================================
  // Event: select_word
  // ============================================
  socket.on('select_word', async (payload, callback) => {
    try {
      const { roomId, word } = payload;
      if (!roomId || !word) {
        if (callback) callback({ success: false, error: 'roomId and word required' });
        return;
      }
      const playerInfo = await roomManager.getPlayerBySocketId(socket.id);
      if (!playerInfo) {
        if (callback) callback({ success: false, error: 'Not in a room' });
        return;
      }
      const result = await handleWordSelection(roomId, playerInfo.userId, word, io);
      if (callback) callback(result);
    } catch (err) {
      console.error('[Socket] Error in select_word:', err.message);
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // ============================================
  // Event: submit_guess
  // ============================================
  socket.on('submit_guess', async (payload, callback) => {
    try {
      const { roomId, guess } = payload;

      if (!roomId || typeof roomId !== 'string') {
        const error = { success: false, error: 'Invalid room ID' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }
      if (!guess || typeof guess !== 'string' || guess.trim().length === 0) {
        const error = { success: false, error: 'Invalid guess' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      // Rate limiting
      if (isRateLimited(socket.id)) {
        const error = { success: false, error: 'Too many guesses — slow down!' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const room = await roomManager.getRoom(roomId);
      if (!room) {
        const error = { success: false, error: 'Room does not exist' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }
      if (room.gameState !== 'playing') {
        const error = { success: false, error: 'Game is not in progress' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const playerInfo = await roomManager.getPlayerBySocketId(socket.id);
      if (!playerInfo || playerInfo.roomId !== roomId) {
        const error = { success: false, error: 'You are not in this room' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const player = room.players.get(playerInfo.userId);
      const result = await handleGuess(room, playerInfo.userId, guess, io, socket);

      if (!result.success) {
        const error = { success: false, error: result.error };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      // Broadcast incorrect/non-close guesses to chat (word stays hidden)
      if (!result.correct && !result.close) {
        io.to(roomId).emit('receive_message', {
          roomId,
          userId: player.userId,
          username: player.username,
          message: guess.trim(),
          timestamp: Date.now()
        });
      }

      if (callback) callback({ success: true, correct: result.correct, close: result.close || false });

    } catch (error) {
      console.error('[Socket] Error submitting guess:', error.message);
      const errorResponse = { success: false, error: error.message };
      socket.emit('game_error', errorResponse);
      if (callback) callback(errorResponse);
    }
  });

  // ============================================
  // Phase 4: Drawing Events
  // ============================================

  // Event: draw_stroke (single â€” kept for backward compat)
  socket.on('draw_stroke', async (payload, callback) => {
    try {
      const { roomId, stroke } = payload;
      if (!roomId || !stroke) {
        const error = { success: false, error: 'roomId and stroke are required' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const room = await roomManager.getRoom(roomId);
      if (!room) {
        const error = { success: false, error: 'Room does not exist' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }
      const playerInfo = await roomManager.getPlayerBySocketId(socket.id);
      if (!playerInfo || playerInfo.roomId !== roomId) {
        const error = { success: false, error: 'You are not in this room' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const { handleDrawStroke } = await import('../game/drawingEngine.js');
      const result = await handleDrawStroke(room, playerInfo.userId, stroke, socket, io);

      if (!result.success) {
        const error = { success: false, error: result.error };
        socket.emit('game_error', error);
        if (callback) callback(error);
      } else if (callback) {
        callback({ success: true });
      }

    } catch (error) {
      console.error('[Socket] Error handling draw stroke:', error.message);
      const errorResponse = { success: false, error: error.message };
      socket.emit('game_error', errorResponse);
      if (callback) callback(errorResponse);
    }
  });

  // Event: draw_stroke_batch (rAF-batched â€” primary drawing path)
  socket.on('draw_stroke_batch', async (payload, callback) => {
    try {
      const { roomId, strokes } = payload;
      if (!roomId || !Array.isArray(strokes)) {
        const error = { success: false, error: 'roomId and strokes array are required' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }
      if (strokes.length > 200) {
        const error = { success: false, error: 'Batch too large (max 200 strokes)' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const room = await roomManager.getRoom(roomId);
      if (!room) {
        const error = { success: false, error: 'Room does not exist' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }
      const playerInfo = await roomManager.getPlayerBySocketId(socket.id);
      if (!playerInfo || playerInfo.roomId !== roomId) {
        const error = { success: false, error: 'You are not in this room' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const { handleDrawStrokeBatch } = await import('../game/drawingEngine.js');
      const result = await handleDrawStrokeBatch(room, playerInfo.userId, strokes, socket, io);

      if (!result.success) {
        const error = { success: false, error: result.error };
        socket.emit('game_error', error);
        if (callback) callback(error);
      } else if (callback) {
        callback({ success: true, accepted: result.accepted, rejected: result.rejected });
      }

    } catch (error) {
      console.error('[Socket] Error handling draw stroke batch:', error.message);
      const errorResponse = { success: false, error: error.message };
      socket.emit('game_error', errorResponse);
      if (callback) callback(errorResponse);
    }
  });

  // Event: request_sync_strokes
  socket.on('request_sync_strokes', async (payload, callback) => {
    try {
      const { roomId } = payload;
      if (!roomId) {
        const error = { success: false, error: 'roomId is required' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const room = await roomManager.getRoom(roomId);
      if (!room) {
        const error = { success: false, error: 'Room does not exist' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }
      const playerInfo = await roomManager.getPlayerBySocketId(socket.id);
      if (!playerInfo || playerInfo.roomId !== roomId) {
        const error = { success: false, error: 'You are not in this room' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const { syncStrokes } = await import('../game/drawingEngine.js');
      const result = await syncStrokes(room, socket);

      if (callback) callback({ success: result.success, strokeCount: result.strokeCount || 0 });

    } catch (error) {
      console.error('[Socket] Error syncing strokes:', error.message);
      const errorResponse = { success: false, error: error.message };
      socket.emit('game_error', errorResponse);
      if (callback) callback(errorResponse);
    }
  });

  // ============================================
  // Event: reset_game
  // ============================================
  socket.on('reset_game', async (payload, callback) => {
    try {
      const { roomId } = payload;
      if (!roomId || typeof roomId !== 'string') {
        const error = { success: false, error: 'Invalid room ID' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const room = await roomManager.getRoom(roomId);
      if (!room) {
        const error = { success: false, error: 'Room does not exist' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const playerInfo = await roomManager.getPlayerBySocketId(socket.id);
      if (!playerInfo || playerInfo.roomId !== roomId) {
        const error = { success: false, error: 'You are not in this room' };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      const result = await resetGame(room, io);
      if (!result.success) {
        const error = { success: false, error: result.error };
        socket.emit('game_error', error);
        if (callback) callback(error);
        return;
      }

      if (callback) callback({ success: true, message: 'Game reset' });
      console.log(`[Socket] Game reset in room ${roomId}`);

    } catch (error) {
      console.error('[Socket] Error resetting game:', error.message);
      const errorResponse = { success: false, error: error.message };
      socket.emit('game_error', errorResponse);
      if (callback) callback(errorResponse);
    }
  });

  // ============================================
  // Event: disconnect
  // ============================================
  socket.on('disconnect', async (reason) => {
    console.log(`[Socket] Client disconnected: ${socket.id}, reason: ${reason}`);
    guessRateMap.delete(socket.id); // cleanup rate limiter
    try {
      const disconnectInfo = await roomManager.removePlayerOnDisconnect(socket.id);

      if (disconnectInfo) {
        const { roomId, userId, username } = disconnectInfo;
        const room = await roomManager.getRoom(roomId);

        if (room) {
          await handleDrawerDisconnect(room, userId, io);
          await checkPlayerCount(room, io);
        }

        const players = await roomManager.getRoomPlayers(roomId);

        socket.to(roomId).emit('player_disconnected', { roomId, userId, username, timestamp: Date.now() });
        io.to(roomId).emit('player_list_update', {
          roomId,
          hostId: room ? room.hostId : '',
          players: players.map(p => ({ userId: p.userId, username: p.username, isConnected: p.isConnected, score: p.score }))
        });

        console.log(`[Socket] Player ${username} marked as disconnected in room ${roomId}`);
      }
    } catch (error) {
      console.error('[Socket] Error handling disconnect:', error.message);
    }
  });

  // ============================================
  // Event: error
  // ============================================
  socket.on('error', (error) => {
    console.error(`[Socket] Socket error on ${socket.id}:`, error);
  });
}
