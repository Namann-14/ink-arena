import { io, Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents, ErrorResponse } from "@/types/socket";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

/**
 * Clerk session token to pass to socket auth.
 * Updated by the app before connecting (see useClerkSocket hook or Lobby).
 */
let _clerkToken: string | null = null;

export function setSocketToken(token: string | null) {
  _clerkToken = token;
}

// Singleton — one socket connection shared across the whole app.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  BACKEND_URL,
  {
    transports: ["polling", "websocket"], // polling first so Render's proxy can handshake, then upgrades to ws
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: (cb) => {
      // Called fresh on every connect/reconnect so a newly saved token is always used
      cb({ token: _clerkToken });
    },
  }
);

export const connectSocket = (): void => {
  if (!socket.connected) {
    socket.connect();
  }
};

export const disconnectSocket = (): void => {
  socket.disconnect();
};

/**
 * Wraps a socket ACK callback to guard against null/undefined responses.
 *
 * Socket.IO can deliver a null/undefined ACK when the server crashes or
 * disconnects before it fires the callback. Without this guard, accessing
 * `res.success` on null throws a TypeError that crashes the UI.
 *
 * Usage:
 *   socket.emit('create_room', payload, safeCallback((res) => { ... }));
 */
export function safeCallback<T extends { success: boolean }>(
  handler: (res: T | ErrorResponse) => void,
  fallbackError = 'No response from server — please try again.'
): (res: T | null | undefined) => void {
  return (res) => {
    console.debug('[Socket] ACK received:', res);
    if (res == null || typeof res !== 'object') {
      handler({ success: false, error: fallbackError } as ErrorResponse);
    } else {
      handler(res as T | ErrorResponse);
    }
  };
}
