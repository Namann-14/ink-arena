import "dotenv/config";
import { clerkMiddleware } from '@clerk/express';
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { initializeSocket } from "./config/socket.js";
import roomManager from "./rooms/roomManager.js";

import { connectRedis, disconnectRedis, getRedisClient } from "./redis/redisClient.js";
import { createAdapter } from "@socket.io/redis-adapter";

import { connectDB } from "./config/db.js";
import authRoutes from "./auth/authRoutes.js";

// ============================================
// Database Connection
// ============================================
// Connected asynchronously in the background once the server starts listening,
// to prevent Render deployment startup timeouts.


// ============================================
// Paths
// ============================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

// ============================================
// App Setup
// ============================================

const PORT = process.env.PORT || 3000;
const app = express();
const httpServer = createServer(app);

// ============================================
// Middleware
// ============================================

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// Clerk session parsing — must come before auth routes
app.use(clerkMiddleware());

// ============================================
// Authentication Routes
// ============================================

app.use("/auth", authRoutes);

// ============================================
// Health Endpoint
// ============================================

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});

// ============================================
// Stats Endpoint
// ============================================

app.get("/api/stats", async (req, res) => {
  try {
    const [totalRooms, allRooms] = await Promise.all([
      roomManager.getRoomCount(),
      roomManager.getAllRooms(),
    ]);

    res.json({ totalRooms, rooms: allRooms });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ============================================
// Room Info Endpoint
// ============================================

app.get("/api/rooms/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;

    const [room, players] = await Promise.all([
      roomManager.getRoom(roomId),
      roomManager.getRoomPlayers(roomId),
    ]);

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json({
      roomId: room.roomId,
      playerCount: players.length,
      players: players.map((p) => ({
        userId: p.userId,
        username: p.username,
        isConnected: p.isConnected,
        score: p.score,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch room" });
  }
});

// ============================================
// Error Handling
// ============================================

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error("[Express] Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ============================================
// Initialize Socket.IO
// ============================================

const io = initializeSocket(httpServer);

// ============================================
// Start Server First (Prevents Render Startup Timeouts)
// ============================================

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Connect to databases asynchronously in the background
  initializeServices();
});

// ============================================
// Background Services Initialization
// ============================================

async function initializeServices() {
  // 1. Connect MongoDB
  try {
    await connectDB();
  } catch (err) {
    console.error("[DB] Failed to connect to MongoDB:", err.message ?? err);
  }

  // 2. Connect Redis and Enable Adapter
  let redisEnabled = false;
  try {
    const pubClient = await connectRedis();

    if (pubClient) {
      // subClient must be a *duplicate* of pubClient — same config/auth
      const subClient = pubClient.duplicate();

      subClient.on('error', (err) =>
        console.error('[Redis] Sub-client error:', err.message ?? err)
      );

      await subClient.connect();

      io.adapter(createAdapter(pubClient, subClient));
      redisEnabled = true;
      console.log('[Redis] Adapter enabled — Socket.IO will scale across instances');
    } else {
      console.warn('[Redis] Adapter NOT enabled — running with single-instance Socket.IO');
    }
  } catch (err) {
    console.error('[Redis] Adapter setup failed:', err.message ?? err);
    console.warn('[Redis] Failed → fallback mode — single-instance Socket.IO only');
  }

  if (!redisEnabled) {
    console.log('[Redis] Running without Redis adapter (fallback mode)');
  }
}

// ============================================
// Graceful Shutdown
// ============================================

process.on("SIGTERM", async () => {
  console.log("[Server] SIGTERM received, shutting down...");
  httpServer.close(async () => {
    await disconnectRedis();
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("[Server] SIGINT received, shutting down...");
  httpServer.close(async () => {
    await disconnectRedis();
    process.exit(0);
  });
});

// ============================================
// Unhandled Promise Rejections
// ============================================

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Server] Unhandled Rejection:", reason);
});