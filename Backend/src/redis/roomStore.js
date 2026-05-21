/**
 * RoomStore — Redis-backed state layer
 *
 * Redis key schema
 * ─────────────────────────────────────────────────────
 * room:{roomId}            Hash   – room metadata fields
 * room:{roomId}:players    Hash   – field=userId, value=JSON player
 * room:{roomId}:strokes    List   – JSON stroke objects (RPUSH / LRANGE)
 * socket:{socketId}        String – JSON { roomId, userId }
 * lock:room:{roomId}:timer String – instanceId, NX EX ttl
 * ─────────────────────────────────────────────────────
 */

import { getRedisClient } from './redisClient.js';

/**
 * Returns the Redis client or throws a clean error if Redis is unavailable.
 * All roomStore functions use this instead of getRedisClient() directly so
 * that null-access crashes are impossible and callers get a sensible message.
 */
function requireRedisClient() {
  const c = getRedisClient();
  if (!c) {
    throw new Error(
      'Redis is not connected — room operations are unavailable. ' +
      'Ensure REDIS_URL is set and the server has started correctly.'
    );
  }
  return c;
}


// Lua script: release lock only if we own it (atomic check-then-delete)
const RELEASE_LOCK_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;

// Lua script: atomic create-room-if-not-exists
// Returns 1 on success, 0 if already existed
const CREATE_ROOM_SCRIPT = `
  if redis.call("EXISTS", KEYS[1]) == 1 then
    return 0
  end
  redis.call("HSET", KEYS[1],
    "roomId",            ARGV[1],
    "gameState",         "waiting",
    "roundNumber",       "0",
    "totalRounds",       ARGV[2],
    "currentDrawerId",   "",
    "currentWord",       "",
    "roundEndTime",      "0",
    "roundDuration",     ARGV[3],
    "correctGuessers",   "[]",
    "hostId",            "",
    "createdAt",         ARGV[4],
    "lastActivity",      ARGV[4]
  )
  return 1
`;

/**
 * Lua script: atomically transition gameState from "waiting" → "playing".
 *
 * Distributed guarantee: only ONE server instance can win this CAS.
 * Any concurrent call from another instance will read a non-"waiting"
 * gameState and return 0, preventing a double-start.
 *
 * Returns 1 on success (state was "waiting" and is now "playing").
 * Returns 0 if state was already changed (idempotent guard).
 */
const START_GAME_ATOMIC_SCRIPT = `
  local state = redis.call("HGET", KEYS[1], "gameState")
  if state ~= "waiting" and state ~= "finished" then
    return 0
  end
  redis.call("HSET", KEYS[1],
    "gameState",   "playing",
    "roundNumber", "0",
    "totalRounds", ARGV[1]
  )
  return 1
`;

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

function roomKey(roomId)         { return `room:${roomId}`; }
function playersKey(roomId)      { return `room:${roomId}:players`; }
function strokesKey(roomId)      { return `room:${roomId}:strokes`; }
function socketKey(socketId)     { return `socket:${socketId}`; }

/**
 * Deserialises the raw Redis Hash + players Hash into a hydrated room object
 * with proper JS types (Map, Set, numbers).
 */
function hydrateRoom(meta, playerFields) {
  const room = {
    roomId:           meta.roomId,
    gameState:        meta.gameState,
    roundNumber:      parseInt(meta.roundNumber)  || 0,
    totalRounds:      parseInt(meta.totalRounds)  || 3,
    currentDrawerId:  meta.currentDrawerId  || null,
    currentWord:      meta.currentWord      || null,
    roundEndTime:     meta.roundEndTime && meta.roundEndTime !== '0'
                        ? parseInt(meta.roundEndTime) : null,
    roundDuration:    parseInt(meta.roundDuration) || 60,
    createdAt:        parseInt(meta.createdAt)     || Date.now(),
    lastActivity:     parseInt(meta.lastActivity)  || Date.now(),
    correctGuessers:      new Set(
                            meta.correctGuessers
                              ? JSON.parse(meta.correctGuessers)
                              : []
                          ),
    // ── Turn-based round system ──────────────────────────────────
    totalTurns:           parseInt(meta.totalTurns)  || 0,
    playerOrder:          meta.playerOrder ? JSON.parse(meta.playerOrder) : [],
    difficulty:           meta.difficulty  || 'medium',
    // ── Word selection phase ─────────────────────────────────────
    wordSelectionEndTime: meta.wordSelectionEndTime && meta.wordSelectionEndTime !== '0'
                            ? parseInt(meta.wordSelectionEndTime) : null,
    currentWordOptions:   meta.currentWordOptions ? JSON.parse(meta.currentWordOptions) : [],
    // ── Hint system ──────────────────────────────────────────────
    revealedIndices:      meta.revealedIndices ? JSON.parse(meta.revealedIndices) : [],
    // ── Host ─────────────────────────────────────────────────────
    hostId:               meta.hostId || "",
    players:              new Map(),
    strokeHistory:        []
  };

  // Fix empty-string sentinels stored when value was null
  if (room.currentDrawerId === '') room.currentDrawerId = null;
  if (room.currentWord      === '') room.currentWord      = null;

  for (const [userId, json] of Object.entries(playerFields || {})) {
    try {
      room.players.set(userId, JSON.parse(json));
    } catch (e) {
      console.error(`[RoomStore] Corrupt player JSON for ${userId}:`, e.message);
    }
  }

  return room;
}

// ────────────────────────────────────────────────────────────────────────────
// Room CRUD
// ────────────────────────────────────────────────────────────────────────────

/**
 * Atomically creates a room if it does not already exist.
 * @param {string} roomId
 * @param {number} [totalRounds=3]
 * @param {number} [roundDuration=60]
 * @returns {Promise<Object>} The hydrated room object
 * @throws {Error} If the room already exists
 */
export async function createRoom(roomId, totalRounds = 3, roundDuration = 60) {
  const client = requireRedisClient();
  const now    = String(Date.now());

  const created = await client.eval(CREATE_ROOM_SCRIPT, {
    keys:      [roomKey(roomId)],
    arguments: [roomId, String(totalRounds), String(roundDuration), now]
  });

  if (created === 0) {
    throw new Error('Room already exists');
  }

  console.log(`[RoomStore] Room created: ${roomId}`);
  return hydrateRoom(
    await client.hGetAll(roomKey(roomId)),
    {}
  );
}

/**
 * Returns a fully-hydrated room object, or null if not found.
 * Players are loaded from the players Hash in the same round-trip (parallel).
 * @param {string} roomId
 * @returns {Promise<Object|null>}
 */
export async function getRoom(roomId) {
  const client = requireRedisClient();

  const [meta, playerFields] = await Promise.all([
    client.hGetAll(roomKey(roomId)),
    client.hGetAll(playersKey(roomId))
  ]);

  if (!meta || !meta.roomId) return null;

  return hydrateRoom(meta, playerFields);
}

/**
 * Persists only the room metadata fields (does NOT touch players or strokes).
 * Converts JS Map / Set back to Redis-storable types.
 * @param {Object} room - Hydrated room object
 */
export async function saveRoomMeta(room) {
  const client = requireRedisClient();

  await client.hSet(roomKey(room.roomId), {
    roomId:               room.roomId,
    gameState:            room.gameState,
    roundNumber:          String(room.roundNumber),
    totalRounds:          String(room.totalRounds),
    currentDrawerId:      room.currentDrawerId  || '',
    currentWord:          room.currentWord      || '',
    roundEndTime:         room.roundEndTime     ? String(room.roundEndTime) : '0',
    roundDuration:        String(room.roundDuration),
    lastActivity:         String(Date.now()),
    correctGuessers:      JSON.stringify([...(room.correctGuessers || new Set())]),
    totalTurns:           String(room.totalTurns ?? 0),
    playerOrder:          JSON.stringify(room.playerOrder ?? []),
    difficulty:           room.difficulty    || 'medium',
    wordSelectionEndTime: room.wordSelectionEndTime ? String(room.wordSelectionEndTime) : '0',
    currentWordOptions:   JSON.stringify(room.currentWordOptions ?? []),
    revealedIndices:      JSON.stringify(room.revealedIndices ?? []),
  });
}

/**
 * Deletes a room and all associated keys (players, strokes).
 * @param {string} roomId
 */
export async function deleteRoom(roomId) {
  const client = requireRedisClient();

  await Promise.all([
    client.del(roomKey(roomId)),
    client.del(playersKey(roomId)),
    client.del(strokesKey(roomId))
  ]);

  console.log(`[RoomStore] Room deleted: ${roomId}`);
}

/**
 * Returns true if the room metadata key exists.
 * @param {string} roomId
 */
export async function roomExists(roomId) {
  const client = requireRedisClient();
  return (await client.exists(roomKey(roomId))) === 1;
}

// ────────────────────────────────────────────────────────────────────────────
// Player operations
// ────────────────────────────────────────────────────────────────────────────

/**
 * Upserts a single player into the room's players Hash.
 * @param {string} roomId
 * @param {Object} player
 */
export async function savePlayer(roomId, player) {
  const client = requireRedisClient();
  await client.hSet(playersKey(roomId), player.userId, JSON.stringify(player));
}

/**
 * Saves every player in a Map at once (HSET multi-field).
 * Used for mass resets (score wipe, hasGuessedCurrentRound reset).
 * @param {string} roomId
 * @param {Map<string,Object>} playersMap
 */
export async function savePlayers(roomId, playersMap) {
  if (!playersMap || playersMap.size === 0) return;

  const client  = getRedisClient();
  const entries = {};

  for (const [userId, player] of playersMap) {
    entries[userId] = JSON.stringify(player);
  }

  await client.hSet(playersKey(roomId), entries);
}

/**
 * Returns a player by userId, or null.
 * @param {string} roomId
 * @param {string} userId
 */
export async function getPlayer(roomId, userId) {
  const client = requireRedisClient();
  const json   = await client.hGet(playersKey(roomId), userId);
  return json ? JSON.parse(json) : null;
}

/**
 * Returns all players as a Map<userId, playerObj>.
 * @param {string} roomId
 */
export async function getPlayers(roomId) {
  const client = requireRedisClient();
  const fields = await client.hGetAll(playersKey(roomId));
  const map    = new Map();

  for (const [userId, json] of Object.entries(fields || {})) {
    try { map.set(userId, JSON.parse(json)); }
    catch (e) { console.error(`[RoomStore] Corrupt player ${userId}:`, e.message); }
  }

  return map;
}

/**
 * Removes a single player from the room's players Hash.
 * If no players remain, optionally deletes the whole room.
 * @param {string} roomId
 * @param {string} userId
 */
export async function deletePlayer(roomId, userId) {
  const client = requireRedisClient();
  await client.hDel(playersKey(roomId), userId);
}

// ────────────────────────────────────────────────────────────────────────────
// Stroke operations
// ────────────────────────────────────────────────────────────────────────────

/**
 * Appends a single stroke to the room's stroke list.
 * @param {string} roomId
 * @param {Object} stroke
 */
export async function pushStroke(roomId, stroke) {
  const client = requireRedisClient();
  await client.rPush(strokesKey(roomId), JSON.stringify(stroke));
}

/**
 * Appends multiple strokes in one RPUSH (pipeline-safe).
 * @param {string} roomId
 * @param {Array<Object>} strokes
 */
export async function pushStrokes(roomId, strokes) {
  if (!strokes || strokes.length === 0) return;

  const client  = getRedisClient();
  const encoded = strokes.map(s => JSON.stringify(s));
  await client.rPush(strokesKey(roomId), encoded);
}

/**
 * Returns the full stroke history as an array of objects.
 * @param {string} roomId
 * @returns {Promise<Array<Object>>}
 */
export async function getStrokes(roomId) {
  const client = requireRedisClient();
  const items  = await client.lRange(strokesKey(roomId), 0, -1);
  return items.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}

/**
 * Clears the stroke history for a room.
 * @param {string} roomId
 */
export async function clearStrokes(roomId) {
  const client = requireRedisClient();
  await client.del(strokesKey(roomId));
}

// ────────────────────────────────────────────────────────────────────────────
// Socket → Player mapping
// ────────────────────────────────────────────────────────────────────────────

/**
 * Stores { roomId, userId } for a socket — used for quick disconnect lookups.
 * @param {string} socketId
 * @param {string} roomId
 * @param {string} userId
 */
export async function setSocketMapping(socketId, roomId, userId) {
  const client = requireRedisClient();
  // TTL of 2 hours; refreshed on reconnect
  await client.set(socketKey(socketId), JSON.stringify({ roomId, userId }), { EX: 7200 });
}

/**
 * Returns { roomId, userId } for a socket, or null.
 * @param {string} socketId
 * @returns {Promise<{roomId:string, userId:string}|null>}
 */
export async function getSocketMapping(socketId) {
  const client = requireRedisClient();
  const json   = await client.get(socketKey(socketId));
  return json ? JSON.parse(json) : null;
}

/**
 * Removes the socket → player mapping.
 * @param {string} socketId
 */
export async function deleteSocketMapping(socketId) {
  const client = requireRedisClient();
  await client.del(socketKey(socketId));
}

// ────────────────────────────────────────────────────────────────────────────
// Distributed locking
// ────────────────────────────────────────────────────────────────────────────

/**
 * Attempts to acquire a Redis lock (SET NX EX).
 * @param {string} lockKey  - e.g. "lock:room:abc:timer"
 * @param {string} ownerId  - unique string identifying this server instance
 * @param {number} ttlSecs  - auto-expiry in seconds
 * @returns {Promise<boolean>} true if lock was acquired
 */
export async function acquireLock(lockKey, ownerId, ttlSecs) {
  const client = requireRedisClient();
  const result = await client.set(lockKey, ownerId, { NX: true, EX: ttlSecs });
  return result === 'OK';
}

/**
 * Releases a lock only if this instance still owns it (Lua atomic CAS delete).
 * @param {string} lockKey
 * @param {string} ownerId
 * @returns {Promise<boolean>} true if lock was released
 */
export async function releaseLock(lockKey, ownerId) {
  const client  = getRedisClient();
  const deleted = await client.eval(RELEASE_LOCK_SCRIPT, {
    keys:      [lockKey],
    arguments: [ownerId]
  });
  return deleted === 1;
}

/**
 * Refreshes the TTL of an existing lock (heartbeat to prevent expiry during long rounds).
 * Only extends if we still own it.
 * @param {string} lockKey
 * @param {string} ownerId
 * @param {number} ttlSecs
 */
export async function refreshLock(lockKey, ownerId, ttlSecs) {
  const client  = getRedisClient();
  const current = await client.get(lockKey);
  if (current === ownerId) {
    await client.expire(lockKey, ttlSecs);
  }
}

/**
 * Returns true if this instance currently owns the specified lock.
 * Used by the timer loop on every tick to abort if ownership was lost.
 * @param {string} lockKey
 * @param {string} ownerId
 * @returns {Promise<boolean>}
 */
export async function isLockOwner(lockKey, ownerId) {
  const client = requireRedisClient();
  const value  = await client.get(lockKey);
  return value === ownerId;
}

/**
 * Atomically transitions gameState from "waiting" → "playing" using Lua CAS.
 *
 * Distributed guarantee: only ONE server instance across the cluster can win
 * this CAS. All concurrent callers see the already-changed state and receive
 * false, preventing any double-start race condition.
 *
 * @param {string} roomId
 * @param {number} totalRounds
 * @returns {Promise<boolean>} true if this instance won the transition
 */
export async function atomicStartGame(roomId, totalRounds) {
  const client = requireRedisClient();
  const result = await client.eval(START_GAME_ATOMIC_SCRIPT, {
    keys:      [roomKey(roomId)],
    arguments: [String(totalRounds)]
  });
  return result === 1;
}

// ────────────────────────────────────────────────────────────────────────────
// Server stats helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns the number of rooms by scanning for room:* keys.
 * NOTE: SCAN-based; avoid on very large keyspaces in hot paths.
 * @returns {Promise<number>}
 */
/**
 * Stores the host (room creator) userId into the room metadata.
 * Idempotent — safe to call multiple times (only actually used once on creation).
 * @param {string} roomId
 * @param {string} userId
 */
export async function setRoomHost(roomId, userId) {
  const client = requireRedisClient();
  await client.hSet(roomKey(roomId), { hostId: userId });
}

export async function getRoomCount() {
  const client = requireRedisClient();
  let count    = 0;
  let cursor   = 0;

  do {
    const reply = await client.scan(cursor, { MATCH: 'room:*', COUNT: 100 });
    cursor = reply.cursor;
    // Only count top-level room keys (not room:xxx:players or room:xxx:strokes)
    count += reply.keys.filter(k => !k.includes(':')).length;
  } while (cursor !== 0);

  return count;
}
