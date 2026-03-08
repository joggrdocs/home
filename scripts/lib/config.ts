/**
 * Shared project configuration reading utilities.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Relative path to the features directory from the project root.
 */
export const FEATURES_DIR = "docs/roadmap/features";

/**
 * Relative path to the project config file from the project root.
 */
const CONFIG_PATH = "scripts/conf/project.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Project configuration as defined in scripts/conf/project.json.
 */
export interface ProjectConfig {
  readonly project: {
    readonly owner: string;
    readonly repo: string;
    readonly number: number;
    readonly title: string;
    readonly description: string;
    readonly visibility: "PUBLIC" | "PRIVATE";
    readonly readme: string;
  };
  readonly fields: readonly ConfigField[];
  readonly views: readonly ConfigView[];
  readonly statusMapping: Record<string, string>;
}

/**
 * A project field definition from the config file.
 */
export interface ConfigField {
  readonly name: string;
  readonly type: string;
  readonly options?: readonly ConfigFieldOption[];
}

/**
 * An option within a project field.
 */
export interface ConfigFieldOption {
  readonly name: string;
  readonly description?: string;
  readonly color?: string;
}

/**
 * A project view definition from the config file.
 */
export interface ConfigView {
  readonly name: string;
  readonly layout: string;
  readonly groupBy: string | null;
  readonly sortBy: { readonly field: string; readonly direction: string } | null;
  readonly fields: readonly string[];
  readonly filter?: string;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Reads and parses the project configuration from `scripts/conf/project.json`.
 *
 * @param root - Absolute path to the project root directory
 * @returns Result tuple with the parsed config or an error
 */
export async function readProjectConfig(
  root: string,
): Promise<readonly [Error, null] | readonly [null, ProjectConfig]> {
  try {
    const raw = await readFile(join(root, CONFIG_PATH), "utf-8");
    const parsed = JSON.parse(raw) as ProjectConfig;
    return [null, parsed];
  } catch (error) {
    const message = extractErrorMessage(error);
    return [new Error(`Failed to read ${CONFIG_PATH}: ${message}`), null];
  }
}

// ---------------------------------------------------------------------------
// Private
// ---------------------------------------------------------------------------

/**
 * Extracts an error message from an unknown error value.
 *
 * @private
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}
