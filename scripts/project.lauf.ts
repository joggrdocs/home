import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { lauf, z } from "laufen";

import { createBackup } from "./lib/backup.js";
import { createGitHubClient } from "./lib/github-client.js";
import type { ProjectField, ProjectView } from "./lib/github-client.js";

/**
 * Built-in project fields that cannot be created or deleted.
 */
const BUILT_IN_FIELDS = new Set([
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

interface ProjectConfig {
  project: {
    owner: string;
    number: number;
    title: string;
    description: string;
    visibility: "PUBLIC" | "PRIVATE";
    readme: string;
  };
  fields: ConfigField[];
  views: ConfigView[];
  statusMapping?: Record<string, string>;
}

interface ConfigField {
  name: string;
  type: string;
  options?: Array<{ name: string; description?: string; color?: string }>;
}

interface ConfigView {
  name: string;
  layout: string;
  groupBy: string | null;
  sortBy: { field: string; direction: string } | null;
  fields: string[];
  filter?: string;
}

interface FieldDiff {
  toCreate: ConfigField[];
  toDelete: ProjectField[];
  toUpdate: Array<{ config: ConfigField; github: ProjectField }>;
}

interface ViewDriftEntry {
  view: string;
  type: "missing_from_github" | "not_in_config" | "mismatch";
  details?: string;
}

// ---------------------------------------------------------------------------
// Script
// ---------------------------------------------------------------------------

export default lauf({
  description: "Syncs GitHub Project v2 configuration",
  args: {
    verbose: z.boolean().default(false).describe("Enable verbose logging"),
    "dry-run": z.boolean().default(false).describe("Preview changes without applying"),
    direction: z
      .enum(["to-github", "from-github"])
      .optional()
      .describe("Sync direction: to-github or from-github"),
  },
  async run(ctx) {
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
        ctx.logger.warn("Dry run mode: no changes will be applied");
      }

      // Determine sync direction
      let direction = ctx.args.direction;

      if (!direction) {
        const [promptErr, selected] = await ctx.prompts.select({
          message: "Select sync direction",
          options: [
            { value: "to-github", label: "To GitHub (update GitHub from local config)" },
            { value: "from-github", label: "From GitHub (update local config from GitHub)" },
          ],
        });

        if (promptErr?.cancelled || cancelled) {
          ctx.logger.warn("Cancelled by user");
          return 1;
        }

        direction = selected as "to-github" | "from-github";
      }

      // Step 1: Read config
      ctx.spinner.start("Reading project config...");
      const config = await readProjectConfig(ctx.root);
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
            number,
            title: metadata.title,
            description: metadata.shortDescription,
            visibility: metadata.public ? "PUBLIC" : "PRIVATE",
            readme: metadata.readme,
          },
          fields: customFields,
          views: configViews,
          statusMapping: config.statusMapping ?? {},
        };

        // Compute changes
        interface Change {
          type: "modify" | "add" | "remove";
          field: string;
          detail: string;
        }

        const changes: Change[] = [];

        if (config.project.title !== metadata.title) {
          changes.push({
            type: "modify",
            field: "project.title",
            detail: `"${config.project.title}" → "${metadata.title}"`,
          });
        }

        if (config.project.description !== metadata.shortDescription) {
          changes.push({
            type: "modify",
            field: "project.description",
            detail: `"${config.project.description}" → "${metadata.shortDescription}"`,
          });
        }

        const configVisibility = metadata.public ? "PUBLIC" : "PRIVATE";
        if (config.project.visibility !== configVisibility) {
          changes.push({
            type: "modify",
            field: "project.visibility",
            detail: `${config.project.visibility} → ${configVisibility}`,
          });
        }

        if (config.project.readme !== metadata.readme) {
          changes.push({
            type: "modify",
            field: "project.readme",
            detail: "updated",
          });
        }

        const configFieldNames = new Set(config.fields.map((f) => f.name));
        const githubFieldNames = new Set(customFields.map((f) => f.name));

        for (const fieldName of githubFieldNames) {
          if (!configFieldNames.has(fieldName)) {
            changes.push({
              type: "add",
              field: "fields",
              detail: fieldName,
            });
          }
        }

        for (const fieldName of configFieldNames) {
          if (!githubFieldNames.has(fieldName)) {
            changes.push({
              type: "remove",
              field: "fields",
              detail: fieldName,
            });
          }
        }

        const configViewNames = new Set(config.views.map((v) => v.name));
        const githubViewNames = new Set(configViews.map((v) => v.name));

        for (const viewName of githubViewNames) {
          if (!configViewNames.has(viewName)) {
            changes.push({
              type: "add",
              field: "views",
              detail: viewName,
            });
          }
        }

        for (const viewName of configViewNames) {
          if (!githubViewNames.has(viewName)) {
            changes.push({
              type: "remove",
              field: "views",
              detail: viewName,
            });
          }
        }

        if (changes.length === 0) {
          ctx.logger.success("Local config already matches GitHub");
          return 0;
        }

        // Display changes
        const red = "\x1b[31m";
        const green = "\x1b[32m";
        const strike = "\x1b[9m";
        const reset = "\x1b[0m";

        ctx.logger.newlines();
        ctx.logger.info(`┌─ Changes to be applied (${changes.length} change(s))`);
        for (const change of changes) {
          if (change.type === "add") {
            ctx.logger.message(`│ ${green}+ ${change.field}: ${change.detail}${reset}`);
          } else if (change.type === "remove") {
            ctx.logger.message(`│ ${red}${strike}- ${change.field}: ${change.detail}${reset}`);
          } else {
            ctx.logger.message(`│ ${change.field}: ${change.detail}`);
          }
        }
        ctx.logger.info("└─");
        ctx.logger.newlines();

        if (dryRun) {
          ctx.logger.warn("Dry run: no changes applied");
          return 0;
        }

        // Ask for confirmation
        const [confirmErr, confirmed] = await ctx.prompts.confirm({
          message: `Apply ${changes.length} change(s)?`,
          initialValue: true,
        });

        if (confirmErr?.cancelled || !confirmed || cancelled) {
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
          sourcePath: join(ctx.root, "project.json"),
          backupName: "project",
        });
        if (backupError) {
          ctx.spinner.stop();
          ctx.logger.error(`Failed to create backup: ${backupError.message}`);
          return 1;
        }
        ctx.spinner.stop(`Backup created at ${backupPath}`);

        ctx.spinner.start("Writing project.json...");
        await writeProjectConfig(ctx.root, updatedConfig);
        ctx.spinner.stop("Updated project.json");
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

            if (!err?.cancelled && confirmed) {
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

          // Create fields
          for (const field of diff.toCreate) {
            if (cancelled) {
              ctx.logger.warn("Cancelled by user");
              break;
            }
            ctx.spinner.start(`Creating field "${field.name}"...`);

            const selectOptions =
              (field.type === "SINGLE_SELECT" || field.type === "MULTI_SELECT") && field.options
                ? field.options.map((o) => ({
                    name: o.name,
                    description: o.description ?? "",
                    color: o.color ?? "GRAY",
                  }))
                : undefined;

            // eslint-disable-next-line no-await-in-loop
            const [createErr] = await github.projects.fields.create({
              owner,
              number,
              name: field.name,
              dataType: field.type,
              singleSelectOptions: field.type === "SINGLE_SELECT" ? selectOptions : undefined,
              multiSelectOptions: field.type === "MULTI_SELECT" ? selectOptions : undefined,
            });
            if (createErr) {
              ctx.spinner.stop();
              ctx.logger.error(`Failed to create field: ${createErr.message}`);
            } else {
              ctx.spinner.stop(`Created field "${field.name}"`);
            }
          }

          // Update field options
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
        } else {
          ctx.logger.warn("Dry run: skipping field changes");
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
        for (const drift of viewDrift) {
          ctx.logger.message(
            `  - ${drift.view}: ${drift.type}${drift.details ? ` (${drift.details})` : ""}`,
          );
        }
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
 * Reads project configuration from project.json.
 *
 * @private
 */
async function readProjectConfig(root: string): Promise<ProjectConfig> {
  const raw = await readFile(join(root, "project.json"), "utf-8");
  return JSON.parse(raw) as ProjectConfig;
}

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
    ctx.logger.info("Changes:", ...changes);

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
function computeFieldDiffs(configFields: ConfigField[], githubFields: ProjectField[]): FieldDiff {
  const customGithubFields = githubFields.filter((f) => !BUILT_IN_FIELDS.has(f.name));

  const githubByName = new Map(customGithubFields.map((f) => [f.name, f]));
  const configByName = new Map(configFields.map((f) => [f.name, f]));

  const toCreate: ConfigField[] = [];
  const toUpdate: Array<{ config: ConfigField; github: ProjectField }> = [];

  for (const cf of configFields) {
    const gf = githubByName.get(cf.name);
    if (!gf) {
      toCreate.push(cf);
    } else if ((cf.type === "SINGLE_SELECT" || cf.type === "MULTI_SELECT") && gf.options) {
      const configOptionNames = new Set(cf.options?.map((o) => o.name) ?? []);
      const githubOptionNames = new Set(gf.options.map((o) => o.name));

      const optionsChanged =
        configOptionNames.size !== githubOptionNames.size ||
        [...configOptionNames].some((n) => !githubOptionNames.has(n));

      if (optionsChanged) {
        toUpdate.push({ config: cf, github: gf });
      }
    }
  }

  const toDelete = customGithubFields.filter((gf) => !configByName.has(gf.name));

  return { toCreate, toDelete, toUpdate };
}

/**
 * Formats a sort field object as a string.
 *
 * @private
 */
function formatSortField(sortBy: { field: string; direction: string } | null): string {
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
function detectViewDrift(configViews: ConfigView[], githubViews: ProjectView[]): ViewDriftEntry[] {
  const configByName = new Map(configViews.map((v) => [v.name, v]));
  const githubByName = new Map(githubViews.map((v) => [v.name, v]));

  const drift: ViewDriftEntry[] = [];

  for (const cv of configViews) {
    const gv = githubByName.get(cv.name);
    if (!gv) {
      drift.push({ view: cv.name, type: "missing_from_github" });
    } else {
      const details: string[] = [];

      if (cv.layout !== gv.layout) {
        details.push(`layout: ${gv.layout} → ${cv.layout}`);
      }

      const githubGroupBy = gv.groupByFields[0]?.name ?? null;
      if (cv.groupBy !== githubGroupBy) {
        details.push(`groupBy: ${githubGroupBy ?? "none"} → ${cv.groupBy ?? "none"}`);
      }

      const githubSortBy = gv.sortByFields[0]
        ? { field: gv.sortByFields[0].field.name, direction: gv.sortByFields[0].direction }
        : null;

      if (
        (cv.sortBy === null && githubSortBy !== null) ||
        (cv.sortBy !== null && githubSortBy === null) ||
        (cv.sortBy &&
          githubSortBy &&
          (cv.sortBy.field !== githubSortBy.field ||
            cv.sortBy.direction !== githubSortBy.direction))
      ) {
        details.push(`sortBy: ${formatSortField(githubSortBy)} → ${formatSortField(cv.sortBy)}`);
      }

      if (details.length > 0) {
        drift.push({ view: cv.name, type: "mismatch", details: details.join("; ") });
      }
    }
  }

  for (const gv of githubViews) {
    if (!configByName.has(gv.name)) {
      drift.push({ view: gv.name, type: "not_in_config" });
    }
  }

  return drift;
}

/**
 * Converts GitHub field to config field format.
 *
 * @private
 */
function convertGitHubFieldToConfig(field: ProjectField): ConfigField | null {
  if (BUILT_IN_FIELDS.has(field.name)) {
    return null;
  }

  return {
    name: field.name,
    type: field.type,
    options: field.options?.map((o) => ({ name: o.name })),
  };
}

/**
 * Converts GitHub view to config view format.
 *
 * @private
 */
function convertGitHubViewToConfig(view: ProjectView): ConfigView {
  return {
    name: view.name,
    layout: view.layout,
    groupBy: view.groupByFields[0]?.name ?? null,
    sortBy: view.sortByFields[0]
      ? { field: view.sortByFields[0].field.name, direction: view.sortByFields[0].direction }
      : null,
    fields: view.visibleFields.map((f) => f.name),
    filter: view.filter ?? undefined,
  };
}

/**
 * Writes project configuration to project.json.
 *
 * @private
 */
async function writeProjectConfig(root: string, config: ProjectConfig): Promise<void> {
  const path = join(root, "project.json");
  const content = JSON.stringify(config, null, 2) + "\n";
  await writeFile(path, content);
}
