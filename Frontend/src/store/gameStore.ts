import { create } from "zustand";

export interface Player {
  id: string;
  username: string;
  score: number;
  isDrawer: boolean;
  avatar?: string;
}

export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  type: "chat" | "system" | "correct";
  timestamp: number;
}

export interface GameState {
  // Room
  roomId: string;
  // Round
  currentRound: number;
  totalRounds: number;
  selectedRounds: number;
  // Players
  players: Player[];
  currentDrawer: string;
  // Word
  word: string;
  wordHint: string;
  // Timer
  timeLeft: number;
  totalTime: number;
  // Chat
  messages: ChatMessage[];
  // Game status
  status: "lobby" | "playing" | "round_end" | "game_end";
  // Host
  hostId: string;
  // Local player
  localPlayerId: string;
  localUsername: string;
  // Drawing
  isDrawing: boolean;
  brushSize: number;
  brushColor: string;
  // Winner
  winner: Player | null;
  // Correct guess animation
  showCorrectAnimation: boolean;
  // Word selection (drawer only)
  wordOptions: string[];
  showWordSelection: boolean;
}

interface GameActions {
  setRoomId: (roomId: string) => void;
  setRound: (current: number, total: number) => void;
  setSelectedRounds: (n: number) => void;
  setPlayers: (players: Player[]) => void;
  setCurrentDrawer: (drawerId: string) => void;
  setWord: (word: string) => void;
  setWordHint: (hint: string) => void;
  setTimeLeft: (time: number) => void;
  setTotalTime: (time: number) => void;
  addMessage: (message: ChatMessage) => void;
  setStatus: (status: GameState["status"]) => void;
  setHostId: (hostId: string) => void;
  setLocalPlayer: (id: string, username: string) => void;
  setBrushSize: (size: number) => void;
  setBrushColor: (color: string) => void;
  setWinner: (winner: Player | null) => void;
  setShowCorrectAnimation: (show: boolean) => void;
  setWordOptions: (words: string[]) => void;
  setShowWordSelection: (show: boolean) => void;
  updatePlayerScore: (playerId: string, score: number) => void;
  isLocalPlayerDrawer: () => boolean;
  reset: () => void;
}

const initialState: GameState = {
  roomId: "",
  currentRound: 0,
  totalRounds: 3,
  selectedRounds: 3,
  players: [],
  currentDrawer: "",
  word: "",
  wordHint: "",
  timeLeft: 0,
  totalTime: 60,
  messages: [],
  status: "lobby",
  hostId: "",
  localPlayerId: "",
  localUsername: "",
  isDrawing: false,
  brushSize: 4,
  brushColor: "#FFFFFF",
  winner: null,
  showCorrectAnimation: false,
  wordOptions: [],
  showWordSelection: false,
};

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...initialState,

  setRoomId: (roomId) => set({ roomId }),
  setRound: (current, total) => set({ currentRound: current, totalRounds: total }),
  setSelectedRounds: (n) => set({ selectedRounds: n }),
  setPlayers: (players) => set({ players }),
  setCurrentDrawer: (drawerId) =>
    set((state) => ({
      currentDrawer: drawerId,
      players: state.players.map((p) => ({ ...p, isDrawer: p.id === drawerId })),
    })),
  setWord: (word) => set({ word }),
  setWordHint: (hint) => set({ wordHint: hint }),
  setTimeLeft: (time) => set({ timeLeft: time }),
  setTotalTime: (time) => set({ totalTime: time }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setStatus: (status) => set({ status }),
  setHostId: (hostId) => set({ hostId }),
  setLocalPlayer: (id, username) => set({ localPlayerId: id, localUsername: username }),
  setBrushSize: (size) => set({ brushSize: size }),
  setBrushColor: (color) => set({ brushColor: color }),
  setWinner: (winner) => set({ winner }),
  setShowCorrectAnimation: (show) => set({ showCorrectAnimation: show }),
  setWordOptions: (words) => set({ wordOptions: words }),
  setShowWordSelection: (show) => set({ showWordSelection: show }),
  updatePlayerScore: (playerId, score) =>
    set((state) => ({
      players: state.players.map((p) =>
        p.id === playerId ? { ...p, score } : p
      ),
    })),
  isLocalPlayerDrawer: () => get().localPlayerId === get().currentDrawer,
  reset: () => set(initialState),
}));
