import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result type for query loading operations.
 */
export type QueryLoaderResult<T = string> = readonly [Error, null] | readonly [null, T];

/**
 * Loaded GraphQL queries.
 */
export interface Queries {
  readonly getProject: string;
  readonly listProjectViews: string;
  readonly listProjectItems: string;
  readonly updateFieldOptions: string;
}

/**
 * Context with package directory.
 */
export interface QueryLoaderContext {
  readonly packageDir: string;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Loads all GraphQL queries from .graphql files.
 *
 * @param ctx - Context with packageDir to locate query files
 * @returns All queries or an error if any query fails to load.
 */
export async function loadQueries(ctx: QueryLoaderContext): Promise<QueryLoaderResult<Queries>> {
  const queriesDir = join(ctx.packageDir, "scripts", "lib", "queries");

  const [getProjectError, getProject] = await readQuery(queriesDir, "get-project.graphql");
  if (getProjectError) {
    return [getProjectError, null];
  }

  const [listViewsError, listProjectViews] = await readQuery(
    queriesDir,
    "list-project-views.graphql",
  );
  if (listViewsError) {
    return [listViewsError, null];
  }

  const [listItemsError, listProjectItems] = await readQuery(
    queriesDir,
    "list-project-items.graphql",
  );
  if (listItemsError) {
    return [listItemsError, null];
  }

  const [updateOptionsError, updateFieldOptions] = await readQuery(
    queriesDir,
    "update-field-options.graphql",
  );
  if (updateOptionsError) {
    return [updateOptionsError, null];
  }

  return [
    null,
    {
      getProject,
      listProjectViews,
      listProjectItems,
      updateFieldOptions,
    },
  ];
}

// ---------------------------------------------------------------------------
// Private
// ---------------------------------------------------------------------------

/**
 * Reads a GraphQL query file.
 *
 * @private
 */
async function readQuery(dir: string, filename: string): Promise<QueryLoaderResult> {
  try {
    const content = await readFile(join(dir, filename), "utf-8");
    return [null, content.trim()];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return [new Error(`Failed to read ${filename}: ${message}`), null];
  }
}
