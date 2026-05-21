/**
 * RoomManager — Redis-backed room & player management
 *
 * All methods are async. The room object returned by getRoom() is a
 * fully-hydrated JS object (players as Map, correctGuessers as Set) that
 * the rest of the codebase (gameEngine, drawingEngine, socketHandler) can
 * read and mutate. After mutation, callers must persist changes via the
 * appropriate roomStore method (saveRoomMeta / savePlayer / savePlayers).
 */

import * as roomStore from '../redis/roomStore.js';
import { stopRoundTimer }  from '../game/gameEngine.js';

class RoomManager {

  // ──────────────────────────────────────────────────────────────────────────
  // Room lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Creates a brand-new room with default game state.
   * @param {string} roomId
   * @returns {Promise<Object>} Hydrated room
   */
  async createRoom(roomId) {
    const room = await roomStore.createRoom(roomId);
    console.log(`[RoomManager] Room created: ${roomId}`);
    return room;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Player management
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Adds a player to a room (checks for duplicate usernames).
   * @param {string} roomId
   * @param {{userId,username,socketId}} player
   * @returns {Promise<Object>} Updated hydrated room
   */
  async joinRoom(roomId, player) {
    const room = await roomStore.getRoom(roomId);
    if (!room) throw new Error('Room does not exist');

    // Duplicate username check
    for (const existing of room.players.values()) {
      if (existing.username === player.username && existing.userId !== player.userId) {
        throw new Error('Username already taken in this room');
      }
    }

    if (room.players.has(player.userId)) {
      throw new Error('Player already in room');
    }

    const playerRecord = {
      userId:                 player.userId,
      username:               player.username,
      socketId:               player.socketId,
      isConnected:            true,
      score:                  0,
      joinedAt:               Date.now(),
      hasGuessedCurrentRound: false
    };

    await Promise.all([
      roomStore.savePlayer(roomId, playerRecord),
      roomStore.setSocketMapping(player.socketId, roomId, player.userId)
    ]);

    room.players.set(player.userId, playerRecord);
    console.log(`[RoomManager] Player ${player.username} joined room ${roomId}`);
    return room;
  }

  /**
   * Fully removes a player (explicit leave). Deletes room when last player leaves.
   * @param {string} roomId
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async leaveRoom(roomId, userId) {
    const room = await roomStore.getRoom(roomId);
    if (!room) return false;

    const player = room.players.get(userId);
    if (!player) return false;

    await Promise.all([
      roomStore.deletePlayer(roomId, userId),
      roomStore.deleteSocketMapping(player.socketId)
    ]);

    console.log(`[RoomManager] Player ${player.username} left room ${roomId}`);

    // If last player, clean up the room entirely
    const remaining = await roomStore.getPlayers(roomId);
    if (remaining.size === 0) {
      stopRoundTimer(roomId);
      await roomStore.deleteRoom(roomId);
      console.log(`[RoomManager] Room ${roomId} deleted (empty)`);
    }

    return true;
  }

  /**
   * Marks a player as disconnected but keeps them in the room (supports reconnect).
   * @param {string} socketId
   * @returns {Promise<{roomId,userId,username}|null>}
   */
  async removePlayerOnDisconnect(socketId) {
    const mapping = await roomStore.getSocketMapping(socketId);
    if (!mapping) return null;

    const { roomId, userId } = mapping;

    const player = await roomStore.getPlayer(roomId, userId);
    if (!player) {
      await roomStore.deleteSocketMapping(socketId);
      return null;
    }

    player.isConnected    = false;
    player.disconnectedAt = Date.now();

    await Promise.all([
      roomStore.savePlayer(roomId, player),
      roomStore.deleteSocketMapping(socketId)
    ]);

    console.log(`[RoomManager] Player ${player.username} disconnected from room ${roomId}`);

    return { roomId, userId, username: player.username };
  }

  /**
   * Reconnects a player: updates socketId and marks as connected.
   * @param {string} roomId
   * @param {string} userId
   * @param {string} newSocketId
   * @returns {Promise<Object>} Updated player object
   */
  async reassignSocketOnReconnect(roomId, userId, newSocketId) {
    const exists = await roomStore.roomExists(roomId);
    if (!exists) throw new Error('Room does not exist');

    const player = await roomStore.getPlayer(roomId, userId);
    if (!player) throw new Error('Player not found in room');

    // Remove stale socket mapping if it exists
    if (player.socketId) {
      await roomStore.deleteSocketMapping(player.socketId);
    }

    player.socketId      = newSocketId;
    player.isConnected   = true;
    player.reconnectedAt = Date.now();

    await Promise.all([
      roomStore.savePlayer(roomId, player),
      roomStore.setSocketMapping(newSocketId, roomId, userId)
    ]);

    console.log(`[RoomManager] Player ${player.username} reconnected to room ${roomId}`);
    return player;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Read helpers
  // ──────────────────────────────────────────────────────────────────────────

  /** @returns {Promise<Object|null>} */
  async getRoom(roomId) {
    return roomStore.getRoom(roomId);
  }

  /** @returns {Promise<Array>} */
  async getRoomPlayers(roomId) {
    const map = await roomStore.getPlayers(roomId);
    return [...map.values()];
  }

  /**
   * Returns {roomId, userId} for a socket, or null.
   * @param {string} socketId
   * @returns {Promise<{roomId,userId}|null>}
   */
  async getPlayerBySocketId(socketId) {
    return roomStore.getSocketMapping(socketId);
  }

  /**
   * Persists the host userId to room metadata.
   * @param {string} roomId
   * @param {string} userId
   */
  async setRoomHost(roomId, userId) {
    return roomStore.setRoomHost(roomId, userId);
  }

  /** @returns {Promise<boolean>} */
  async roomExists(roomId) {
    return roomStore.roomExists(roomId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stats (used by REST API)
  // ──────────────────────────────────────────────────────────────────────────

  /** @returns {Promise<number>} */
  async getRoomCount() {
    return roomStore.getRoomCount();
  }

  /**
   * Returns a lightweight summary of all rooms.
   * NOTE: Requires a Redis SCAN — avoid in hot paths.
   */
  async getAllRooms() {
    // We can't efficiently iterate all rooms without SCAN.
    // Return a placeholder for the stats API.
    const count = await roomStore.getRoomCount();
    return [{ note: `${count} room(s) active — use /api/rooms/:roomId for details` }];
  }

  /** @returns {Promise<number>} */
  async getTotalPlayerCount() {
    // Best-effort via room metadata — not cheap; used only by stats endpoint.
    return 0;
  }
}

// Export singleton
export default new RoomManager();
