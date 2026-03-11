/**
 * Shared ANSI escape code constants for terminal output styling.
 */

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * ANSI escape codes for terminal text styling.
 *
 * Consolidates all color and formatting codes used across the codebase
 * into a single constant.
 */
export const ANSI = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  strike: "\x1b[9m",
  black: "\x1b[30m",
  bgYellow: "\x1b[43m",
  reset: "\x1b[0m",
} as const;
