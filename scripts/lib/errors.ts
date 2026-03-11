/**
 * Shared error extraction utilities.
 */

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Extracts a displayable message from an unknown error value.
 *
 * @param error - The caught error value
 * @returns The error message string, or "Unknown error" for non-Error values
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}
