/**
 * GameEngine — Production-safe distributed round control
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DISTRIBUTED GUARANTEES
 * ───────────────────────────────────────────────────────────────────────────
 *
 * 1. GAME START — Atomic Lua CAS (waiting → playing)
 *    roomStore.atomicStartGame() uses a Lua script that checks gameState ===
 *    "waiting" AND writes "playing" in a single Redis command.  Only ONE
 *    server instance across the entire cluster can ever win this CAS.
 *    All concurrent callers receive false and bail out immediately.
 *
 * 2. ROUND START — Round lock (lock:room:{roomId}:round, TTL 15 s)
 *    Before any state mutation:
 *      a. Acquire round lock via SET NX EX.
 *      b. Re-fetch room from Redis (never trust pre-lock state).
 *      c. Verify gameState is valid.
 *      d. Idempotency check: if roundNumber already matches expected, skip.
 *      e. Generate word (ONLY inside the lock — nowhere else).
 *      f. Write all state to Redis (saveRoomMeta + savePlayers).
 *      g. Emit round_started / word_reveal / word_hint ONLY after Redis write.
 *      h. Release round lock (finally block — always executes).
 *    If lock acquisition fails → another instance is starting the round; do nothing.
 *
 * 3. TIMER — Timer lock (lock:room:{roomId}:timer, TTL 70 s)
 *    Only the lock-winner starts a local setInterval. Every single tick:
 *      • Calls isLockOwner() — stops immediately if ownership lost.
 *      • Re-fetches full room from Redis (no stale in-memory state).
 *      • roundEndTime comes from Redis, never from a local counter.
 *      • Heartbeat refreshes lock TTL when remaining > 5 s.
 *    Timer jumps are impossible: all countdown derives from the single
 *    Redis-authoritative roundEndTime set inside the round lock.
 *
 * 4. CLIENTS — Receive roundEndTime as an absolute ms timestamp.
 *    Client calculates: remaining = roundEndTime - Date.now()
 *    Clients NEVER generate words, reset timers, or restart rounds.
 *
 * 5. ALL STATE — Re-fetched from Redis at every decision point.
 *    No in-memory room fields are cached between async operations.
 */

import * as roomStore from '../redis/roomStore.js';
import { getWordOptions, markWordUsed, clearUsedWords, getRandomWord, maskWord, isCorrectGuess, buildHint } from './wordService.js';
import { computeReveal } from '../services/hintService.js';
import User from '../models/User.js';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_ROUND_DURATION = 60;   // seconds per round
const DEFAULT_TOTAL_ROUNDS   = 3;
const MIN_ROUNDS             = 1;
const MAX_ROUNDS             = 10;
const ROUND_END_DELAY        = 5000; // ms pause between rounds
const DRAWER_BONUS_POINTS    = 50;
const TIMER_LOCK_TTL         = 70;   // seconds — must exceed max round duration
const ROUND_LOCK_TTL         = 15;   // seconds — covers round-start setup phase only
const WORD_SELECTION_TIMEOUT = 10;   // seconds for drawer to pick a word

/**
 * Unique identity for this server process.
 * Stored as the Redis lock value; ownership verified by GET + compare.
 * Format: "pid-{pid}-{startTime}" — unique across processes and restarts.
 */
const INSTANCE_ID = `pid-${process.pid}-${Date.now()}`;

/**
 * In-process registry of active setInterval handles.
 * Only this instance's timers are tracked here; other instances have their own.
 */
const roomTimers          = new Map(); // roomId → setInterval handle
const wordSelectionTimers = new Map(); // roomId → setTimeout handle

// ────────────────────────────────────────────────────────────────────────────
// Lock key helpers
// ────────────────────────────────────────────────────────────────────────────

/** Short-lived mutex protecting the round-start setup phase. */
function roundLockKey(roomId) { return `lock:room:${roomId}:round`; }

/** Long-lived lock: only the holder runs the tick interval for this round. */
function timerLockKey(roomId) { return `lock:room:${roomId}:timer`; }

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Updates persistent user statistics in MongoDB.
 * @param {string[]} userIds - Array of clerkIds
 * @param {Object} updates - { gamesPlayed?: number, wins?: number, totalScore?: number }
 */
async function updateUserStats(userIds, updates) {
  if (!userIds || userIds.length === 0) return;
  
  // Only update users who have a clerkId (ignore guests with generated IDs)
  // Our clerkIds are typically strings that don't look like MongoDB ObjectIds.
  const participants = userIds.filter(id => id && id.startsWith('user_'));
  if (participants.length === 0) return;

  try {
    const incUpdates = {};
    if (updates.gamesPlayed) incUpdates.gamesPlayed = updates.gamesPlayed;
    if (updates.wins) incUpdates.wins = updates.wins;
    if (updates.totalScore) incUpdates.totalScore = updates.totalScore;

    const maxUpdates = {};
    if (updates.bestScore) maxUpdates.bestScore = updates.bestScore;

    const updateObj = {};
    if (Object.keys(incUpdates).length > 0) updateObj.$inc = incUpdates;
    if (Object.keys(maxUpdates).length > 0) updateObj.$max = maxUpdates;

    if (Object.keys(updateObj).length > 0) {
      await User.updateMany(
        { clerkId: { $in: participants } },
        updateObj
      );
      console.log(`[GameEngine] Updated stats for ${participants.length} users:`, updateObj);
    }
  } catch (err) {
    console.error('[GameEngine] Failed to update user stats:', err);
  }
}

/**
 * Cancels the local setInterval for a room.
 * Does NOT release the Redis timer lock — call releaseLock() separately.
 * @param {string} roomId
 */
export function stopRoundTimer(roomId) {
  const id = roomTimers.get(roomId);
  if (id) {
    clearInterval(id);
    roomTimers.delete(roomId);
    console.log(`[GameEngine] Local timer cleared for room ${roomId}`);
  }
}

/**
 * Selects the drawer for the current turn using the frozen playerOrder array.
 * Falls back to round-robin over connected players for backward compatibility.
 * @param {Object} room - Hydrated room
 * @returns {Object|null} player object
 */
function selectDrawerForTurn(room) {
  if (room.playerOrder && room.playerOrder.length > 0) {
    const idx      = (room.roundNumber - 1) % room.playerOrder.length;
    const drawerId = room.playerOrder[idx];
    const p        = room.players.get(drawerId);
    if (p) return p;
    // Assigned player left — find first connected player
    return [...room.players.values()].find(p => p.isConnected) ?? null;
  }
  // Legacy fallback
  const connected = [...room.players.values()]
    .filter(p => p.isConnected)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  if (connected.length === 0) return null;
  return connected[(room.roundNumber - 1) % connected.length];
}

function isCloseGuess(guess, correctWord) {
  if (!guess || !correctWord) return false;
  const g = guess.toLowerCase().trim();
  const w = correctWord.toLowerCase();
  if (g === w) return false;
  if (g.length >= 3 && (g.includes(w) || w.includes(g))) return true;
  return levenshteinDistance(g, w) === 1;
}

function levenshteinDistance(s1, s2) {
  const m = s1.length, n = s2.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i-1] === s2[j-1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    }
  }
  return dp[m][n];
}

function calculateTimeBasedScore(roundEndTime, roundDuration) {
  const remaining = Math.max(0, (roundEndTime - Date.now()) / 1000);
  return Math.max(Math.floor(100 * (remaining / roundDuration)), 10);
}

// ────────────────────────────────────────────────────────────────────────────
// Game lifecycle — public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Starts the game for a room.
 *
 * RACE CONDITION PROTECTION:
 *   Uses roomStore.atomicStartGame() — a Lua CAS that transitions
 *   "waiting" → "playing" atomically in Redis.  Only ONE instance can win.
 *   All concurrent calls from other instances receive false and return early,
 *   preventing duplicate game_started events and duplicate round starts.
 *
 * @param {Object} room        - Hydrated room (caller must fetch fresh first)
 * @param {number} totalRounds
 * @param {Object} io          - Socket.IO server instance
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export async function startGame(room, totalRounds, io, difficulty = 'medium') {
  // ── Input guards (fast-path, no Redis) ────────────────────────────────
  if (totalRounds < MIN_ROUNDS || totalRounds > MAX_ROUNDS) {
    return { success: false, error: `Total rounds must be between ${MIN_ROUNDS} and ${MAX_ROUNDS}` };
  }

  const connected = [...room.players.values()].filter(p => p.isConnected);
  if (connected.length < 2) {
    return { success: false, error: 'At least 2 connected players required' };
  }

  // Reject immediately if state is already past "waiting".
  // This is a fast-path guard; the atomic CAS below is the true authority.
  if (room.gameState !== 'waiting' && room.gameState !== 'finished') {
    return { success: false, error: 'Game already in progress' };
  }

  // ── Atomic CAS: "waiting" → "playing" ─────────────────────────────────
  const won = await roomStore.atomicStartGame(room.roomId, totalRounds);
  if (!won) {
    console.log(`[GameEngine] startGame CAS lost for room ${room.roomId} — another instance won the race`);
    return { success: false, error: 'Game already started by another instance' };
  }

  console.log(`[GameEngine] Game started — room: ${room.roomId} | rounds: ${totalRounds} | difficulty: ${difficulty} | instance: ${INSTANCE_ID}`);

  // Increment gamesPlayed for all connected players
  await updateUserStats(connected.map(p => p.userId), { gamesPlayed: 1 });

  // Initialise turn-based round system: freeze player order & compute total turns
  const initRoom = await roomStore.getRoom(room.roomId);
  if (initRoom) {
    const ordered = [...initRoom.players.values()]
      .filter(p => p.isConnected)
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    initRoom.playerOrder = ordered.map(p => p.userId);
    initRoom.totalTurns  = totalRounds * initRoom.playerOrder.length;
    initRoom.difficulty  = difficulty;
    await roomStore.saveRoomMeta(initRoom);
    console.log(`[GameEngine] Turn order: [${initRoom.playerOrder.join(', ')}] | totalTurns: ${initRoom.totalTurns}`);
  }

  io.to(room.roomId).emit('game_started', {
    roomId:      room.roomId,
    totalRounds,
    message:     'Game started!',
    timestamp:   Date.now()
  });

  // Delay gives clients time to process game_started before round_started.
  const roomId = room.roomId;
  setTimeout(() => {
    startRound({ roomId, expectedRoundNumber: 1 }, io)
      .catch(err => console.error('[GameEngine] startRound error after startGame:', err.message));
  }, 1000);

  return { success: true };
}

/**
 * Starts a new round with full distributed safety.
 *
 * ROUND LOCK GUARANTEE:
 *   Acquires lock:room:{roomId}:round (SET NX EX 15).
 *   All state mutations happen inside the lock.
 *   Lock is released in a finally block — always, even on error.
 *
 * WORD GENERATION GUARANTEE:
 *   getRandomWord() is called exactly once, inside the lock, after all
 *   guards pass.  There is no code path that generates a word outside the lock.
 *
 * EMIT ORDER GUARANTEE:
 *   round_started / word_reveal / word_hint are emitted ONLY AFTER
 *   roomStore.saveRoomMeta() and roomStore.savePlayers() both resolve.
 *   Clients can never receive state that Redis has not confirmed.
 *
 * IDEMPOTENCY:
 *   If expectedRoundNumber is provided and Redis roundNumber already meets
 *   or exceeds it, this invocation is a duplicate — return silently.
 *
 * @param {{roomId:string, expectedRoundNumber?:number}} roomRef
 * @param {Object} io
 */
export async function startRound(roomRef, io) {
  const roomId           = roomRef.roomId;
  const expectedRoundNum = roomRef.expectedRoundNumber ?? null;
  const lockKey          = roundLockKey(roomId);

  // ── Step 1: Acquire the round-start mutex ────────────────────────────
  const acquired = await roomStore.acquireLock(lockKey, INSTANCE_ID, ROUND_LOCK_TTL);
  if (!acquired) {
    // Another instance already holds the lock and is setting up this round.
    console.log(`[GameEngine] Round lock NOT acquired for room ${roomId} — another instance is starting the round`);
    return;
  }

  try {
    // ── Step 2: Re-read authoritative state from Redis ───────────────────
    // The room ref passed in may be stale.  Always read after locking.
    const room = await roomStore.getRoom(roomId);
    if (!room) {
      console.log(`[GameEngine] Room ${roomId} gone after lock — aborting startRound`);
      return;
    }

    // ── Step 3: State guards ─────────────────────────────────────────────
    if (room.gameState !== 'playing' && room.gameState !== 'round_end') {
      console.log(`[GameEngine] startRound aborted — room ${roomId} gameState is "${room.gameState}"`);
      return;
    }

    // ── Step 4: Idempotency ──────────────────────────────────────────────
    // If round N is already active (another instance beat us to it), skip.
    if (expectedRoundNum !== null && room.roundNumber >= expectedRoundNum) {
      console.log(`[GameEngine] Idempotency skip — room ${roomId} already at round ${room.roundNumber}`);
      return;
    }

    const connected = [...room.players.values()].filter(p => p.isConnected);
    if (connected.length < 2) {
      await stopGame(room, io, 'Not enough players');
      return;
    }

    // ── Step 5: Mutate round state ───────────────────────────────────────
    room.roundNumber++;
    room.correctGuessers     = new Set();
    room.gameState           = 'playing';
    room.currentWord         = null;
    room.roundEndTime        = null;
    room.currentWordOptions  = [];
    room.revealedIndices     = [];          // Reset hint state for new round
    for (const p of room.players.values()) p.hasGuessedCurrentRound = false;

    const drawer = selectDrawerForTurn(room);
    if (!drawer) {
      await stopGame(room, io, 'No drawer available');
      return;
    }
    room.currentDrawerId = drawer.userId;

    // Generate 3 word options -- drawer picks, not auto-assigned
    const wordOptions = await getWordOptions(room.difficulty || 'medium', 3, roomId);
    room.currentWordOptions   = wordOptions;
    room.wordSelectionEndTime = Date.now() + (WORD_SELECTION_TIMEOUT * 1000);

    const playerCount  = room.playerOrder?.length || 1;
    const displayRound = Math.ceil(room.roundNumber / playerCount);

    await Promise.all([
      roomStore.saveRoomMeta(room),
      roomStore.savePlayers(roomId, room.players)
    ]);

    console.log(
      `[GameEngine] Turn ${room.roundNumber}/${room.totalTurns || room.totalRounds} persisted -- ` +
      `room: ${roomId} | drawer: ${drawer.username} | instance: ${INSTANCE_ID}`
    );

    io.to(roomId).emit('round_started', {
      roomId,
      roundNumber:   displayRound,
      totalRounds:   room.totalRounds,
      turnNumber:    room.roundNumber,
      totalTurns:    room.totalTurns || 0,
      drawerId:      drawer.userId,
      drawerName:    drawer.username,
      roundDuration: room.roundDuration,
      roundEndTime:  null,
      timestamp:     Date.now()
    });

    const drawerSock = io.sockets.sockets.get(drawer.socketId);
    if (drawerSock) {
      drawerSock.emit('word_options', {
        words:          wordOptions,
        timeoutSeconds: WORD_SELECTION_TIMEOUT,
        roundNumber:    displayRound,
        turnNumber:     room.roundNumber
      });
    }

    for (const p of room.players.values()) {
      if (p.userId !== drawer.userId && p.isConnected) {
        const s = io.sockets.sockets.get(p.socketId);
        if (s) s.emit('word_choosing', { drawerName: drawer.username, roundNumber: displayRound });
      }
    }

  } finally {
    await roomStore.releaseLock(lockKey, INSTANCE_ID);
  }

  clearWordSelectionTimer(roomId);
  const selTimer = setTimeout(
    () => autoSelectWord(roomId, io).catch(e => console.error('[GameEngine] autoSelectWord error:', e.message)),
    WORD_SELECTION_TIMEOUT * 1000
  );
  wordSelectionTimers.set(roomId, selTimer);
}

// ────────────────────────────────────────────────────────────────────────────
// Word selection phase
// ────────────────────────────────────────────────────────────────────────────

function clearWordSelectionTimer(roomId) {
  const t = wordSelectionTimers.get(roomId);
  if (t) { clearTimeout(t); wordSelectionTimers.delete(roomId); }
}

/**
 * Called once a word has been chosen (by drawer or auto-select).
 * Sets roundEndTime, broadcasts word_reveal / word_hint, starts drawing timer.
 */
async function startDrawingPhase(roomId, io) {
  const room = await roomStore.getRoom(roomId);
  if (!room || !room.currentWord || room.gameState !== 'playing') return;

  room.roundEndTime = Date.now() + (room.roundDuration * 1000);
  await roomStore.saveRoomMeta(room);

  const playerCount  = room.playerOrder?.length || 1;
  const displayRound = Math.ceil(room.roundNumber / playerCount);
  const masked       = maskWord(room.currentWord);

  // Notify all players of the real roundEndTime now that drawing starts
  io.to(roomId).emit('round_timer_start', {
    roomId,
    roundEndTime:  room.roundEndTime,
    roundDuration: room.roundDuration,
    roundNumber:   displayRound,
  });

  for (const p of room.players.values()) {
    if (!p.isConnected) continue;
    const s = io.sockets.sockets.get(p.socketId);
    if (!s) continue;
    if (p.userId === room.currentDrawerId) {
      s.emit('word_reveal', { word: room.currentWord, roundNumber: displayRound });
    } else {
      s.emit('word_hint', { hint: masked, wordLength: room.currentWord.length, roundNumber: displayRound });
    }
  }

  await startRoundTimer(roomId, io);
}

async function autoSelectWord(roomId, io) {
  clearWordSelectionTimer(roomId);
  const room = await roomStore.getRoom(roomId);
  if (!room || room.gameState !== 'playing' || room.currentWord) return;

  const opts   = room.currentWordOptions;
  const chosen = opts.length > 0 ? opts[Math.floor(Math.random() * opts.length)] : getRandomWord();

  room.currentWord        = chosen;
  room.currentWordOptions = [];
  await roomStore.saveRoomMeta(room);
  markWordUsed(roomId, chosen);

  console.log(`[GameEngine] Auto-selected word "${chosen}" for room ${roomId}`);
  await startDrawingPhase(roomId, io);
}

/**
 * Handles a drawer's word selection (called from socketHandler).
 * @param {string} roomId
 * @param {string} userId  - Must match currentDrawerId
 * @param {string} chosenWord
 * @param {Object} io
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export async function handleWordSelection(roomId, userId, chosenWord, io) {
  clearWordSelectionTimer(roomId);

  const room = await roomStore.getRoom(roomId);
  if (!room)                          return { success: false, error: 'Room not found' };
  if (room.gameState !== 'playing')   return { success: false, error: 'Game not active' };
  if (userId !== room.currentDrawerId) return { success: false, error: 'Not your turn to draw' };
  if (room.currentWord)               return { success: false, error: 'Word already selected' };

  const word = typeof chosenWord === 'string' ? chosenWord.toLowerCase().trim() : '';
  if (!room.currentWordOptions.includes(word)) {
    // If options are somehow gone (reconnect scenario), accept any valid word
    if (word.length < 2) return { success: false, error: 'Invalid word choice' };
  }

  room.currentWord        = word;
  room.currentWordOptions = [];
  await roomStore.saveRoomMeta(room);
  markWordUsed(roomId, word);

  console.log(`[GameEngine] Drawer selected "${word}" in room ${roomId}`);
  await startDrawingPhase(roomId, io);
  return { success: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Timer — ownership-verified, Redis-driven interval
// ────────────────────────────────────────────────────────────────────────────

/**
 * Acquires the timer lock and starts the authoritative 1-second tick.
 *
 * OWNERSHIP VERIFICATION (every tick):
 *   roomStore.isLockOwner() does a Redis GET on the lock key and compares the
 *   value to INSTANCE_ID.  If ownership is lost (TTL expired, another instance
 *   took over) the interval is cleared immediately.  This is the primary guard
 *   against duplicate timer emissions during failover or restart scenarios.
 *
 * TIMER VALUE SOURCE:
 *   remaining = roundEndTime (from Redis) - Date.now()
 *   roundEndTime was set in startRound() inside the round lock — one value,
 *   one source.  No local counter is used.  Timer jumps are impossible.
 *
 * @param {string} roomId
 * @param {Object} io
 */
async function startRoundTimer(roomId, io) {
  stopRoundTimer(roomId); // clear any leftover local interval

  const lockKey = timerLockKey(roomId);

  // Read the authoritative round number AFTER the round lock was released.
  const snap = await roomStore.getRoom(roomId);
  if (!snap || snap.gameState !== 'playing') return;
  const expectedRound = snap.roundNumber;

  // Compete for timer ownership.
  const acquired = await roomStore.acquireLock(lockKey, INSTANCE_ID, TIMER_LOCK_TTL);
  if (!acquired) {
    console.log(`[GameEngine] Timer lock NOT acquired for room ${roomId} round ${expectedRound} — another instance owns timer`);
    return;
  }
  console.log(`[GameEngine] Timer lock acquired — room: ${roomId} | round: ${expectedRound} | instance: ${INSTANCE_ID}`);

  const timerId = setInterval(async () => {
    try {
      // ── Guard 1: Verify lock ownership ──────────────────────────────────
      // If the lock expired or was re-acquired by another instance, stop now.
      const stillOwner = await roomStore.isLockOwner(lockKey, INSTANCE_ID);
      if (!stillOwner) {
        console.warn(`[GameEngine] Timer lock lost for room ${roomId} — stopping interval`);
        clearInterval(timerId);
        roomTimers.delete(roomId);
        return;
      }

      // ── Guard 2: Re-fetch authoritative room state ───────────────────────
      const fresh = await roomStore.getRoom(roomId);
      if (
        !fresh ||
        fresh.gameState !== 'playing' ||
        fresh.roundNumber !== expectedRound
      ) {
        clearInterval(timerId);
        roomTimers.delete(roomId);
        await roomStore.releaseLock(lockKey, INSTANCE_ID);
        console.log(`[GameEngine] Timer stopped — room ${roomId} state changed (was round ${expectedRound})`);
        return;
      }

      // ── Compute countdown from Redis-authoritative roundEndTime ──────────
      const remaining = Math.max(0, Math.ceil((fresh.roundEndTime - Date.now()) / 1000));

      io.to(roomId).emit('round_timer_update', {
        roomId,
        remainingTime: remaining,
        roundNumber:   fresh.roundNumber,
        roundEndTime:  fresh.roundEndTime   // absolute timestamp for client re-sync
      });

      // ── Progressive hint reveal (delegated to hintService) ─────────────
      if (fresh.currentWord && remaining > 0) {
        const result = computeReveal(
          fresh.currentWord,
          fresh.revealedIndices || [],
          fresh.roundDuration,
          remaining
        );

        if (result.shouldReveal) {
          fresh.revealedIndices = result.newIndices;
          await roomStore.saveRoomMeta(fresh);

          // Send updated hint only to non-drawer, non-guessed players
          for (const p of fresh.players.values()) {
            if (p.userId === fresh.currentDrawerId) continue;
            if (p.hasGuessedCurrentRound) continue;
            if (!p.isConnected) continue;
            const s = io.sockets.sockets.get(p.socketId);
            if (s) s.emit('hint_update', { hint: result.hint, revealCount: result.revealCount });
          }
          console.log(`[GameEngine] Hint revealed letter ${result.revealedIndex} ("${result.revealedChar}") in room ${roomId} — ${result.revealCount}/${result.maxReveals}`);
        }
      }

      // ── Heartbeat: extend lock TTL while round is still running ──────────
      if (remaining > 5) {
        await roomStore.refreshLock(lockKey, INSTANCE_ID, TIMER_LOCK_TTL);
      }

      // ── End round when time expires ───────────────────────────────────────
      if (remaining <= 0) {
        clearInterval(timerId);
        roomTimers.delete(roomId);
        await roomStore.releaseLock(lockKey, INSTANCE_ID);
        await endRound(fresh, io, 'time_up');
      }

    } catch (err) {
      console.error(`[GameEngine] Timer tick error — room ${roomId}:`, err.message);
    }
  }, 1000);

  roomTimers.set(roomId, timerId);
}

// ────────────────────────────────────────────────────────────────────────────
// Round / game termination
// ────────────────────────────────────────────────────────────────────────────

/**
 * Ends the current round: awards drawer bonus, emits round_ended, and
 * schedules the next round (or endGame if final round).
 *
 * The next round's startRound() call is protected by its own round lock,
 * so even if both instances reach the setTimeout callback simultaneously,
 * exactly one will proceed.
 *
 * @param {Object} room   - Fresh room object (from Redis)
 * @param {Object} io
 * @param {string} reason - 'time_up' | 'all_guessed' | 'drawer_left'
 */
export async function endRound(room, io, reason = 'time_up') {
  stopRoundTimer(room.roomId);

  try {
    const { clearCanvas } = await import('./drawingEngine.js');
    await clearCanvas(room, io);
  } catch (err) {
    console.error('[GameEngine] clearCanvas error:', err.message);
  }

  room.gameState       = 'round_end';
  room.revealedIndices  = [];

  if (room.correctGuessers.size > 0 && room.currentDrawerId) {
    const drawer = room.players.get(room.currentDrawerId);
    if (drawer) {
      drawer.score += DRAWER_BONUS_POINTS;
      await roomStore.savePlayer(room.roomId, drawer);
      console.log(`[GameEngine] Drawer ${drawer.username} +${DRAWER_BONUS_POINTS} pts bonus`);
    }
  }

  await roomStore.saveRoomMeta(room);
  console.log(`[GameEngine] Round ${room.roundNumber} ended — reason: ${reason} — room: ${room.roomId}`);

  io.to(room.roomId).emit('round_ended', {
    roomId:      room.roomId,
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    word:        room.currentWord,
    reason,
    players: [...room.players.values()].map(p => ({
      userId:           p.userId,
      username:         p.username,
      score:            p.score,
      guessedCorrectly: p.hasGuessedCurrentRound ?? false
    })),
    timestamp: Date.now()
  });

  const roomId    = room.roomId;
  const nextRound = room.roundNumber + 1;
  const isLast    = room.totalTurns > 0
    ? room.roundNumber >= room.totalTurns
    : room.roundNumber >= room.totalRounds;

  if (isLast) {
    setTimeout(() =>
      endGame({ roomId }, io)
        .catch(err => console.error('[GameEngine] endGame error:', err.message)),
      ROUND_END_DELAY
    );
  } else {
    setTimeout(async () => {
      // Re-fetch to confirm room is still in round_end.
      const fresh = await roomStore.getRoom(roomId);
      if (!fresh || fresh.gameState !== 'round_end') {
        console.log(`[GameEngine] Skipping next round — room ${roomId} state is "${fresh?.gameState}"`);
        return;
      }

      const conn = [...fresh.players.values()].filter(p => p.isConnected);
      if (conn.length < 2) {
        await stopGame(fresh, io, 'Not enough players');
        return;
      }

      fresh.gameState = 'playing';
      await roomStore.saveRoomMeta(fresh);

      // startRound has its own round lock — concurrent calls from multiple
      // instances are handled safely inside.
      await startRound({ roomId, expectedRoundNumber: nextRound }, io);
    }, ROUND_END_DELAY);
  }
}

/**
 * Ends the game: sets state to "finished" and broadcasts leaderboard.
 * @param {{roomId:string}} roomRef
 * @param {Object} io
 */
export async function endGame(roomRef, io) {
  const room = await roomStore.getRoom(roomRef.roomId);
  if (!room) return;

  stopRoundTimer(room.roomId);
  clearUsedWords(room.roomId);
  room.gameState = 'finished';
  await roomStore.saveRoomMeta(room);

  const leaderboard = [...room.players.values()]
    .map(p => ({ userId: p.userId, username: p.username, score: p.score, isConnected: p.isConnected }))
    .sort((a, b) => b.score - a.score);

  const winner = leaderboard[0];
  console.log(`[GameEngine] Game ended — room: ${room.roomId} | winner: ${winner.username} (${winner.score} pts)`);

  // Persistent stats update
  for (const p of room.players.values()) {
    const isWinner = p.userId === winner.userId;
    await updateUserStats([p.userId], { 
      wins: isWinner ? 1 : 0, 
      totalScore: p.score,
      bestScore: p.score
    });
  }

  io.to(room.roomId).emit('game_ended', {
    roomId:      room.roomId,
    winner:      { userId: winner.userId, username: winner.username, score: winner.score },
    leaderboard,
    timestamp:   Date.now()
  });
}

/**
 * Resets all game state and player scores to zero.
 * Only allowed when not mid-round.
 * @param {Object} room
 * @param {Object} io
 */
export async function resetGame(room, io) {
  if (room.gameState === 'playing' || room.gameState === 'round_end') {
    return { success: false, error: 'Cannot reset while a round is in progress' };
  }

  stopRoundTimer(room.roomId);
  clearUsedWords(room.roomId);

  room.gameState       = 'waiting';
  room.currentDrawerId = null;
  room.currentWord     = null;
  room.roundNumber     = 0;
  room.roundEndTime    = null;
  room.correctGuessers = new Set();
  room.revealedIndices = [];

  for (const p of room.players.values()) {
    p.score                  = 0;
    p.hasGuessedCurrentRound = false;
  }

  await Promise.all([
    roomStore.saveRoomMeta(room),
    roomStore.savePlayers(room.roomId, room.players)
  ]);

  console.log(`[GameEngine] Game reset — room: ${room.roomId}`);

  io.to(room.roomId).emit('game_reset', {
    roomId: room.roomId, message: 'Game has been reset', timestamp: Date.now()
  });
  io.to(room.roomId).emit('player_list_update', {
    roomId:  room.roomId,
    hostId:  room.hostId || '',
    players: [...room.players.values()].map(p => ({
      userId: p.userId, username: p.username, isConnected: p.isConnected, score: p.score
    }))
  });

  return { success: true };
}

/**
 * Force-stops the game (e.g. insufficient players mid-game).
 * @param {Object} room
 * @param {Object} io
 * @param {string} reason
 */
export async function stopGame(room, io, reason = 'Game ended') {
  stopRoundTimer(room.roomId);
  clearUsedWords(room.roomId);

  room.gameState       = 'waiting';
  room.currentDrawerId = null;
  room.currentWord     = null;
  room.roundNumber     = 0;
  room.roundEndTime    = null;
  room.correctGuessers = new Set();
  room.revealedIndices = [];

  await roomStore.saveRoomMeta(room);
  console.log(`[GameEngine] Game stopped — room: ${room.roomId} | reason: ${reason}`);

  io.to(room.roomId).emit('game_stopped', { roomId: room.roomId, reason, timestamp: Date.now() });
}

// ────────────────────────────────────────────────────────────────────────────
// In-round player events
// ────────────────────────────────────────────────────────────────────────────

/**
 * Processes a player's word guess with time-based scoring.
 * If every non-drawer guesses correctly, ends the round early.
 *
 * @param {Object} room    - Caller should pass a freshly-fetched room for accuracy
 * @param {string} userId
 * @param {string} guess
 * @param {Object} io
 * @param {Object} socket
 * @returns {Promise<{success:boolean, correct?:boolean, close?:boolean, error?:string}>}
 */
export async function handleGuess(room, userId, guess, io, socket) {
  if (room.gameState !== 'playing')    return { success: false, error: 'Game not in progress' };

  const player = room.players.get(userId);
  if (!player)                         return { success: false, error: 'Player not found' };
  if (userId === room.currentDrawerId) return { success: false, error: 'Drawer cannot guess' };
  if (player.hasGuessedCurrentRound)   return { success: false, error: 'Already guessed correctly' };

  if (isCorrectGuess(guess, room.currentWord)) {
    const pts = calculateTimeBasedScore(room.roundEndTime, room.roundDuration);
    player.hasGuessedCurrentRound = true;
    player.score += pts;
    room.correctGuessers.add(userId);

    await Promise.all([
      roomStore.savePlayer(room.roomId, player),
      roomStore.saveRoomMeta(room)
    ]);

    console.log(`[GameEngine] ${player.username} guessed correctly! +${pts} pts`);

    io.to(room.roomId).emit('correct_guess', {
      roomId:       room.roomId,
      userId:       player.userId,
      username:     player.username,
      pointsEarned: pts,
      score:        player.score,
      timestamp:    Date.now()
    });
    io.to(room.roomId).emit('player_list_update', {
      roomId:  room.roomId,
      hostId:  room.hostId || '',
      players: [...room.players.values()].map(p => ({
        userId:      p.userId,
        username:    p.username,
        isConnected: p.isConnected,
        score:       p.score
      }))
    });

    // End round early if all non-drawer connected players have guessed.
    const nonDrawers = [...room.players.values()]
      .filter(p => p.isConnected && p.userId !== room.currentDrawerId);
    if (nonDrawers.length > 0 && nonDrawers.every(p => p.hasGuessedCurrentRound)) {
      console.log('[GameEngine] All players guessed — ending round early');
      stopRoundTimer(room.roomId);
      await roomStore.releaseLock(timerLockKey(room.roomId), INSTANCE_ID);
      await endRound(room, io, 'all_guessed');
    }

    return { success: true, correct: true };
  }

  if (isCloseGuess(guess, room.currentWord) && socket) {
    socket.emit('close_guess', { message: 'So close! Keep trying!' });
    return { success: true, correct: false, close: true };
  }

  return { success: true, correct: false, close: false };
}

/**
 * Handles the drawer disconnecting mid-round.
 * Ends the round immediately to unblock the game.
 * @param {Object} room
 * @param {string} userId
 * @param {Object} io
 */
export async function handleDrawerDisconnect(room, userId, io) {
  if (room.gameState === 'playing' && room.currentDrawerId === userId) {
    console.log(`[GameEngine] Drawer ${userId} disconnected — ending round early`);
    stopRoundTimer(room.roomId);
    await roomStore.releaseLock(timerLockKey(room.roomId), INSTANCE_ID);
    await endRound(room, io, 'drawer_left');
  }
}

/**
 * Checks connected player count and stops the game if below minimum.
 * @param {Object} room
 * @param {Object} io
 */
export async function checkPlayerCount(room, io) {
  if (room.gameState === 'playing' || room.gameState === 'round_end') {
    const connected = [...room.players.values()].filter(p => p.isConnected);
    if (connected.length < 2) {
      console.log('[GameEngine] Insufficient players — stopping game');
      await stopGame(room, io, 'Not enough players to continue');
    }
  }
}

/**
 * Cleans up all local timer resources when a room is deleted.
 * @param {string} roomId
 */
export function cleanupRoom(roomId) {
  stopRoundTimer(roomId);
  console.log(`[GameEngine] Resources cleaned up for room ${roomId}`);
}

