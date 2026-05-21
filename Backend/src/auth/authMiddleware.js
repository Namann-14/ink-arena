import { clerkMiddleware, getAuth, clerkClient } from '@clerk/express';
import { verifyToken } from '@clerk/backend';
import User from '../models/User.js';

/**
 * Re-export clerkMiddleware for use in server.js.
 * This parses the Clerk session from cookies/headers on every request.
 */
export { clerkMiddleware };

// ── Helper: find or upsert our DB user from a Clerk user ID ──────────────────

async function findOrCreateUser(clerkId) {
  // Fast path — already exists keyed by clerkId
  let user = await User.findOne({ clerkId }).lean();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (user) {
    let streak = user.streak || 0;
    let lastActiveAt = user.lastActiveAt;
    let streakUpdated = false;

    if (!lastActiveAt) {
      streak = 1;
      lastActiveAt = now;
      streakUpdated = true;
    } else {
      const lastActiveDate = new Date(lastActiveAt.getFullYear(), lastActiveAt.getMonth(), lastActiveAt.getDate());
      const diffTime = today - lastActiveDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        streak += 1;
        lastActiveAt = now;
        streakUpdated = true;
      } else if (diffDays > 1) {
        streak = 1;
        lastActiveAt = now;
        streakUpdated = true;
      } else if (diffDays === 0) {
        lastActiveAt = now;
        streakUpdated = true;
      }
    }

    if (streakUpdated) {
      user = await User.findOneAndUpdate(
        { clerkId },
        { $set: { streak, lastActiveAt } },
        { returnDocument: 'after', lean: true }
      );
    }
    return user;
  }

  // Fetch full profile from Clerk
  const clerkUser = await clerkClient.users.getUser(clerkId);
  const email = clerkUser.emailAddresses?.[0]?.emailAddress || null;
  const username =
    clerkUser.username ||
    clerkUser.firstName ||
    email?.split('@')[0] ||
    'Player';
  const avatar =
    clerkUser.imageUrl ||
    `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(clerkId)}`;

  // Upsert: if a doc with this email already exists (from old auth), claim it
  // by setting clerkId. Otherwise create fresh. Uses findOneAndUpdate + upsert
  // to avoid race conditions and duplicate-key errors.
  const filter = email ? { $or: [{ clerkId }, { email }] } : { clerkId };

  user = await User.findOneAndUpdate(
    filter,
    {
      $set: { clerkId, avatar, lastActiveAt: now, streak: 1 },
      $setOnInsert: { username, email },
    },
    { upsert: true, returnDocument: 'after', lean: true }
  );

  return user;
}

// ── Express middleware ────────────────────────────────────────────────────────

/**
 * Express middleware — verifies the Clerk session and attaches user info
 * to req.user: { userId, username, clerkId }.
 *
 * Responds with 401 if the session is missing or invalid.
 */
export async function authMiddleware(req, res, next) {
  const { userId: clerkId } = getAuth(req);

  if (!clerkId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const user = await findOrCreateUser(clerkId);
    req.user = {
      userId: user._id.toString(),
      username: user.username,
      clerkId,
    };
    return next();
  } catch (err) {
    console.error('[Auth] Middleware error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// ── Socket.IO middleware ──────────────────────────────────────────────────────

/**
 * Socket.IO middleware — verifies the Clerk session token sent in
 * socket.handshake.auth.token.
 *
 * On success attaches socket.user = the User document.
 * On failure calls next() with an Error.
 */
export async function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('Authentication token required'));
  }

  try {
    // Verify the Clerk session JWT
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    const clerkId = payload.sub;
    if (!clerkId) {
      return next(new Error('Invalid session token'));
    }

    const user = await findOrCreateUser(clerkId);
    socket.user = user;
    return next();
  } catch (err) {
    console.error('[SocketAuth] Token verification failed:', err.message);
    return next(new Error('Invalid or expired token — please log in again'));
  }
}
