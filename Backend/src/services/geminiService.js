/**
 * GeminiService — Live AI word generation for InkArena
 * ══════════════════════════════════════════════════════
 *
 * Every round, 3 fresh words are requested directly from Gemini.
 * No long-lived cache — each batch is unique and truly random.
 *
 * Fallback: if Gemini is unreachable or returns too few valid words,
 * a small emergency list is used so the game never blocks.
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';

// ── Tiny emergency fallback (only used if Gemini is totally unreachable) ──────
const FALLBACK_WORDS = [
  'cat', 'dog', 'sun', 'car', 'hat', 'fish', 'bird', 'tree', 'book', 'door',
  'star', 'moon', 'cake', 'ship', 'frog', 'bear', 'duck', 'ball', 'bell',
  'rain', 'fire', 'snow', 'lamp', 'shoe', 'ring', 'boat', 'kite', 'rose',
  'milk', 'key', 'cup', 'bee', 'ant', 'owl', 'pig', 'fox', 'cow', 'bus',
  'piano', 'castle', 'rocket', 'guitar', 'camera', 'candle', 'bridge',
  'dragon', 'ladder', 'mirror', 'pillow', 'robot', 'trophy', 'compass',
  'diamond', 'pencil', 'anchor', 'pizza', 'coffee', 'cookie', 'crown',
  'sword', 'shield', 'bucket', 'puzzle', 'rainbow', 'island', 'snowman',
  'campfire', 'mushroom', 'backpack', 'starfish', 'cupcake', 'sailboat',
];

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Valid drawing-game word:
 *   • 2–20 total characters
 *   • 1 or 2 words max
 *   • Each word ≤ 12 characters
 *   • Only lowercase letters and spaces
 */
export function isValidWord(w) {
  if (!w || typeof w !== 'string') return false;
  const trimmed = w.trim().toLowerCase();
  if (trimmed.length < 2 || trimmed.length > 20) return false;
  if (!/^[a-z ]+$/.test(trimmed)) return false;
  const parts = trimmed.split(/\s+/);
  if (parts.length > 2) return false;
  if (parts.some(p => p.length > 12 || p.length === 0)) return false;
  return true;
}

// ── Gemini API call ───────────────────────────────────────────────────────────

/**
 * Calls Gemini and returns a fresh list of random drawing-game words.
 *
 * We ask for MORE words than we need (count * 4) so even after validation
 * filtering we almost always have enough.
 *
 * @param {number} count  - How many validated words to return
 * @param {Set<string>}   usedWords - Already-used words to exclude
 * @returns {Promise<string[]|null>}  Validated words, or null on failure
 */
async function fetchFromGemini(count = 3, usedWords = new Set()) {
  if (!GEMINI_KEY) {
    console.warn('[GeminiService] No GEMINI_API_KEY — using fallback words');
    return null;
  }

  const usedHint = usedWords.size > 0
    ? ` Do NOT include these already-used words: ${[...usedWords].slice(-20).join(', ')}.`
    : '';

  const prompt =
    `You are a word generator for a Pictionary-style drawing game. ` +
    `Generate ${count * 4} unique, random, drawable words or short phrases. ` +
    `Rules: ` +
    `(1) Each entry must be 1–2 words, under 12 letters per word. ` +
    `(2) Common everyday objects, animals, food, nature, or simple actions only. ` +
    `(3) No proper nouns, brand names, or offensive content. ` +
    `(4) All lowercase letters only, no punctuation. ` +
    `(5) Be creative and vary the topics — do not repeat common words.` +
    usedHint +
    ` Return ONLY a JSON array of strings, nothing else. Example: ["apple","fire truck","penguin"]`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 512,
          temperature: 1.0,   // max creativity for variety
          topP: 0.95,
        },
      }),
      signal: AbortSignal.timeout(8000), // 8 s timeout
    });

    if (!res.ok) {
      console.warn(`[GeminiService] HTTP ${res.status} from Gemini`);
      return null;
    }

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Parse JSON array — Gemini sometimes wraps it in markdown fences
    let parsed = [];
    try {
      const match = text.match(/\[[\s\S]*?\]/);
      parsed = match ? JSON.parse(match[0]) : [];
    } catch {
      // Last-resort: split on commas and strip non-alpha chars
      parsed = text
        .split(',')
        .map(w => w.trim().toLowerCase().replace(/[^a-z ]/g, ''))
        .filter(Boolean);
    }

    const valid = parsed
      .map(w => (typeof w === 'string' ? w.toLowerCase().trim() : ''))
      .filter(isValidWord)
      .filter(w => !usedWords.has(w));

    if (valid.length < count) {
      console.warn(`[GeminiService] Only ${valid.length} valid words — need ${count}`);
      return valid.length > 0 ? valid : null;
    }

    console.log(`[GeminiService] ✓ Got ${valid.length} fresh words from Gemini`);
    return valid;
  } catch (err) {
    console.warn(`[GeminiService] Fetch error: ${err.message}`);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generates `count` fresh random words for a round.
 *
 * Called once per round for the 3 word choices shown to the drawer.
 * Each call hits the Gemini API for a truly random batch — no caching
 * so words are unique across rounds of the same game.
 *
 * @param {number}       count      - Number of word choices (default 3)
 * @param {Set<string>}  usedWords  - Words the room already played
 * @returns {Promise<string[]>}
 */
export async function generateWords(count = 3, usedWords = new Set()) {
  // Try Gemini first
  const geminiWords = await fetchFromGemini(count, usedWords);

  if (geminiWords && geminiWords.length >= count) {
    // Fisher-Yates shuffle, return exactly `count`
    const arr = [...geminiWords];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, count);
  }

  // Fill remaining slots from fallback if Gemini gave partial results
  const partial = geminiWords ?? [];
  const needed  = count - partial.length;

  const fallbackPool = FALLBACK_WORDS.filter(
    w => !usedWords.has(w) && !partial.includes(w)
  );

  // Shuffle fallback
  for (let i = fallbackPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fallbackPool[i], fallbackPool[j]] = [fallbackPool[j], fallbackPool[i]];
  }

  const combined = [...partial, ...fallbackPool.slice(0, needed)];
  console.log(`[GeminiService] Using ${partial.length} Gemini + ${needed} fallback words`);
  return combined.slice(0, count);
}

/**
 * Returns a single random fallback word (emergency use only).
 * @returns {string}
 */
export function getRandomFallbackWord() {
  return FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
}

/**
 * No-op kept for backward compatibility (cache was removed).
 */
export function clearCache() {}
