/**
 * JoinRoom — handles /join/:roomId invite links.
 * Asks for a username then auto-joins the room and navigates to /game.
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useUser, useAuth } from "@clerk/react";
import { connectSocket, socket, safeCallback, setSocketToken } from "@/services/socket";
import { useGameStore } from "@/store/gameStore";
import AnimatedBackground from "@/components/lobby/AnimatedBackground";
import type { RoomJoinedResponse, ErrorResponse } from "@/types/socket";

const LS_USERNAME = "inka_username";
const LS_ROOM_ID  = "inka_roomId";

const JoinRoom = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate   = useNavigate();
  const { setLocalPlayer, setRoomId: storeSetRoomId } = useGameStore();
  const { user: clerkUser } = useUser();

  const [username, setUsername] = useState(
    () => localStorage.getItem(LS_USERNAME) ?? clerkUser?.username ?? clerkUser?.firstName ?? ""
  );
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);

  const { getToken } = useAuth();

  // Connect & track socket state
  useEffect(() => {
    const initSocket = async () => {
      try {
        const token = await getToken();
        setSocketToken(token);
        connectSocket();
      } catch (err) {
        console.error('[JoinRoom] Failed to get Clerk token:', err);
      }
    };
    initSocket();
    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectErr = () => setConnected(false);
    socket.on("connect",       onConnect);
    socket.on("disconnect",    onDisconnect);
    socket.on("connect_error", onConnectErr);
    if (socket.connected) setConnected(true);
    return () => {
      socket.off("connect",       onConnect);
      socket.off("disconnect",    onDisconnect);
      socket.off("connect_error", onConnectErr);
    };
  }, []);

  const handleJoin = () => {
    const un  = username.trim();
    const rid = roomId?.trim();
    if (!un)  { setError("Please enter a username."); return; }
    if (!rid) { setError("Invalid invite link — no room ID found."); return; }
    if (!connected) { setError("Not connected to server — please wait."); return; }
    setLoading(true);
    setError(null);
    socket.emit("join_room", { roomId: rid, username: un }, safeCallback((res: RoomJoinedResponse | ErrorResponse) => {
      setLoading(false);
      if (!res.success) {
        setError((res as ErrorResponse).error);
        return;
      }
      const ok = res as RoomJoinedResponse;
      storeSetRoomId(ok.roomId);
      setLocalPlayer(ok.userId, ok.username);
      localStorage.setItem(LS_USERNAME, ok.username);
      localStorage.setItem(LS_ROOM_ID,  ok.roomId);
      navigate("/game");
    }));
  };

  const roomNotFound =
    !!error && (error.toLowerCase().includes("not found") || error.toLowerCase().includes("does not exist"));

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden flex items-center justify-center px-4">
      <AnimatedBackground />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[420px] rounded-2xl border border-border bg-card shadow-[0_4px_32px_oklch(0_0_0/0.65)] p-8 space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              Join <span className="text-primary">InkArena</span>
            </h1>
            {roomId && (
              <p className="text-sm text-muted-foreground mt-1.5">
                You've been invited to room{" "}
                <span className="font-mono font-bold text-foreground bg-secondary px-2 py-0.5 rounded-lg">
                  {roomId}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Connecting indicator */}
        {!connected && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-sm">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            Connecting to server…
          </div>
        )}

        {/* Username input */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Your Username
          </label>
          <div className="relative group">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="e.g. PixelNinja"
              maxLength={24}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl pl-10 pr-4 py-3.5 text-base bg-secondary border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 hover:border-border transition-all"
            />
          </div>
        </div>

        {/* Error message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-sm"
            >
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                {error}
                {roomNotFound && (
                  <Link
                    to="/lobby"
                    className="block mt-1.5 text-xs text-primary hover:underline font-medium"
                  >
                    Create a new room instead →
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Join button */}
        <motion.button
          whileHover={{ scale: loading || !connected ? 1 : 1.02 }}
          whileTap={{ scale: loading || !connected ? 1 : 0.98 }}
          onClick={handleJoin}
          disabled={loading || !connected}
          className="relative flex items-center justify-center gap-2.5 w-full h-12 rounded-xl font-semibold text-base tracking-wide transition-all bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <motion.svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </motion.svg>
              Joining…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Enter Game
            </>
          )}
        </motion.button>

        {/* Back */}
        <p className="text-center text-xs text-muted-foreground">
          Changed your mind?{" "}
          <Link to="/lobby" className="text-primary hover:underline font-medium">
            Back to Lobby
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

export default JoinRoom;
