/**
 * Auth service — thin helpers for Clerk-based auth.
 *
 * Clerk manages all session/token state internally. These helpers provide
 * a convenient interface for the rest of the app (e.g. socket auth).
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

export interface AuthUser {
  id: string;
  clerkId: string;
  username: string;
  email: string | null;
  avatar: string;
  gamesPlayed: number;
  wins: number;
  totalScore: number;
  streak: number;
  bestScore: number;
  rankInfo: {
    currentRank: string;
    nextRank: string;
    progress: number;
    pointsToNext: number;
    description: string;
  };
}

/**
 * Fetch the current user's profile from our backend.
 * Requires a valid Clerk session token.
 */
export async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${BACKEND_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch user");
  return data.user as AuthUser;
}

/**
 * Update the user's display name on our backend.
 */
export async function updateUsername(token: string, username: string): Promise<AuthUser> {
  const res = await fetch(`${BACKEND_URL}/auth/update-username`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update username");
  return data.user as AuthUser;
}
