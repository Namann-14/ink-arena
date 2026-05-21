/**
 * HintService — Progressive letter-reveal hint system
 * ══════════════════════════════════════════════════════
 *
 * Manages the progressive hint reveal during the drawing phase.
 * Every HINT_INTERVAL seconds, one additional letter is revealed.
 * Reveals up to MAX_HINT_PERCENTAGE of the total letter count.
 *
 * API:
 *   • maskWord(word)              → "_ _ _ _   _ _ _"
 *   • buildHint(word, revealed[]) → "b _ _ _   c _ _"
 *   • computeReveal(...)          → { shouldReveal, newIndices }
 */

const HINT_INTERVAL_SECS  = 15;   // seconds between progressive hint reveals
const MAX_HINT_PERCENTAGE = 0.5;  // reveal up to 50% of letters

/**
 * Returns a fully-masked version of the word.
 * Letters → "_", spaces → "  " (double space for readability).
 * Characters are space-separated for letter-by-letter display.
 * @param {string} word
 * @returns {string}
 */
export function maskWord(word) {
  if (!word) return '';
  return word
    .split('')
    .map(c => (c === ' ' ? '  ' : '_'))
    .join(' ');
}

/**
 * Builds a partially-revealed hint string.
 * Revealed positions show the actual letter; others show '_'.
 * Spaces are always visible (shown as double space for readability).
 * @param {string} word
 * @param {number[]} revealedIndices - array of character indices to reveal
 * @returns {string}
 */
export function buildHint(word, revealedIndices = []) {
  if (!word) return '';
  const revealed = new Set(revealedIndices);
  return word
    .split('')
    .map((c, i) => {
      if (c === ' ') return '  ';
      if (revealed.has(i)) return c;
      return '_';
    })
    .join(' ');
}

/**
 * Determines whether it's time to reveal a new letter and which one.
 *
 * @param {string}   word             - The current word
 * @param {number[]} revealedIndices  - Already-revealed indices
 * @param {number}   roundDuration    - Total round duration in seconds
 * @param {number}   remaining        - Seconds remaining in the round
 * @returns {{ shouldReveal: boolean, newIndices: number[], hint: string }}
 */
export function computeReveal(word, revealedIndices = [], roundDuration, remaining) {
  if (!word || remaining <= 0) {
    return { shouldReveal: false, newIndices: revealedIndices, hint: buildHint(word, revealedIndices) };
  }

  const elapsed       = roundDuration - remaining;
  const expectedHints = Math.floor(elapsed / HINT_INTERVAL_SECS);
  const revealed      = new Set(revealedIndices);

  // Get all letter indices (non-space characters)
  const letterIndices = word
    .split('')
    .map((c, i) => (c !== ' ' ? i : -1))
    .filter(i => i >= 0);

  const maxReveals = Math.floor(letterIndices.length * MAX_HINT_PERCENTAGE);

  if (expectedHints <= revealed.size || revealed.size >= maxReveals) {
    return { shouldReveal: false, newIndices: [...revealed], hint: buildHint(word, [...revealed]) };
  }

  // Pick a random unrevealed letter index
  const unrevealed = letterIndices.filter(i => !revealed.has(i));
  if (unrevealed.length === 0) {
    return { shouldReveal: false, newIndices: [...revealed], hint: buildHint(word, [...revealed]) };
  }

  const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
  revealed.add(pick);

  const newIndices = [...revealed];
  return {
    shouldReveal: true,
    newIndices,
    hint: buildHint(word, newIndices),
    revealedChar: word[pick],
    revealedIndex: pick,
    revealCount: revealed.size,
    maxReveals,
  };
}

/**
 * Returns whether a guess matches the target word (case-insensitive).
 * @param {string} guess
 * @param {string} target
 * @returns {boolean}
 */
export function isCorrectGuess(guess, target) {
  if (!guess || !target) return false;
  return guess.trim().toLowerCase() === target.toLowerCase();
}
