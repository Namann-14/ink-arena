// ─── Shared data shapes ───────────────────────────────────────────────────────

/** A stroke segment as the backend stores/broadcasts it */
export interface Stroke {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  color: string;
  size: number;
  timestamp?: number;
}

/** Player shape as the backend sends in player_list_update */
export interface BackendPlayer {
  userId: string;
  username: string;
  isConnected: boolean;
  score: number;
}

// ─── Callback response shapes ─────────────────────────────────────────────────

export interface RoomCreatedResponse {
  success: true;
  roomId: string;
  userId?: string;
  username?: string;
  message: string;
}

export interface RoomJoinedResponse {
  success: true;
  roomId: string;
  userId: string;
  username: string;
  message: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

// ─── CLIENT → SERVER events ────────────────────────────────────────────────────

export interface ClientToServerEvents {
  /**
   * Create a new room.
   * Backend expects: { roomId, username? }
   * If username is provided the creator is auto-joined.
   */
  create_room: (
    payload: { roomId: string; username?: string },
    callback?: (res: RoomCreatedResponse | ErrorResponse) => void
  ) => void;

  /** Join an existing room. */
  join_room: (
    payload: { roomId: string; username: string },
    callback?: (res: RoomJoinedResponse | ErrorResponse) => void
  ) => void;

  /** Start the game in a room (must be in the room). */
  start_game: (
    payload: { roomId: string; totalRounds: number; difficulty?: 'easy' | 'medium' | 'hard' },
    callback?: (res: { success: boolean; message?: string; error?: string }) => void
  ) => void;

  /** Drawer selects one of the offered words. */
  select_word: (
    payload: { roomId: string; word: string },
    callback?: (res: { success: boolean; error?: string }) => void
  ) => void;

  /** Submit a word guess while a round is active. */
  submit_guess: (
    payload: { roomId: string; guess: string },
    callback?: (res: { success: boolean; correct?: boolean; close?: boolean; error?: string }) => void
  ) => void;

  /** Send a chat message (non-guess). */
  send_message: (
    payload: { roomId: string; message: string },
    callback?: (res: { success: boolean }) => void
  ) => void;

  /** Emit a single draw stroke (legacy path). */
  draw_stroke: (
    payload: { roomId: string; stroke: Stroke },
    callback?: (res: { success: boolean }) => void
  ) => void;

  /** Emit a rAF-batched array of strokes (preferred path). */
  draw_stroke_batch: (
    payload: { roomId: string; strokes: Stroke[] },
    callback?: (res: { success: boolean; accepted?: number; rejected?: number }) => void
  ) => void;

  /** Request current stroke history (used on join / reconnect). */
  request_sync_strokes: (
    payload: { roomId: string },
    callback?: (res: { success: boolean; strokeCount?: number }) => void
  ) => void;

  /** Re-join with an existing userId after a disconnect. */
  reconnect_player: (
    payload: { roomId: string; userId: string },
    callback?: (res: RoomJoinedResponse | ErrorResponse) => void
  ) => void;

  /** Reset the game in a room. */
  reset_game: (
    payload: { roomId: string },
    callback?: (res: { success: boolean }) => void
  ) => void;
}

// ─── SERVER → CLIENT events ────────────────────────────────────────────────────

export interface ServerToClientEvents {
  // ── Room ──────────────────────────────────────────────────────────────────
  room_created:   (res: RoomCreatedResponse) => void;
  room_joined:    (res: RoomJoinedResponse) => void;
  room_error:     (res: { success: false; error: string }) => void;

  // ── Players ───────────────────────────────────────────────────────────────
  player_list_update:  (p: { roomId: string; players: BackendPlayer[] }) => void;
  player_reconnected:  (p: { roomId: string; userId: string; username: string; timestamp: number }) => void;
  player_disconnected: (p: { roomId: string; userId: string; username: string; timestamp: number }) => void;

  // ── Chat ──────────────────────────────────────────────────────────────────
  receive_message: (p: { roomId: string; userId: string; username: string; message: string; timestamp: number }) => void;

  // ── Game lifecycle ────────────────────────────────────────────────────────
  game_error:   (p: { success: false; error: string }) => void;
  game_started: (p: { roomId: string; totalRounds: number; message: string; timestamp: number }) => void;
  game_ended:   (p: { roomId: string; winner: { userId: string; username: string; score: number }; leaderboard: BackendPlayer[]; timestamp: number }) => void;
  game_stopped: (p: { roomId: string; reason: string; timestamp: number }) => void;
  game_reset:   (p: { roomId: string; message: string; timestamp: number }) => void;

  // ── Round ─────────────────────────────────────────────────────────────────
  round_started: (p: {
    roomId: string;
    /** Human-readable round number (1-based, resets each full rotation) */
    roundNumber: number;
    totalRounds: number;
    /** Absolute turn counter across whole game */
    turnNumber: number;
    totalTurns: number;
    drawerId: string;
    drawerName: string;
    roundDuration: number;
    /** null until word is selected */
    roundEndTime: number | null;
    timestamp: number;
  }) => void;
  round_ended: (p: {
    roomId: string; roundNumber: number; totalRounds: number;
    word: string; reason: string;
    players: Array<{ userId: string; username: string; score: number; guessedCorrectly: boolean }>;
    timestamp: number;
  }) => void;

  // ── Word ──────────────────────────────────────────────────────────────────
  word_reveal:  (p: { word: string; roundNumber: number }) => void;
  word_hint:    (p: { hint: string; wordLength: number; roundNumber: number }) => void;
  /** Progressive hint — reveals additional letters over time */
  hint_update:  (p: { hint: string; revealCount: number }) => void;
  /** Sent only to the drawer — 3 word choices to pick from */
  word_options: (p: { words: string[]; timeoutSeconds: number; roundNumber: number; turnNumber: number }) => void;
  /** Sent to non-drawers while drawer is choosing */
  word_choosing:(p: { drawerName: string; roundNumber: number }) => void;

  // ── Timer ─────────────────────────────────────────────────────────────────
  round_timer_update: (p: { roomId: string; remainingTime: number; roundNumber: number; roundEndTime: number }) => void;
  /** Emitted once the word is chosen and the drawing phase clock starts */
  round_timer_start:  (p: { roomId: string; roundEndTime: number; roundDuration: number; roundNumber: number }) => void;

  // ── Guessing ──────────────────────────────────────────────────────────────
  correct_guess: (p: { roomId: string; userId: string; username: string; pointsEarned: number; score: number; timestamp: number }) => void;
  close_guess:   (p: { message: string }) => void;

  // ── Drawing ───────────────────────────────────────────────────────────────
  draw_stroke:       (p: { roomId: string; stroke: Stroke }) => void;
  draw_stroke_batch: (p: { roomId: string; strokes: Stroke[] }) => void;
  sync_strokes:      (p: { roomId: string; strokes: Stroke[] }) => void;
  clear_canvas:      (p: { roomId: string }) => void;
}
