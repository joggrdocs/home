/**
 * Shared status mapping utilities for GitHub project status fields.
 */

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Creates a reverse mapping from GitHub status values to local status keys.
 *
 * Given a mapping of `{ localStatus: githubStatus }`, returns a `Map` of
 * `githubStatus -> localStatus`.
 *
 * @param mapping - Status mapping from local names to GitHub names
 * @returns Reversed mapping from GitHub names to local names
 */
export function reverseStatusMapping(mapping: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(mapping).map(([local, github]) => [github, local]));
}
