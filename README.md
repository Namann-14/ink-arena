# InkArena

A real-time multiplayer drawing and guessing game. One player draws a word while others race to guess it — fastest guess wins the most points. Built with React, Node.js, Socket.IO, and Redis.

![Node.js](https://img.shields.io/badge/Node.js-≥18-339933?logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socketdotio&logoColor=white)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Socket Events](#socket-events)
- [Game Mechanics](#game-mechanics)
- [Redis Schema](#redis-schema)

---

## Features

- **Real-time drawing canvas** — strokes broadcast instantly via WebSockets with batched transmission
- **Room-based multiplayer** — create or join rooms with unique codes
- **Turn-based rounds** — each player takes a turn as the drawer
- **Word selection** — drawer picks from 3 word options (easy / medium / hard)
- **Time-based scoring** — faster correct guesses earn more points
- **Close-guess detection** — Levenshtein distance alerts when a guess is nearly correct
- **Distributed state** — all game state persisted in Redis with atomic Lua scripts
- **Auto-reconnect** — players can reconnect and resume without losing progress
- **Optional AI words** — Gemini API integration for dynamic word generation (falls back to built-in word bank)
- **Dark theme UI** — oklch-based TweakCN theme with electric blue accents

---

## Architecture

```
┌─────────────┐   Socket.IO    ┌───────────────┐       ┌─────────┐
│   React UI  │ ◄────────────► │  Express +     │ ◄───► │  Redis  │
│  (Vite)     │   WebSocket    │  Socket.IO     │       │         │
│  port 8080  │                │  port 3000     │       │  :6379  │
└─────────────┘                └───────────────┘       └─────────┘
```

- **Frontend** → React SPA served by Vite dev server. Connects to backend via Socket.IO (polling → WebSocket upgrade).
- **Backend** → Express HTTP server with Socket.IO attached. All game logic runs server-side. Redis adapter enables horizontal scaling.
- **Redis** → Persists rooms, players, strokes, and socket mappings. Distributed locks ensure safe concurrent round control across multiple server instances.

---

## Tech Stack

### Frontend

| Dependency | Purpose |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite 5 | Build tooling, HMR, dev server |
| Tailwind CSS 3.4 | Utility-first styling |
| shadcn/ui (Radix) | Accessible UI primitives |
| Zustand 5 | Lightweight global state |
| Socket.IO Client 4.8 | Real-time server communication |
| Framer Motion 12 | Animations and transitions |
| React Router 7 | Client-side routing |
| Sonner | Toast notifications |

### Backend

| Dependency | Purpose |
|---|---|
| Express 4.18 | HTTP server + REST endpoints |
| Socket.IO 4.6 | WebSocket server |
| Redis 5 (node-redis) | State persistence |
| @socket.io/redis-adapter | Multi-instance pub/sub |
| UUID 9 | Player/room ID generation |
| dotenv | Environment configuration |

---

## Project Structure

```
Scribble/
├── Backend/
│   ├── package.json
│   ├── public/
│   │   └── index.html              # Fallback static page
│   └── src/
│       ├── server.js                # Express + Socket.IO entry point
│       ├── config/
│       │   └── socket.js            # Socket.IO server initialization
│       ├── game/
│       │   ├── gameEngine.js        # Round lifecycle, scoring, timers
│       │   ├── wordService.js       # Word bank + optional Gemini AI
│       │   └── drawingEngine.js     # Stroke validation & broadcasting
│       ├── redis/
│       │   ├── redisClient.js       # Redis client singleton
│       │   └── roomStore.js         # Redis CRUD + Lua scripts
│       ├── rooms/
│       │   └── roomManager.js       # High-level room operations
│       ├── sockets/
│       │   └── socketHandler.js     # All socket event handlers
│       └── utils/
│           └── idGenerator.js       # UUID generation helpers
│
├── Frontend/
│   └── ink-canvas-clash/
│       ├── package.json
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── index.html
│       └── src/
│           ├── App.tsx              # Router setup
│           ├── main.tsx             # React entry point
│           ├── index.css            # Theme tokens (oklch)
│           ├── components/
│           │   ├── DrawingCanvas.tsx # Canvas with real-time stroke sync
│           │   ├── ChatPanel.tsx     # Chat + guess input
│           │   ├── PlayerList.tsx    # Scoreboard sidebar
│           │   ├── TopBar.tsx        # Round info + timer
│           │   ├── CountdownTimer.tsx
│           │   ├── WordSelectionModal.tsx
│           │   ├── WinnerModal.tsx
│           │   ├── CorrectGuessOverlay.tsx
│           │   └── lobby/
│           │       ├── LobbyPanel.tsx
│           │       ├── AnimatedBackground.tsx
│           │       └── ConnectionBadge.tsx
│           ├── hooks/
│           │   └── useGameSocket.ts  # Central socket event hook
│           ├── pages/
│           │   ├── Lobby.tsx         # Room create/join
│           │   └── Index.tsx         # Game page
│           ├── services/
│           │   └── socket.ts         # Socket.IO client instance
│           ├── store/
│           │   └── gameStore.ts      # Zustand game state
│           └── types/
│               └── socket.ts         # Shared type definitions
│
└── redis-win/                        # Local Redis binary (Windows)
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Redis** server (local binary included in `redis-win/` for Windows)

### 1. Start Redis

**Windows** (using bundled binary):
```bash
cd redis-win
redis-server.exe redis.windows.conf
```

**macOS / Linux**:
```bash
redis-server
```

### 2. Start the Backend

```bash
cd Backend
npm install
npm run dev
```

The server starts on `http://localhost:3000`. Verify with:
```bash
curl http://localhost:3000/health
```

### 3. Start the Frontend

```bash
cd Frontend/ink-canvas-clash
npm install
npm run dev
```

Opens on `http://localhost:8080`.

---

## Environment Variables

### Backend (`Backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `GEMINI_API_KEY` | — | Google Gemini API key for AI word generation (optional) |

### Frontend (`Frontend/ink-canvas-clash/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_BACKEND_URL` | `http://localhost:3000` | Backend server URL |

---

## API Reference

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns `{ status: "ok", uptime, redis }` |
| `GET` | `/api/stats` | Server stats — connected sockets, room count, uptime |
| `GET` | `/api/rooms/:roomId` | Room details — players, game state, round info |

---

## Socket Events

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `create_room` | `{ roomId, username? }` | Create a new room (auto-joins if username provided) |
| `join_room` | `{ roomId, username }` | Join an existing room |
| `start_game` | `{ roomId, totalRounds, difficulty? }` | Host starts the game (1–10 rounds) |
| `select_word` | `{ roomId, word }` | Drawer picks a word from options |
| `submit_guess` | `{ roomId, guess }` | Submit a guess for the current word |
| `send_message` | `{ roomId, message }` | Send a chat message |
| `draw_stroke` | `{ roomId, stroke }` | Single stroke (legacy) |
| `draw_stroke_batch` | `{ roomId, strokes[] }` | Batched strokes (primary path, max 200) |
| `request_sync_strokes` | `{ roomId }` | Request full stroke history (reconnect) |
| `reconnect_player` | `{ roomId, userId }` | Reassign socket after reconnection |
| `reset_game` | `{ roomId }` | Reset game to lobby state |

### Server → Client

| Event | Key Fields | Description |
|---|---|---|
| `room_created` | `roomId, userId` | Room successfully created |
| `room_joined` | `roomId, userId, username` | Successfully joined room |
| `player_list_update` | `players[], hostId` | Player list changed |
| `game_started` | `totalRounds` | Game begins |
| `round_started` | `roundNumber, drawerId, drawerName` | New round begins |
| `word_options` | `words[], timeoutSeconds` | Drawer receives word choices |
| `word_choosing` | `drawerName` | Non-drawers see "choosing" state |
| `round_timer_start` | `roundEndTime, roundDuration` | Drawing phase begins |
| `round_timer_update` | `remainingTime` | Timer tick (every second) |
| `word_reveal` | `word` | Drawer sees the full word |
| `word_hint` | `hint, wordLength` | Guessers see masked word (`_ _ _`) |
| `correct_guess` | `userId, username, pointsEarned` | Someone guessed correctly |
| `close_guess` | `message` | Private — guess is close |
| `round_ended` | `word, reason, players[]` | Round over (time_up / all_guessed / drawer_left) |
| `game_ended` | `winner, leaderboard[]` | Game finished |
| `draw_stroke` | `stroke` | Incoming stroke from drawer |
| `draw_stroke_batch` | `strokes[]` | Incoming batch from drawer |
| `sync_strokes` | `strokes[]` | Full stroke history |
| `clear_canvas` | `roomId` | Canvas cleared between rounds |

---

## Game Mechanics

### Flow

1. **Lobby** — Host creates a room, players join via room code
2. **Start** — Host selects round count (1–10) and difficulty (easy/medium/hard)
3. **Round** — Each connected player draws once per "round cycle"
   - Drawer receives 3 word options (10s to choose, auto-pick on timeout)
   - Drawing phase: 60 seconds to draw
   - Guessers type guesses in chat
4. **Scoring** — Time-based: faster guess = more points (10–100 pts). Drawer gets 50 bonus if anyone guesses correctly
5. **End** — After all turns complete, leaderboard shown with winner

### Turn Order

Players are ordered by join time. Total turns = `totalRounds × playerCount`. Each round, every player gets one turn as drawer before moving to the next round.

### Close Guess Detection

A guess triggers a "close" hint if:
- The guess contains the word (or vice versa) and is ≥ 3 characters
- Levenshtein edit distance is exactly 1

### Word Sources

1. **Gemini AI** (if `GEMINI_API_KEY` set) — generates fresh words per difficulty, cached 1 hour
2. **Built-in word bank** — 156 words across easy (60), medium (58), hard (38) tiers

---

## Redis Schema

| Key Pattern | Type | Contents |
|---|---|---|
| `room:{roomId}` | Hash | Room metadata (gameState, roundNumber, currentWord, etc.) |
| `room:{roomId}:players` | Hash | Player objects keyed by userId |
| `room:{roomId}:strokes` | List | JSON stroke objects (append-only per round) |
| `socket:{socketId}` | String | `{ roomId, userId }` mapping (TTL: 2h) |
| `lock:room:{roomId}:round` | String | Distributed round lock (TTL: 15s) |
| `lock:room:{roomId}:timer` | String | Timer ownership lock (TTL: 70s) |

Atomic operations use Lua scripts for:
- Room creation (create-if-not-exists)
- Game start CAS (waiting → playing)
- Lock release (delete-if-owner)

---

## License

MIT
