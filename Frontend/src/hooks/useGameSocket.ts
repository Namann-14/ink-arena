/**
 * useGameSocket
 * ──────────────────────────────────────────────────────────────────────────
 * Central hook for game-page socket events.
 * Mount it once in Index.tsx (the /game page).
 * It wires ALL server → client events to the Zustand store and returns the
 * connection status for optional UI display.
 *
 * Drawing events (draw_stroke, draw_stroke_batch, sync_strokes, clear_canvas)
 * are handled inside DrawingCanvas.tsx because they need the canvas ref.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { socket, connectSocket } from "@/services/socket";
import { useGameStore } from "@/store/gameStore";
import type { BackendPlayer } from "@/types/socket";

// Converts a BackendPlayer to the store's Player shape
const toStorePlayer = (p: BackendPlayer) => ({
  id:        p.userId,
  username:  p.username,
  score:     p.score,
  isDrawer:  false,
  avatar:    undefined,
});

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

export function useGameSocket() {
  const navigate = useNavigate();
  const store    = useGameStore();

  const [status, setStatus] = useState<ConnectionStatus>(
    socket.connected ? "connected" : "connecting"
  );

  useEffect(() => {
    // Ensure socket is connected when we land on the game page
    connectSocket();

    // ── Connection state ────────────────────────────────────────────────────
    const onConnect    = () => setStatus("connected");
    const onDisconnect = () => {
      setStatus("disconnected");
      toast.error("Connection lost — reconnecting…");
    };
    const onConnectErr = (err: Error) => {
      setStatus("disconnected");
      if (err.message.includes("Invalid or expired token")) {
        toast.error("Session expired, please log in again.");
        socket.disconnect();
        navigate("/");
      }
    };
    const onReconnect  = () => {
      setStatus("connected");
      toast.success("Reconnected!");
      // Re-request stroke sync after reconnect
      const { roomId } = useGameStore.getState();
      if (roomId) {
        socket.emit("request_sync_strokes", { roomId });
      }
    };

    // ── Room / player events ────────────────────────────────────────────────
    const onPlayerListUpdate = (p: { roomId: string; hostId?: string; players: BackendPlayer[] }) => {
      store.setPlayers(p.players.map(toStorePlayer));
      if (p.hostId) store.setHostId(p.hostId);
    };

    const onPlayerDisconnected = (p: { roomId: string; userId: string; username: string }) => {
      toast.info(`${p.username} disconnected`);
    };

    const onPlayerReconnected = (p: { roomId: string; userId: string; username: string }) => {
      toast.info(`${p.username} reconnected`);
    };

    // ── Chat ────────────────────────────────────────────────────────────────
    const onReceiveMessage = (p: { userId: string; username: string; message: string; timestamp: number }) => {
      store.addMessage({
        id:        `${p.timestamp}-${p.userId}`,
        username:  p.username,
        message:   p.message,
        type:      "chat",
        timestamp: p.timestamp,
      });
    };

    // ── Game lifecycle ───────────────────────────────────────────────────────
    const onGameStarted = (p: { totalRounds: number }) => {
      store.setStatus("playing");
      store.setRound(1, p.totalRounds);
      toast.success("Game started!");
    };

    const onGameEnded = (p: { winner: { userId: string; username: string; score: number }; leaderboard: BackendPlayer[] }) => {
      store.setStatus("game_end");
      store.setPlayers(p.leaderboard.map(toStorePlayer));
      const winnerPlayer = {
        id:       p.winner.userId,
        username: p.winner.username,
        score:    p.winner.score,
        isDrawer: false,
      };
      store.setWinner(winnerPlayer);
      toast.success(`${p.winner.username} wins! 🎉`);
    };

    const onGameStopped = (p: { reason: string }) => {
      store.setStatus("lobby");
      toast.warning(`Game stopped: ${p.reason}`);
    };

    const onGameReset = () => {
      store.reset();
      toast.info("Game has been reset.");
    };

    // ── Round ────────────────────────────────────────────────────────────────
    const onRoundStarted = (p: {
      roundNumber: number; totalRounds: number;
      turnNumber?: number; totalTurns?: number;
      drawerId: string; drawerName: string;
      roundDuration: number; roundEndTime: number | null;
    }) => {
      store.setStatus("playing");
      store.setRound(p.roundNumber, p.totalRounds);
      store.setCurrentDrawer(p.drawerId);
      store.setTotalTime(p.roundDuration);
      // roundEndTime is null during word selection — timer starts on round_timer_start
      store.setTimeLeft(p.roundEndTime ? Math.max(0, Math.ceil((p.roundEndTime - Date.now()) / 1000)) : p.roundDuration);
      store.setWord("");
      store.setWordHint("");
      store.setShowCorrectAnimation(false);
      store.setShowWordSelection(false);
      store.setWordOptions([]);

      const isMe = useGameStore.getState().localPlayerId === p.drawerId;
      if (!isMe) {
        toast.info(`Round ${p.roundNumber}: ${p.drawerName} is choosing a word…`);
      }
    };

    const onRoundEnded = (p: {
      roundNumber: number; word: string; reason: string;
      players: Array<{ userId: string; username: string; score: number; guessedCorrectly: boolean }>;
    }) => {
      store.setStatus("round_end");
      store.setWord(p.word); // reveal the word to everyone
      store.setPlayers(
        p.players.map((pl) => ({ id: pl.userId, username: pl.username, score: pl.score, isDrawer: false }))
      );
      const reasonLabel =
        p.reason === "time_up"     ? "Time's up!" :
        p.reason === "all_guessed" ? "Everyone guessed!" :
        p.reason === "drawer_left" ? "Drawer left." : p.reason;
      toast(`Round ${p.roundNumber} ended — ${reasonLabel} The word was "${p.word}"`);
    };

    // ── Word selection ────────────────────────────────────────────────────────
    const onWordOptions = (p: { words: string[]; timeoutSeconds: number }) => {
      store.setWordOptions(p.words);
      store.setShowWordSelection(true);
    };

    const onWordChoosing = (p: { drawerName: string; roundNumber: number }) => {
      toast.info(`${p.drawerName} is choosing a word…`);
    };

    const onRoundTimerStart = (p: { roundEndTime: number; roundDuration: number }) => {
      // Word was chosen — real drawing clock starts now
      store.setTotalTime(p.roundDuration);
      store.setTimeLeft(Math.max(0, Math.ceil((p.roundEndTime - Date.now()) / 1000)));
      store.setShowWordSelection(false);
    };

    // ── Word ─────────────────────────────────────────────────────────────────
    const onWordReveal = (p: { word: string }) => {
      store.setWord(p.word);           // only the drawer receives this event
      store.setWordHint(p.word);
    };

    const onWordHint = (p: { hint: string }) => {
      store.setWordHint(p.hint);       // guessers receive the masked hint
    };

    const onHintUpdate = (p: { hint: string; revealCount: number }) => {
      store.setWordHint(p.hint);       // progressive hint reveal
    };

    // ── Timer ────────────────────────────────────────────────────────────────
    const onTimerUpdate = (p: { remainingTime: number }) => {
      store.setTimeLeft(p.remainingTime);
    };

    // ── Correct guess ────────────────────────────────────────────────────────
    const onCorrectGuess = (p: { userId: string; username: string; pointsEarned: number; score: number }) => {
      const isMe = useGameStore.getState().localPlayerId === p.userId;
      if (isMe) store.setShowCorrectAnimation(true);
      store.updatePlayerScore(p.userId, p.score);
      store.addMessage({
        id:        `correct-${Date.now()}-${p.userId}`,
        username:  p.username,
        message:   `guessed correctly! +${p.pointsEarned} pts`,
        type:      "correct",
        timestamp: Date.now(),
      });
    };

    const onCloseGuess = (p: { message: string }) => {
      toast.info(p.message);
    };

    const onGameError = (p: { error: string }) => {
      toast.error(`Game error: ${p.error}`);
    };

    const onRoomError = (p: { error: string }) => {
      toast.error(p.error);
    };

    // ── Register all listeners ────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const on = (ev: string, fn: (...args: any[]) => void) => socket.on(ev as any, fn as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const off = (ev: string, fn: (...args: any[]) => void) => socket.off(ev as any, fn as any);

    socket.on("connect",       onConnect);
    socket.on("disconnect",    onDisconnect);
    socket.on("connect_error", onConnectErr);
    socket.io.on("reconnect",  onReconnect);

    on("player_list_update",  onPlayerListUpdate);
    on("player_disconnected", onPlayerDisconnected);
    on("player_reconnected",  onPlayerReconnected);

    on("receive_message",     onReceiveMessage);

    on("game_started",        onGameStarted);
    on("game_ended",          onGameEnded);
    on("game_stopped",        onGameStopped);
    on("game_reset",          onGameReset);

    on("round_started",       onRoundStarted);
    on("round_ended",         onRoundEnded);

    on("word_options",        onWordOptions);
    on("word_choosing",       onWordChoosing);
    on("round_timer_start",   onRoundTimerStart);

    on("word_reveal",         onWordReveal);
    on("word_hint",           onWordHint);
    on("hint_update",         onHintUpdate);

    on("round_timer_update",  onTimerUpdate);

    on("correct_guess",       onCorrectGuess);
    on("close_guess",         onCloseGuess);

    on("game_error",          onGameError);
    on("room_error",          onRoomError);

    // Sync connected state immediately
    if (socket.connected) setStatus("connected");

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      socket.off("connect",       onConnect);
      socket.off("disconnect",    onDisconnect);
      socket.off("connect_error", onConnectErr);
      socket.io.off("reconnect",  onReconnect);

      off("player_list_update",  onPlayerListUpdate);
      off("player_disconnected", onPlayerDisconnected);
      off("player_reconnected",  onPlayerReconnected);

      off("receive_message",     onReceiveMessage);

      off("game_started",        onGameStarted);
      off("game_ended",          onGameEnded);
      off("game_stopped",        onGameStopped);
      off("game_reset",          onGameReset);

      off("round_started",       onRoundStarted);
      off("round_ended",         onRoundEnded);

      off("word_options",        onWordOptions);
      off("word_choosing",       onWordChoosing);
      off("round_timer_start",   onRoundTimerStart);

      off("word_reveal",         onWordReveal);
      off("word_hint",           onWordHint);
      off("hint_update",         onHintUpdate);

      off("round_timer_update",  onTimerUpdate);

      off("correct_guess",       onCorrectGuess);
      off("close_guess",         onCloseGuess);

      off("game_error",          onGameError);
      off("room_error",          onRoomError);
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return { status };
}
