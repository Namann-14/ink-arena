import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { useUser, useAuth, UserButton } from "@clerk/react";
import { socket, setSocketToken } from "@/services/socket";
import { safeCallback } from "@/services/socket";
import { useGameStore } from "@/store/gameStore";
import ConnectionBadge from "./ConnectionBadge";
import type { RoomCreatedResponse, RoomJoinedResponse, ErrorResponse } from "@/types/socket";

// helpers
const LS_USERNAME = "inka_username";
const LS_ROOM_ID  = "inka_roomId";

const randomId = () =>
  Math.random().toString(36).substring(2, 6).toUpperCase() +
  "-" +
  Math.random().toString(36).substring(2, 6).toUpperCase();

// Neon input
interface NeonInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength?: number;
  mono?: boolean;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

const NeonInput = ({ label, value, onChange, placeholder, maxLength, mono, icon, action }: NeonInputProps) => (
  <div className="space-y-2">
    <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
      {label}
    </label>
    <div className="relative group">
      {icon && (
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none">
          {icon}
        </span>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        spellCheck={false}
        className={`
          w-full rounded-xl px-4 py-3.5 text-base bg-secondary border border-border
          text-foreground placeholder:text-muted-foreground outline-none
          transition-all duration-200
          focus:border-primary/60 focus:ring-2 focus:ring-primary/20
          hover:border-border
          ${icon ? "pl-10" : ""}
          ${action ? "pr-24" : ""}
          ${mono ? "font-mono tracking-[0.2em]" : ""}
        `}
      />
      {action && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">{action}</div>
      )}
    </div>
  </div>
);

// Neon button
interface NeonButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}

const NeonButton = ({ onClick, disabled, loading, children, variant = "primary" }: NeonButtonProps) => {
  const base =
    "relative flex items-center justify-center gap-2.5 w-full h-12 rounded-xl font-semibold text-base tracking-wide transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 overflow-hidden";

  const styles = {
    primary:
      "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary:
      "bg-secondary border border-border text-foreground hover:bg-accent",
    ghost:
      "border border-border bg-transparent text-primary hover:bg-primary/10",
  };

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles[variant]}`}
    >
      {loading ? <Spinner /> : children}
    </motion.button>
  );
};

// Spinner
const Spinner = () => (
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
);

// ── Invite Panel ────────────────────────────────────────────────────────────
interface InvitePanelProps {
  roomId: string;
  onEnterGame: () => void;
  onBack: () => void;
}

const InvitePanel = ({ roomId, onEnterGame, onBack }: InvitePanelProps) => {
  const inviteLink = `${window.location.origin}/join/${roomId}`;
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success("Invite link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — please copy manually.");
    }
  };

  const handleShare = async () => {
    if (canShare) {
      try {
        await navigator.share({
          title: "Join my InkArena game!",
          text: `Come draw and guess with me on InkArena! Room: ${roomId}`,
          url: inviteLink,
        });
      } catch {
        // User cancelled — that's fine
      }
    } else {
      handleCopy();
    }
  };

  return (
    <motion.div
      key="invite"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Status badge */}
      <div className="flex flex-col items-center text-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 border border-primary/20">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80">Room Ready</span>
        </div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">Invite Friends</h2>
        <p className="text-sm text-muted-foreground font-medium">Share your arena with others</p>
      </div>

      {/* Room ID */}
      <div className="flex flex-col items-center gap-1 p-4 rounded-2xl bg-secondary/30 border border-border/40">
        <span className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold opacity-60">Room ID</span>
        <span className="font-mono font-bold text-2xl text-foreground tracking-[0.3em]">{roomId}</span>
      </div>

      {/* Invite link row */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 min-w-0 flex items-center px-4 py-2.5 rounded-xl bg-secondary/40 border border-border/30">
            <span className="text-[11px] font-mono text-muted-foreground/80 truncate">{inviteLink}</span>
          </div>
          <button
            onClick={handleCopy}
            className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all border ${
              copied
                ? "bg-primary/10 border-primary/20 text-primary"
                : "bg-secondary/60 border-border/40 text-foreground/80 hover:bg-secondary hover:text-foreground"
            }`}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* QR Code + Share info */}
      <div className="flex items-center gap-6 p-4 rounded-2xl bg-secondary/20 border border-border/30">
        <div className="p-2 rounded-xl bg-white shadow-sm shrink-0">
          <QRCodeCanvas
            value={inviteLink}
            size={80}
            bgColor="#ffffff"
            fgColor="#000000"
            level="M"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={handleShare}
            className="text-sm font-bold text-primary/80 hover:text-primary transition-colors flex items-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            Share Arena
          </button>
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed font-medium">
            Scan to join instantly on mobile or share to your favorite apps.
          </p>
        </div>
      </div>

      {/* Enter Game */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={onEnterGame}
        className="flex items-center justify-center gap-3 w-full h-12 rounded-xl font-bold text-sm tracking-widest uppercase bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md"
      >
        Enter Arena
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </motion.button>

      {/* Back */}
      <button
        onClick={onBack}
        className="w-full text-center text-[10px] font-bold text-muted-foreground/60 hover:text-foreground uppercase tracking-[0.2em] transition-colors"
      >
        ← Back
      </button>
    </motion.div>
  );
};

// LobbyPanel
interface LobbyPanelProps {
  connected: boolean;
  connecting: boolean;
}

const LobbyPanel = ({ connected, connecting }: LobbyPanelProps) => {
  const navigate = useNavigate();
  const { setLocalPlayer, setRoomId: storeSetRoomId } = useGameStore();
  const { user: clerkUser } = useUser();
  const { getToken } = useAuth();

  const [username, setUsername] = useState(
    () => localStorage.getItem(LS_USERNAME) ?? clerkUser?.username ?? clerkUser?.firstName ?? ""
  );
  const [roomId,   setRoomId]   = useState(() => localStorage.getItem(LS_ROOM_ID)  ?? "");
  const [loading,  setLoading]  = useState<"create" | "join" | "quick" | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [createdRoom, setCreatedRoom] = useState<string | null>(null);

  const status = connecting ? "connecting" : connected ? "connected" : "disconnected";

  const persist = (un: string, rid: string) => {
    localStorage.setItem(LS_USERNAME, un);
    localStorage.setItem(LS_ROOM_ID, rid);
  };

  const validate = (requireRoom = true): boolean => {
    if (!username.trim()) { setError("Username is required."); return false; }
    if (requireRoom && !roomId.trim()) { setError("Room ID is required."); return false; }
    setError(null);
    return true;
  };

  // Join existing room — optional onSuccess overrides the default navigate("/game")
  const doJoin = useCallback(
    (rid: string, un: string, onSuccess?: () => void) => {
      socket.emit("join_room", { roomId: rid, username: un }, safeCallback((res: RoomJoinedResponse | ErrorResponse) => {
        setLoading(null);
        if (!res.success) { setError((res as ErrorResponse).error); return; }
        const ok = res as RoomJoinedResponse;
        storeSetRoomId(ok.roomId);
        setLocalPlayer(ok.userId, ok.username);
        persist(ok.username, ok.roomId);
        if (onSuccess) onSuccess();
        else navigate("/game");
      }));
    },
    [navigate, setLocalPlayer, storeSetRoomId]
  );

  // Create room (auto-joins via backend when username is supplied)
  const handleCreate = () => {
    if (!validate(false)) return;
    if (!connected) { setError("Not connected — please wait."); return; }
    const rid = roomId.trim() || randomId();
    setRoomId(rid);
    setLoading("create");
    socket.emit(
      "create_room",
      { roomId: rid, username: username.trim() },
      safeCallback((res: RoomCreatedResponse | ErrorResponse) => {
        setLoading(null);
        if (!res.success) { setError((res as ErrorResponse).error); return; }
        const ok = res as RoomCreatedResponse;
        storeSetRoomId(ok.roomId);
        if (ok.userId) {
          setLocalPlayer(ok.userId, username.trim());
          persist(username.trim(), ok.roomId);
          setCreatedRoom(ok.roomId); // show invite panel
        } else {
          setLoading("create");
          doJoin(ok.roomId, username.trim(), () => setCreatedRoom(ok.roomId));
        }
      })
    );
  };

  const handleJoin = () => {
    if (!validate(true)) return;
    if (!connected) { setError("Not connected — please wait."); return; }
    setLoading("join");
    doJoin(roomId.trim(), username.trim());
  };

  const handleQuickJoin = () => {
    if (!username.trim()) { setError("Username is required."); return; }
    if (!connected)       { setError("Not connected — please wait."); return; }
    const rid = randomId();
    setRoomId(rid);
    setLoading("quick");
    socket.emit(
      "create_room",
      { roomId: rid, username: username.trim() },
      safeCallback((res: RoomCreatedResponse | ErrorResponse) => {
        setLoading(null);
        if (!res.success) { setError((res as ErrorResponse).error); return; }
        const ok = res as RoomCreatedResponse;
        storeSetRoomId(ok.roomId);
        if (ok.userId) {
          setLocalPlayer(ok.userId, username.trim());
          persist(username.trim(), ok.roomId);
          setCreatedRoom(ok.roomId);
        } else {
          setLoading("quick");
          doJoin(ok.roomId, username.trim(), () => setCreatedRoom(ok.roomId));
        }
      })
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
      className="relative w-full max-w-[440px] rounded-[2rem]
                 border border-border/50
                 bg-card/70 backdrop-blur-xl
                 shadow-xl
                 p-8 md:p-10"
    >
      <AnimatePresence mode="wait">
        {createdRoom ? (
          <InvitePanel
            key="invite"
            roomId={createdRoom}
            onEnterGame={() => navigate("/game")}
            onBack={() => { setCreatedRoom(null); setError(null); }}
          />
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            {/* Header */}
            <div className="space-y-2 text-center lg:text-left">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-foreground tracking-tight">Enter Arena</h2>
                <ConnectionBadge status={status} />
              </div>
              <p className="text-sm text-muted-foreground font-medium">
                Create a private room or join an existing game.
              </p>
            </div>

            {/* Inputs */}
            <div className="space-y-5">
              <NeonInput
                label="Username"
                value={username}
                onChange={(v) => { setUsername(v); setError(null); }}
                placeholder="PixelNinja"
                maxLength={24}
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                }
              />

              <NeonInput
                label="Room ID"
                value={roomId}
                onChange={(v) => { setRoomId(v.toUpperCase()); setError(null); }}
                placeholder="ABCD-EFGH"
                maxLength={20}
                mono
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                }
                action={
                  <button
                    onClick={() => { setRoomId(randomId()); setError(null); }}
                    title="Generate random ID"
                    className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20
                               border border-primary/20 text-primary text-[10px] font-bold
                               tracking-widest transition-all hover:text-primary active:scale-95"
                  >
                    GEN
                  </button>
                }
              />
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl
                             bg-destructive/5 border border-destructive/20 text-destructive text-xs font-semibold"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <NeonButton
                  variant="primary"
                  onClick={handleCreate}
                  disabled={loading !== null || !connected}
                  loading={loading === "create"}
                >
                  Create
                </NeonButton>
                <NeonButton
                  variant="secondary"
                  onClick={handleJoin}
                  disabled={loading !== null || !connected}
                  loading={loading === "join"}
                >
                  Join
                </NeonButton>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">OR</span>
                <div className="flex-1 h-px bg-border/50" />
              </div>

              <NeonButton
                variant="ghost"
                onClick={handleQuickJoin}
                disabled={loading !== null || !connected}
                loading={loading === "quick"}
              >
                Quick Join Public
              </NeonButton>
            </div>

            {/* Footer */}
            <p className="text-center text-muted-foreground text-[11px] font-medium leading-relaxed">
              Play with friends by sharing your Room ID.<br />
              All data is synced in real-time.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default LobbyPanel;
