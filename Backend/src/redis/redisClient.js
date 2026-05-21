import { createClient } from 'redis';

/**
 * Redis singleton client.
 *
 * Architecture:
 *  - Call connectRedis() once at server startup (server.js).
 *  - Call getRedisClient() everywhere else.
 *  - Returns null on failure so the server never crashes.
 *  - All roomStore functions use requireRedisClient() which throws
 *    a clean error caught by socketHandler's existing try/catch.
 */

let client         = null;
let isConnecting   = false;
let connectionPromise = null;

/**
 * Builds createClient options for any Redis URL.
 *
 * Handles:
 *  - rediss:// (TLS) — used by Upstash in production on Render
 *  - redis://  (plain) with upstash.io host — auto-upgraded to rediss://
 *
 * rejectUnauthorized: false is intentional — Upstash / Render can present
 * intermediate certs that Node's built-in CA bundle doesn't recognise.
 */
function buildClientOptions(rawUrl) {
  let url = rawUrl;

  // Upstash always requires TLS. If the URL was given as redis:// (plain),
  // rewrite it to rediss:// so the redis package enables TLS correctly.
  if (url.includes('upstash.io') && url.startsWith('redis://')) {
    url = 'rediss://' + url.slice('redis://'.length);
    console.log('[Redis] URL upgraded to rediss:// for Upstash TLS');
  }

  const isTLS = url.startsWith('rediss://');

  return {
    url,
    socket: {
      // Allow Upstash / Render TLS certificates that aren't in Node's CA store
      ...(isTLS ? { tls: true, rejectUnauthorized: false } : {}),

      // Exponential back-off: 200 ms → 10 s, max 20 attempts
      reconnectStrategy: (retries) => {
        if (retries > 20) {
          console.error('[Redis] Max reconnection attempts reached — giving up.');
          return new Error('Max Redis reconnection attempts exceeded');
        }
        const delay = Math.min(retries * 200, 10_000);
        console.warn(`[Redis] Reconnecting in ${delay}ms (attempt ${retries + 1})...`);
        return delay;
      },
    },
  };
}

/**
 * Connects to Redis using REDIS_URL from the environment.
 * Safe to call multiple times — connects only once (singleton).
 *
 * @returns {Promise<import('redis').RedisClientType|null>}
 */
export async function connectRedis() {
  // Already connected
  if (client?.isOpen) return client;

  // Another async call is already in progress — wait for it
  if (isConnecting && connectionPromise) return connectionPromise;

  const rawUrl = process.env.REDIS_URL;
  if (!rawUrl) {
    console.warn('[Redis] REDIS_URL not set — Redis disabled. Running in fallback mode.');
    return null;
  }

  isConnecting = true;

  connectionPromise = (async () => {
    try {
      console.log('[Redis] Connecting...');

      const opts = buildClientOptions(rawUrl);
      const c    = createClient(opts);

      // Wire up event listeners BEFORE calling connect()
      c.on('ready',        ()    => console.log('[Redis] Ready'));
      c.on('reconnecting', ()    => console.warn('[Redis] Reconnecting...'));
      c.on('error',        (err) => console.error('[Redis] Error:', err.message ?? err));

      await c.connect();
      console.log('[Redis] Connected');

      client = c;
      return client;
    } catch (err) {
      console.error('[Redis] Failed to connect:', err.message ?? err);
      console.warn('[Redis] Running in fallback mode — room operations unavailable.');
      client = null;
      return null;
    } finally {
      isConnecting = false;
    }
  })();

  return connectionPromise;
}

/**
 * Returns the active Redis client, or null if not connected.
 * Callers that require Redis should use requireRedisClient() (roomStore.js).
 *
 * @returns {import('redis').RedisClientType|null}
 */
export function getRedisClient() {
  return client;
}

/**
 * Gracefully closes the Redis connection.
 * Called during SIGTERM / SIGINT shutdown in server.js.
 */
export async function disconnectRedis() {
  if (client?.isOpen) {
    await client.disconnect();
    console.log('[Redis] Disconnected gracefully');
    client = null;
  }
}