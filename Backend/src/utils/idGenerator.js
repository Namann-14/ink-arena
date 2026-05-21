import { v4 as uuidv4 } from 'uuid';

/**
 * Utility module for generating unique identifiers
 */

/**
 * Generates a unique user ID
 * @returns {string} UUID v4 string
 */
export function generateUserId() {
  return uuidv4();
}

/**
 * Generates a unique room ID
 * @returns {string} UUID v4 string
 */
export function generateRoomId() {
  return uuidv4();
}

/**
 * Generates a short alphanumeric room code (6 characters)
 * Useful for user-friendly room codes
 * @returns {string} 6-character room code
 */
export function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
