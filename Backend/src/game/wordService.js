/**
 * WordService — Thin facade over GeminiService + HintService
 * ═══════════════════════════════════════════════════════════
 *
 * All word generation is delegated to GeminiService.
 * All hint/mask logic is delegated to HintService.
 * This module manages per-room used-word deduplication.
 *
 * NO static word arrays — Gemini-first, minimal fallback in GeminiService.
 */

import { generateWords, getRandomFallbackWord } from '../services/geminiService.js';
import { maskWord, buildHint, isCorrectGuess } from '../services/hintService.js';

/** @type {Map<string, Set<string>>} */
const usedWordsByRoom = new Map();

/**
 * Gets `count` word options for a room, avoiding already-used words.
 * @param {string} difficulty - (reserved for future use)
 * @param {number} count
 * @param {string} roomId
 * @returns {Promise<string[]>}
 */
export async function getWordOptions(difficulty = 'medium', count = 3, roomId = '') {
  const used = usedWordsByRoom.get(roomId) ?? new Set();
  return generateWords(count, used);
}

/**
 * Marks a word as used for a room (prevents repeats in same game).
 * @param {string} roomId
 * @param {string} word
 */
export function markWordUsed(roomId, word) {
  if (!usedWordsByRoom.has(roomId)) usedWordsByRoom.set(roomId, new Set());
  usedWordsByRoom.get(roomId).add(word);
}

/**
 * Clears used words for a room (called on game end/reset).
 * @param {string} roomId
 */
export function clearUsedWords(roomId) {
  usedWordsByRoom.delete(roomId);
}

/**
 * Returns a single random word (fallback scenario).
 * @returns {string}
 */
export function getRandomWord() {
  return getRandomFallbackWord();
}

// Re-export hint utilities so gameEngine imports stay clean
export { maskWord, buildHint, isCorrectGuess };
