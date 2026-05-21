import { Router } from 'express';
import { getAuth, clerkClient } from '@clerk/express';
import { authMiddleware } from './authMiddleware.js';
import User from '../models/User.js';
import { getRankInfo } from '../utils/rank.js';

const router = Router();

// GET /auth/me — return the authenticated user profile (protected)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      user: {
        id: user._id,
        clerkId: user.clerkId,
        username: user.username,
        email: user.email ?? null,
        avatar: user.avatar,
        gamesPlayed: user.gamesPlayed,
        wins: user.wins,
        totalScore: user.totalScore,
        streak: user.streak ?? 0,
        bestScore: user.bestScore ?? 0,
        rankInfo: getRankInfo(user.totalScore),
      },
    });
  } catch (err) {
    console.error('[Auth] /me error:', err);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /auth/update-username — let users update their display name
router.post('/update-username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { username: username.trim() },
      { returnDocument: 'after', lean: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      user: {
        id: user._id,
        clerkId: user.clerkId,
        username: user.username,
        email: user.email ?? null,
        avatar: user.avatar,
        gamesPlayed: user.gamesPlayed,
        wins: user.wins,
        totalScore: user.totalScore,
        streak: user.streak ?? 0,
        bestScore: user.bestScore ?? 0,
        rankInfo: getRankInfo(user.totalScore),
      },
    });
  } catch (err) {
    console.error('[Auth] /update-username error:', err);
    return res.status(500).json({ error: 'Failed to update username' });
  }
});

export default router;
