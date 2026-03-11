/**
 * Utility for displaying dry-run mode warnings.
 */

import { ANSI } from "./ansi.js";

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Displays a formatted dry-run warning banner.
 *
 * Uses ANSI background color to create a visually distinct warning that
 * appears at the start of dry-run mode execution.
 *
 * @example
 * ```ts
 * if (ctx.args["dry-run"]) {
 *   displayDryRunWarning();
 * }
 * ```
 */
export function displayDryRunWarning(): void {
  const { bgYellow, black, bold, reset } = ANSI;

  const message = ` DRY RUN MODE - No changes will be applied `;
  const padding = " ".repeat(message.length);

  console.log(
    `\n${bgYellow}${black}${bold}${padding}${reset}\n${bgYellow}${black}${bold}${message}${reset}\n${bgYellow}${black}${bold}${padding}${reset}\n`,
  );
}
