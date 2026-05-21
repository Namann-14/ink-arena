/**
 * Drawing Engine (Phase 4 + Distributed)
 * Handles real-time stroke validation, broadcasting, and Redis-backed storage.
 * Strokes are stored in Redis Lists — not in memory — so all server instances
 * share the same history and late-joining clients always get a full sync.
 */

import * as roomStore from '../redis/roomStore.js';

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

const MAX_STROKE_SIZE = 50;
const MIN_STROKE_SIZE = 1;
const HEX_COLOR_REGEX = /^#([0-9A-F]{3}){1,2}$/i;

// ──────────────────────────────────────────────────────────────────────────
// Validation helpers
// ──────────────────────────────────────────────────────────────────────────

function validateStroke(stroke) {
  if (!stroke || typeof stroke !== 'object') {
    return { valid: false, error: 'Stroke must be an object' };
  }

  for (const field of ['x', 'y', 'prevX', 'prevY', 'color', 'size']) {
    if (!(field in stroke)) return { valid: false, error: `Missing required field: ${field}` };
  }

  for (const coord of ['x', 'y', 'prevX', 'prevY']) {
    if (typeof stroke[coord] !== 'number' || isNaN(stroke[coord])) {
      return { valid: false, error: `${coord} must be a valid number` };
    }
  }

  if (typeof stroke.size !== 'number' || isNaN(stroke.size)) {
    return { valid: false, error: 'size must be a valid number' };
  }
  if (stroke.size < MIN_STROKE_SIZE || stroke.size > MAX_STROKE_SIZE) {
    return { valid: false, error: `size must be between ${MIN_STROKE_SIZE} and ${MAX_STROKE_SIZE}` };
  }

  if (typeof stroke.color !== 'string' || !HEX_COLOR_REGEX.test(stroke.color)) {
    return { valid: false, error: 'color must be a valid hex color (#RGB or #RRGGBB)' };
  }

  return { valid: true };
}

function isDrawerAuthorized(room, userId) {
  if (room.gameState !== 'playing') {
    return { authorized: false, error: 'Drawing only allowed during active round' };
  }
  if (room.currentDrawerId !== userId) {
    return { authorized: false, error: 'Only the drawer can draw' };
  }
  return { authorized: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Core drawing functions (all async — strokes go to Redis)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Handles a single draw stroke from a client.
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export async function handleDrawStroke(room, userId, stroke, socket, io) {
  try {
    const authCheck = isDrawerAuthorized(room, userId);
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error };
    }

    const validation = validateStroke(stroke);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const strokeData = {
      x: stroke.x, y: stroke.y,
      prevX: stroke.prevX, prevY: stroke.prevY,
      color: stroke.color, size: stroke.size,
      timestamp: Date.now()
    };

    await roomStore.pushStroke(room.roomId, strokeData);

    socket.to(room.roomId).emit('draw_stroke', { roomId: room.roomId, stroke: strokeData });

    return { success: true };
  } catch (err) {
    console.error('[DrawingEngine] handleDrawStroke error:', err.message);
    return { success: false, error: 'Internal server error' };
  }
}

/**
 * Handles a rAF-batched array of strokes from a client.
 * Auth is checked once; each individual stroke is validated.
 * All valid strokes are written to Redis in a single RPUSH.
 * @returns {Promise<{success:boolean, accepted?:number, rejected?:number, error?:string}>}
 */
export async function handleDrawStrokeBatch(room, userId, strokes, socket, io) {
  try {
    const authCheck = isDrawerAuthorized(room, userId);
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error };
    }

    if (!Array.isArray(strokes) || strokes.length === 0) {
      return { success: false, error: 'strokes must be a non-empty array' };
    }

    const validStrokes = [];
    let rejected = 0;

    for (const stroke of strokes) {
      const v = validateStroke(stroke);
      if (!v.valid) { rejected++; continue; }
      validStrokes.push({
        x: stroke.x, y: stroke.y,
        prevX: stroke.prevX, prevY: stroke.prevY,
        color: stroke.color, size: stroke.size,
        timestamp: Date.now()
      });
    }

    if (validStrokes.length > 0) {
      // Single RPUSH call for the whole batch — atomic and efficient
      await roomStore.pushStrokes(room.roomId, validStrokes);

      socket.to(room.roomId).emit('draw_stroke_batch', {
        roomId: room.roomId,
        strokes: validStrokes
      });
    }

    return { success: true, accepted: validStrokes.length, rejected };
  } catch (err) {
    console.error('[DrawingEngine] handleDrawStrokeBatch error:', err.message);
    return { success: false, error: 'Internal server error' };
  }
}

/**
 * Sends the full stroke history to a client (on join / reconnect).
 * Reads from Redis so it works correctly across multiple server instances.
 * @returns {Promise<{success:boolean, strokeCount?:number, error?:string}>}
 */
export async function syncStrokes(room, socket) {
  try {
    if (room.gameState !== 'playing') {
      console.log(`[DrawingEngine] No sync — game not playing in room ${room.roomId}`);
      return { success: true, strokeCount: 0 };
    }

    const strokes = await roomStore.getStrokes(room.roomId);

    socket.emit('sync_strokes', { roomId: room.roomId, strokes });

    console.log(`[DrawingEngine] Synced ${strokes.length} strokes to ${socket.id} in room ${room.roomId}`);
    return { success: true, strokeCount: strokes.length };
  } catch (err) {
    console.error('[DrawingEngine] syncStrokes error:', err.message);
    return { success: false, error: 'Failed to sync strokes' };
  }
}

/**
 * Clears the canvas: removes all strokes from Redis and broadcasts clear_canvas.
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export async function clearCanvas(room, io) {
  try {
    await roomStore.clearStrokes(room.roomId);

    io.to(room.roomId).emit('clear_canvas', { roomId: room.roomId });

    console.log(`[DrawingEngine] Canvas cleared in room ${room.roomId}`);
    return { success: true };
  } catch (err) {
    console.error('[DrawingEngine] clearCanvas error:', err.message);
    return { success: false, error: 'Failed to clear canvas' };
  }
}

/**
 * Returns the current stroke count (reads from Redis).
 * @returns {Promise<number>}
 */
export async function getStrokeCount(roomId) {
  const strokes = await roomStore.getStrokes(roomId);
  return strokes.length;
}

// ──────────────────────────────────────────────────────────────────────────
// Exported constants (for testing / validation re-use)
// ──────────────────────────────────────────────────────────────────────────

export const CONSTANTS = { MAX_STROKE_SIZE, MIN_STROKE_SIZE, HEX_COLOR_REGEX };




