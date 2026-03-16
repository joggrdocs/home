import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { lauf, z } from "laufen";

import { createBackup } from "./lib/backup.js";
import type { ConfigField, ConfigView, ProjectConfig } from "./lib/config.js";
import { readProjectConfig } from "./lib/config.js";
import { displayDiff, type DiffChange } from "./lib/diff.js";
import { displayDryRunWarning } from "./lib/dry-run-warning.js";
import type { ProjectField, ProjectView } from "./lib/github-client.js";
import { createGitHubClient } from "./lib/github-client.js";

/**
 * Built-in project fields that cannot be created or deleted.
 */
export const BUILT_IN_FIELDS = new Set([
  "Title",
  "Assignees",
  "Labels",
  "Milestone",
  "Repository",
  "Linked pull requests",
  "Reviewers",
  "Tracked by",
  "Tracks",
  "Parent issue",
  "Sub-issues progress",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldDiff {
  readonly toCreate: readonly ConfigField[];
  readonly toDelete: readonly ProjectField[];
  readonly toUpdate: ReadonlyArray<{ readonly config: ConfigField; readonly github: ProjectField }>;
}

export interface ViewDriftEntry {
  readonly view: string;
  readonly type: "missing_from_github" | "not_in_config" | "mismatch";
  readonly details?: string;
}

// ---------------------------------------------------------------------------
// Script
// ---------------------------------------------------------------------------

export default lauf({
  description: "Syncs GitHub Project v2 configuration",
  env: {
    GH_TOKEN: process.env.GH_TOKEN ?? "",
  },
  args: {
    verbose: z.boolean().default(false).describe("Enable verbose logging"),
    "dry-run": z.boolean().default(false).describe("Preview changes without applying"),
    direction: z
      .enum(["to-github", "from-github"])
      .optional()
      .describe("Sync direction: to-github or from-github"),
  },
  async run(ctx) {
    // Mutable flag for interrupt handling at the I/O boundary.
    let cancelled = false;

    const handleInterrupt = () => {
      if (!cancelled) {
        cancelled = true;
        ctx.logger.newlines();
        ctx.logger.warn("Received interrupt signal, finishing current operation...");
      }
    };

    const cleanup = () => {
      process.off("SIGINT", handleInterrupt);
      process.off("SIGTERM", handleInterrupt);
    };

    process.on("SIGINT", handleInterrupt);
    process.on("SIGTERM", handleInterrupt);

    try {
      const dryRun = ctx.args["dry-run"];

      if (dryRun) {
        displayDryRunWarning();
      }

      // Determine sync direction
      const direction = await resolveDirection(ctx, () => cancelled);
      if (!direction) {
        ctx.logger.warn("Cancelled by user");
        return 1;
      }

      // Step 1: Read config
      ctx.spinner.start("Reading project config...");
      const [configError, config] = await readProjectConfig(ctx.root);
      if (configError) {
        ctx.spinner.stop();
        ctx.logger.error(`Failed to read config: ${configError.message}`);
        return 1;
      }
      ctx.spinner.stop(
        `Read config for project #${config.project.number} (${config.project.owner})`,
      );

      const { owner, number } = config.project;

      // Initialize GitHub client
      ctx.spinner.start("Initializing GitHub client...");
      const [clientError, github] = await createGitHubClient({ packageDir: ctx.packageDir });
      if (clientError) {
        ctx.logger.error(`Failed to create GitHub client: ${clientError.message}`);
        return 1;
      }
      ctx.spinner.stop("GitHub client ready");

      // Handle from-github sync
      if (direction === "from-github") {
        if (cancelled) {
          ctx.logger.warn("Cancelled by user");
          return 1;
        }

        ctx.spinner.start("Fetching project state from GitHub...");
        const [[metadataErr, metadata], [fieldsErr, fields], [viewsErr, views]] = await Promise.all(
          [
            github.projects.get({ owner, number }),
            github.projects.fields.list({ owner, number }),
            github.projects.views.list({ owner, number }),
          ],
        );

        if (metadataErr) {
          ctx.logger.error(`Failed to fetch project metadata: ${metadataErr.message}`);
          return 1;
        }
        if (fieldsErr) {
          ctx.logger.error(`Failed to fetch project fields: ${fieldsErr.message}`);
          return 1;
        }
        if (viewsErr) {
          ctx.logger.error(`Failed to fetch project views: ${viewsErr.message}`);
          return 1;
        }

        ctx.spinner.stop("Fetched project state");

        if (cancelled) {
          ctx.logger.warn("Cancelled by user");
          return 1;
        }

        const customFields = fields
          .map(convertGitHubFieldToConfig)
          .filter((f): f is ConfigField => f !== null);
        const configViews = views.map(convertGitHubViewToConfig);

        const updatedConfig: ProjectConfig = {
          project: {
            owner,
            repo: config.project.repo,
            number,
            title: metadata.title,
            description: metadata.shortDescription,
            visibility: resolveVisibility(metadata.public),
            readme: metadata.readme,
          },
          fields: customFields,
          views: configViews,
          statusMapping: config.statusMapping ?? {},
        };

        // Compute changes
        const changes: DiffChange[] = [];

        if (config.project.title !== metadata.title) {
          changes.push({
            type: "modify",
            label: "project.title",
            detail: `"${config.project.title}" → "${metadata.title}"`,
          });
        }

        if (config.project.description !== metadata.shortDescription) {
          changes.push({
            type: "modify",
            label: "project.description",
            detail: `"${config.project.description}" → "${metadata.shortDescription}"`,
          });
        }

        const configVisibility = resolveVisibility(metadata.public);
        if (config.project.visibility !== configVisibility) {
          changes.push({
            type: "modify",
            label: "project.visibility",
            detail: `${config.project.visibility} → ${configVisibility}`,
          });
        }

        if (config.project.readme !== metadata.readme) {
          changes.push({
            type: "modify",
            label: "project.readme",
            detail: "updated",
          });
        }

        const configFieldNames = new Set(config.fields.map((f) => f.name));
        const githubFieldNames = new Set(customFields.map((f) => f.name));

        const addedFields: DiffChange[] = [...githubFieldNames]
          .filter((name) => !configFieldNames.has(name))
          .map((name) => ({ type: "add" as const, label: "fields", detail: name }));

        const removedFields: DiffChange[] = [...configFieldNames]
          .filter((name) => !githubFieldNames.has(name))
          .map((name) => ({ type: "remove" as const, label: "fields", detail: name }));

        changes.push(...addedFields, ...removedFields);

        const configViewNames = new Set(config.views.map((v) => v.name));
        const githubViewNames = new Set(configViews.map((v) => v.name));

        const addedViews: DiffChange[] = [...githubViewNames]
          .filter((name) => !configViewNames.has(name))
          .map((name) => ({ type: "add" as const, label: "views", detail: name }));

        const removedViews: DiffChange[] = [...configViewNames]
          .filter((name) => !githubViewNames.has(name))
          .map((name) => ({ type: "remove" as const, label: "views", detail: name }));

        changes.push(...addedViews, ...removedViews);

        if (changes.length === 0) {
          ctx.logger.success("Local config already matches GitHub");
          return 0;
        }

        // Display changes
        displayDiff(ctx.logger, changes);

        if (dryRun) {
          return 0;
        }

        // Ask for confirmation
        const [confirmErr, confirmed] = await ctx.prompts.confirm({
          message: `Apply ${changes.length} change(s)?`,
          initialValue: true,
        });

        if ((confirmErr !== null && confirmErr.cancelled) || !confirmed || cancelled) {
          ctx.logger.warn("Cancelled by user");
          return 1;
        }

        // Create backup of local file before overwriting from GitHub
        ctx.spinner.start("Creating backup...");
        const backup = createBackup({
          root: ctx.root,
          namespace: {
            owner,
            project: number,
          },
        });
        const [backupError, backupPath] = await backup.local.file({
          sourcePath: join(ctx.root, "scripts/conf/project.json"),
          backupName: "project",
        });
        if (backupError) {
          ctx.spinner.stop();
          ctx.logger.error(`Failed to create backup: ${backupError.message}`);
          return 1;
        }
        ctx.spinner.stop(`Backup created at ${backupPath}`);

        ctx.spinner.start("Writing scripts/conf/project.json...");
        await writeProjectConfig(ctx.root, updatedConfig);
        ctx.spinner.stop("Updated scripts/conf/project.json");
        ctx.logger.success("Project config synced from GitHub");

        return 0;
      }

      // Step 2: Fetch current state (parallel)
      ctx.spinner.start("Fetching current project state...");
      const [[metadataErr2, metadata], [fieldsErr2, fields], [viewsErr2, views]] =
        await Promise.all([
          github.projects.get({ owner, number }),
          github.projects.fields.list({ owner, number }),
          github.projects.views.list({ owner, number }),
        ]);

      if (metadataErr2) {
        ctx.logger.error(`Failed to fetch project metadata: ${metadataErr2.message}`);
        return 1;
      }
      if (fieldsErr2) {
        ctx.logger.error(`Failed to fetch project fields: ${fieldsErr2.message}`);
        return 1;
      }
      if (viewsErr2) {
        ctx.logger.error(`Failed to fetch project views: ${viewsErr2.message}`);
        return 1;
      }

      ctx.spinner.stop("Fetched project state");

      if (cancelled) {
        ctx.logger.warn("Cancelled by user");
        return 1;
      }

      if (ctx.args.verbose) {
        ctx.logger.info(`Project ID: ${metadata.id}`);
        ctx.logger.info(`Fields: ${fields.map((f) => f.name).join(", ")}`);
        ctx.logger.info(`Views: ${views.map((v) => v.name).join(", ")}`);
      }

      // Create backup of GitHub state before pushing local changes
      if (!dryRun) {
        ctx.spinner.start("Creating backup of GitHub state...");
        const backup = createBackup({
          root: ctx.root,
          namespace: {
            owner,
            project: number,
          },
        });
        const [backupError, backupPath] = await backup.github.project({
          github,
          owner,
          project: number,
        });
        if (backupError) {
          ctx.spinner.stop();
          ctx.logger.error(`Failed to create backup: ${backupError.message}`);
          return 1;
        }
        ctx.spinner.stop(`Backup created at ${backupPath}`);
      }

      // Step 3: Sync metadata
      ctx.logger.newlines();
      ctx.logger.info("── Metadata ──");
      await syncMetadata(github, config.project, metadata, dryRun, ctx);

      if (cancelled) {
        ctx.logger.warn("Cancelled by user");
        return 1;
      }

      // Step 4: Sync fields
      ctx.logger.newlines();
      ctx.logger.info("── Fields ──");

      const diff = computeFieldDiffs(config.fields, fields);

      if (diff.toCreate.length === 0 && diff.toDelete.length === 0 && diff.toUpdate.length === 0) {
        ctx.logger.success("All fields are in sync");
      } else {
        ctx.logger.info(
          `${diff.toCreate.length} to create, ${diff.toDelete.length} to delete, ${diff.toUpdate.length} to update`,
        );

        if (!dryRun) {
          // Delete fields
          if (diff.toDelete.length > 0) {
            ctx.logger.warn(`Deleting ${diff.toDelete.length} field(s)`);

            const [err, confirmed] = await ctx.prompts.confirm({
              message: `Delete ${diff.toDelete.length} field(s)? This cannot be undone.`,
              initialValue: false,
            });

            if ((err === null || !err.cancelled) && confirmed) {
              // Sequential — each API call must complete before the next, with cancellation support.
              for (const field of diff.toDelete) {
                if (cancelled) {
                  ctx.logger.warn("Cancelled by user");
                  break;
                }
                ctx.spinner.start(`Deleting field "${field.name}"...`);
                // eslint-disable-next-line no-await-in-loop
                const [deleteErr] = await github.projects.fields.delete({ fieldId: field.id });
                if (deleteErr) {
                  ctx.spinner.stop();
                  ctx.logger.error(`Failed to delete field: ${deleteErr.message}`);
                } else {
                  ctx.spinner.stop(`Deleted field "${field.name}"`);
                }
              }
            } else {
              ctx.logger.warn("Skipped field deletion");
            }
          }

          // Create fields — sequential with cancellation support.
          for (const field of diff.toCreate) {
            if (cancelled) {
              ctx.logger.warn("Cancelled by user");
              break;
            }
            ctx.spinner.start(`Creating field "${field.name}"...`);

            const selectOptions = buildSelectOptions(field);

            // eslint-disable-next-line no-await-in-loop
            const [createErr] = await github.projects.fields.create({
              owner,
              number,
              name: field.name,
              dataType: field.type,
              singleSelectOptions: selectOptions,
            });
            if (createErr) {
              ctx.spinner.stop();
              ctx.logger.error(`Failed to create field: ${createErr.message}`);
            } else {
              ctx.spinner.stop(`Created field "${field.name}"`);
            }
          }

          // Update field options — sequential with cancellation support.
          for (const { config: fieldConfig, github: ghField } of diff.toUpdate) {
            if (cancelled) {
              ctx.logger.warn("Cancelled by user");
              break;
            }
            ctx.spinner.start(`Updating options for "${fieldConfig.name}"...`);
            // eslint-disable-next-line no-await-in-loop
            const [updateErr] = await github.projects.fields.updateOptions({
              fieldId: ghField.id,
              options: (fieldConfig.options ?? []).map((o) => ({
                name: o.name,
                description: o.description ?? "",
                color: o.color ?? "GRAY",
              })),
            });
            if (updateErr) {
              ctx.spinner.stop();
              ctx.logger.error(`Failed to update field options: ${updateErr.message}`);
            } else {
              ctx.spinner.stop(`Updated options for "${fieldConfig.name}"`);
            }
          }
        }
      }

      if (cancelled) {
        ctx.logger.warn("Cancelled by user");
        return 1;
      }

      // Step 5: Check views
      ctx.logger.newlines();
      ctx.logger.info("── Views ──");

      const viewDrift = detectViewDrift(config.views, views);

      if (viewDrift.length === 0) {
        ctx.logger.success("All views are in sync");
      } else {
        ctx.logger.warn(`${viewDrift.length} view drift(s) detected`);
        viewDrift.forEach((drift) => {
          const detailsSuffix = formatDriftDetails(drift.details);
          ctx.logger.message(`  - ${drift.view}: ${drift.type}${detailsSuffix}`);
        });
        ctx.logger.info("Note: Views must be synced manually via the GitHub UI");
      }

      ctx.logger.newlines();
      ctx.logger.success("Sync complete");
    } finally {
      cleanup();
    }
  },
});

// ---------------------------------------------------------------------------
// Private
// ---------------------------------------------------------------------------

/**
 * Syncs project metadata to GitHub.
 *
 * @private
 */
async function syncMetadata(
  github: Awaited<ReturnType<typeof createGitHubClient>>[1],
  config: ProjectConfig["project"],
  current: { title: string; shortDescription: string; public: boolean; readme: string },
  dryRun: boolean,
  ctx: Parameters<Parameters<typeof lauf>[0]["run"]>[0],
): Promise<void> {
  if (!github) {
    return;
  }

  const changes: string[] = [];

  if (config.title !== current.title) {
    changes.push(`title: "${current.title}" → "${config.title}"`);
  }

  if (config.description !== current.shortDescription) {
    changes.push(`description: "${current.shortDescription}" → "${config.description}"`);
  }

  if (config.visibility === "PUBLIC" && !current.public) {
    changes.push("visibility: PRIVATE → PUBLIC");
  } else if (config.visibility === "PRIVATE" && current.public) {
    changes.push("visibility: PUBLIC → PRIVATE");
  }

  if (config.readme !== current.readme) {
    changes.push("readme: changed");
  }

  if (changes.length > 0) {
    ctx.logger.info(`Changes: ${changes.join(", ")}`);

    if (!dryRun) {
      ctx.logger.warn("Metadata updates require manual changes via GitHub UI");
    }
  } else {
    ctx.logger.success("Metadata is already in sync");
  }
}

/**
 * Computes field differences between config and GitHub.
 *
 * @private
 */
export function computeFieldDiffs(
  configFields: readonly ConfigField[],
  githubFields: readonly ProjectField[],
): FieldDiff {
  const customGithubFields = githubFields.filter((f) => !BUILT_IN_FIELDS.has(f.name));

  const githubByName = new Map(customGithubFields.map((f) => [f.name, f]));
  const configByName = new Map(configFields.map((f) => [f.name, f]));

  const toCreate = configFields.filter((cf) => !githubByName.has(cf.name));

  const toUpdate = configFields
    .filter((cf) => {
      const gf = githubByName.get(cf.name);
      if (!gf || cf.type !== "SINGLE_SELECT" || !gf.options) {
        return false;
      }
      const configOptionNames = new Set((cf.options ?? []).map((o) => o.name));
      const githubOptionNames = new Set(gf.options.map((o) => o.name));
      return (
        configOptionNames.size !== githubOptionNames.size ||
        [...configOptionNames].some((n) => !githubOptionNames.has(n))
      );
    })
    .map((cf) => ({ config: cf, github: githubByName.get(cf.name) as ProjectField }));

  const toDelete = customGithubFields.filter((gf) => !configByName.has(gf.name));

  return { toCreate, toDelete, toUpdate };
}

/**
 * Formats a sort field object as a string.
 *
 * @private
 */
export function formatSortField(sortBy: { field: string; direction: string } | null): string {
  if (sortBy) {
    return `${sortBy.field} ${sortBy.direction}`;
  }
  return "none";
}

/**
 * Detects view drift between config and GitHub.
 *
 * @private
 */
export function detectViewDrift(
  configViews: readonly ConfigView[],
  githubViews: readonly ProjectView[],
): readonly ViewDriftEntry[] {
  const configByName = new Map(configViews.map((v) => [v.name, v]));
  const githubByName = new Map(githubViews.map((v) => [v.name, v]));

  const configDrift = configViews.flatMap((cv): ViewDriftEntry[] => {
    const gv = githubByName.get(cv.name);
    if (!gv) {
      return [{ view: cv.name, type: "missing_from_github" }];
    }

    const details: string[] = [];

    if (cv.layout !== gv.layout) {
      details.push(`layout: ${gv.layout} → ${cv.layout}`);
    }

    const githubGroupBy = extractFirstFieldName(gv.groupByFields);
    if (cv.groupBy !== githubGroupBy) {
      details.push(`groupBy: ${githubGroupBy ?? "none"} → ${cv.groupBy ?? "none"}`);
    }

    const githubSortBy = extractSortBy(gv.sortByFields);

    if (
      (cv.sortBy === null && githubSortBy !== null) ||
      (cv.sortBy !== null && githubSortBy === null) ||
      (cv.sortBy &&
        githubSortBy &&
        (cv.sortBy.field !== githubSortBy.field || cv.sortBy.direction !== githubSortBy.direction))
    ) {
      details.push(`sortBy: ${formatSortField(githubSortBy)} → ${formatSortField(cv.sortBy)}`);
    }

    if (details.length > 0) {
      return [{ view: cv.name, type: "mismatch", details: details.join("; ") }];
    }
    return [];
  });

  const extraViews = githubViews
    .filter((gv) => !configByName.has(gv.name))
    .map((gv): ViewDriftEntry => ({ view: gv.name, type: "not_in_config" }));

  return [...configDrift, ...extraViews];
}

/**
 * Converts GitHub field to config field format.
 *
 * @private
 */
export function convertGitHubFieldToConfig(field: ProjectField): ConfigField | null {
  if (BUILT_IN_FIELDS.has(field.name)) {
    return null;
  }

  if (field.options === undefined) {
    return { name: field.name, type: field.type };
  }

  return {
    name: field.name,
    type: field.type,
    options: field.options.map((o) => ({ name: o.name })),
  };
}

/**
 * Converts GitHub view to config view format.
 *
 * @private
 */
export function convertGitHubViewToConfig(view: ProjectView): ConfigView {
  return {
    name: view.name,
    layout: view.layout,
    groupBy: extractFirstFieldName(view.groupByFields),
    sortBy: extractSortBy(view.sortByFields),
    fields: view.visibleFields.map((f) => f.name),
    filter: view.filter ?? undefined,
  };
}

/**
 * Writes project configuration to scripts/conf/project.json.
 *
 * @private
 */
async function writeProjectConfig(root: string, config: ProjectConfig): Promise<void> {
  const path = join(root, "scripts/conf/project.json");
  const content = JSON.stringify(config, null, 2) + "\n";
  await writeFile(path, content);
}

/**
 * Resolves the sync direction from args or by prompting the user.
 *
 * @private
 */
async function resolveDirection(
  ctx: Parameters<Parameters<typeof lauf>[0]["run"]>[0],
  isCancelled: () => boolean,
): Promise<"to-github" | "from-github" | null> {
  if (ctx.args.direction) {
    return ctx.args.direction as "to-github" | "from-github";
  }

  const [promptErr, selected] = await ctx.prompts.select({
    message: "Select sync direction",
    options: [
      { value: "to-github", label: "To GitHub (update GitHub from local config)" },
      { value: "from-github", label: "From GitHub (update local config from GitHub)" },
    ],
  });

  if ((promptErr !== null && promptErr.cancelled) || isCancelled()) {
    return null;
  }

  return selected as "to-github" | "from-github";
}

/**
 * Maps a boolean visibility flag to the config string.
 *
 * @private
 */
function resolveVisibility(isPublic: boolean): "PUBLIC" | "PRIVATE" {
  if (isPublic) {
    return "PUBLIC";
  }
  return "PRIVATE";
}

/**
 * Builds select options for a SINGLE_SELECT field, or returns undefined.
 *
 * @private
 */
function buildSelectOptions(
  field: ConfigField,
): ReadonlyArray<{ name: string; description: string; color: string }> | undefined {
  if (field.type !== "SINGLE_SELECT" || field.options === undefined) {
    return undefined;
  }
  return field.options.map((o) => ({
    name: o.name,
    description: o.description ?? "",
    color: o.color ?? "GRAY",
  }));
}

/**
 * Formats optional drift details into a parenthesized suffix.
 *
 * @private
 */
function formatDriftDetails(details: string | undefined): string {
  if (details === undefined) {
    return "";
  }
  return ` (${details})`;
}

/**
 * Extracts the name of the first field from an array, or null if empty.
 *
 * @private
 */
function extractFirstFieldName(fields: readonly { readonly name: string }[]): string | null {
  if (fields.length === 0) {
    return null;
  }
  return fields[0].name;
}

/**
 * Extracts sortBy configuration from an array of sort-by field entries.
 *
 * @private
 */
function extractSortBy(
  sortByFields: readonly {
    readonly field: { readonly name: string };
    readonly direction: string;
  }[],
): { readonly field: string; readonly direction: string } | null {
  if (sortByFields.length === 0) {
    return null;
  }
  return { field: sortByFields[0].field.name, direction: sortByFields[0].direction };
}
