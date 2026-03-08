/**
 * Utility for displaying colored diff output in terminal.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * ANSI color codes for terminal output.
 */
export interface DiffColors {
  readonly red: string;
  readonly green: string;
  readonly strike: string;
  readonly reset: string;
}

/**
 * A change that can be displayed in diff format.
 */
export interface DiffChange {
  readonly type: "add" | "remove" | "modify";
  readonly label: string;
  readonly detail?: string;
}

/**
 * Logger interface matching laufen context logger.
 */
export interface Logger {
  readonly newlines: () => void;
  readonly info: (msg: string) => void;
  readonly message: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Standard ANSI color codes for terminal diff output.
 */
export const DIFF_COLORS: DiffColors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  strike: "\x1b[9m",
  reset: "\x1b[0m",
};

/**
 * Displays changes in a formatted diff box with color coding.
 *
 * @param logger - The logger to use for output
 * @param changes - The list of changes to display
 * @param title - Optional title for the changes section
 *
 * @example
 * ```ts
 * displayDiff(ctx.logger, [
 *   { type: "add", label: "field", detail: "Status" },
 *   { type: "remove", label: "field", detail: "Priority" },
 *   { type: "modify", label: "title", detail: '"Old" → "New"' }
 * ], "Project Changes");
 * ```
 */
export function displayDiff(logger: Logger, changes: readonly DiffChange[], title?: string): void {
  const { red, green, strike, reset } = DIFF_COLORS;

  logger.newlines();
  const header = title ?? `Changes to be applied (${changes.length} change(s))`;
  logger.info(`┌─ ${header}`);

  changes.forEach((change) => {
    const detail = change.detail ? `: ${change.detail}` : "";

    if (change.type === "add") {
      logger.message(`│ ${green}+ ${change.label}${detail}${reset}`);
    } else if (change.type === "remove") {
      logger.message(`│ ${red}${strike}- ${change.label}${detail}${reset}`);
    } else {
      logger.message(`│ ${change.label}${detail}`);
    }
  });

  logger.info("└─");
  logger.newlines();
}

/**
 * Compares two strings and returns a diff change if they differ.
 *
 * @param label - The label for this field
 * @param oldValue - The current value
 * @param newValue - The new value
 * @returns A DiffChange if values differ, null otherwise
 *
 * @example
 * ```ts
 * const change = compareStrings("title", "Old Title", "New Title");
 * // Returns: { type: "modify", label: "title", detail: '"Old Title" → "New Title"' }
 * ```
 */
export function compareStrings(
  label: string,
  oldValue: string,
  newValue: string,
): DiffChange | null {
  if (oldValue === newValue) {
    return null;
  }

  return {
    type: "modify",
    label,
    detail: `"${oldValue}" → "${newValue}"`,
  };
}
