/**
 * Utility for displaying dry-run mode warnings.
 */

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
  const bgYellow = "\x1b[43m";
  const black = "\x1b[30m";
  const bold = "\x1b[1m";
  const reset = "\x1b[0m";

  const message = ` DRY RUN MODE - No changes will be applied `;
  const padding = " ".repeat(message.length);

  console.log(
    `\n${bgYellow}${black}${bold}${padding}${reset}\n${bgYellow}${black}${bold}${message}${reset}\n${bgYellow}${black}${bold}${padding}${reset}\n`,
  );
}
