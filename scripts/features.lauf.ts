import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { lauf, z } from "laufen";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { createBackup } from "./lib/backup.js";
import { createGitHubClient } from "./lib/github-client.js";

const FEATURES_DIR = "docs/roadmap/features";
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const MAX_BODY_SECTIONS = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeaturesConfig {
  project: {
    owner: string;
    number: number;
  };
  statusMapping: Record<string, string>;
}

interface Frontmatter {
  status?: string;
  issue?: number | null;
  productArea?: string[];
}

interface FeatureFile {
  filename: string;
  filepath: string;
  title: string;
  body: string;
  raw: string;
  frontmatter: Frontmatter;
}

interface StatusField {
  id: string;
  options: Map<string, string>;
}

interface ProductAreaField {
  id: string;
  options: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Script
// ---------------------------------------------------------------------------

export default lauf({
  description: "Syncs features to GitHub issues",
  args: {
    verbose: z.boolean().default(false).describe("Enable verbose logging"),
    "dry-run": z.boolean().default(false).describe("Preview without creating issues"),
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
      // Determine sync direction
      let direction = ctx.args.direction;

      if (!direction) {
        const [promptErr, selected] = await ctx.prompts.select({
          message: "Select sync direction",
          options: [
            { value: "to-github", label: "To GitHub (create/update issues from local files)" },
            { value: "from-github", label: "From GitHub (update local files from issues)" },
          ],
        });

        if (promptErr?.cancelled || cancelled) {
          ctx.logger.warn("Cancelled by user");
          return 1;
        }

        direction = selected as "to-github" | "from-github";
      }

      const featuresDir = join(ctx.root, FEATURES_DIR);

      // Step 1: Read project config from scripts/conf/project.json
      ctx.spinner.start("Reading project config...");
      const config = await readFeaturesConfig(ctx.root);
      const { owner, number } = config.project;
      ctx.spinner.stop(`Read config for project #${number} (${owner})`);

      if (ctx.args.verbose) {
        ctx.logger.info(`Status mapping: ${JSON.stringify(config.statusMapping)}`);
      }

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
        ctx.spinner.start("Fetching project items from GitHub...");
        const [itemsError, projectItemsData] = await github.projects.items.list({
          owner,
          number,
        });
        if (itemsError) {
          ctx.logger.error(`Failed to fetch project items: ${itemsError.message}`);
          return 1;
        }
        const projectItems = new Map<number, string | null>();
        for (const item of projectItemsData) {
          if (item.content.number) {
            projectItems.set(item.content.number, item.status ?? null);
          }
        }
        ctx.spinner.stop(`Fetched ${projectItems.size} project item(s)`);

        if (cancelled) {
          ctx.logger.warn("Cancelled by user");
          return 1;
        }

        ctx.spinner.start("Scanning local feature files...");
        const files = await readdir(featuresDir);
        const mdFiles = files.filter((f) => f.endsWith(".md")).toSorted();

        if (mdFiles.length === 0) {
          ctx.logger.warn("No feature files found");
          return 0;
        }

        ctx.spinner.stop(`Found ${mdFiles.length} feature file(s)`);

        const reverseMapping = reverseStatusMapping(config.statusMapping);

        // Step 1: Scan and collect changes
        interface PendingChange {
          filename: string;
          filepath: string;
          raw: string;
          issueNumber: number;
          statusChanged: boolean;
          fromStatus: string;
          toStatus: string;
          contentChanged: boolean;
          fromContent: string;
          toContent: string;
        }

        const changes: PendingChange[] = [];

        ctx.spinner.start("Checking for differences...");
        let checked = 0;

        for (const filename of mdFiles) {
          const filepath = join(featuresDir, filename);
          // eslint-disable-next-line no-await-in-loop
          const raw = await readFile(filepath, "utf-8");

          const parsed = parseFrontmatter(raw);
          if (!parsed) {
            if (ctx.args.verbose) {
              ctx.logger.warn(`Skipping ${filename}: no frontmatter`);
            }
            continue;
          }

          const issueNumber = parsed.frontmatter.issue;
          if (!issueNumber) {
            if (ctx.args.verbose) {
              ctx.logger.info(`Skipping ${filename}: no linked issue`);
            }
            continue;
          }

          checked++;
          ctx.spinner.message(`Checking ${checked}/${mdFiles.length} files...`);

          const githubStatus = projectItems.get(issueNumber);
          if (githubStatus === undefined) {
            if (ctx.args.verbose) {
              ctx.logger.warn(`Issue #${issueNumber} not found in project`);
            }
            continue;
          }

          const localStatus = githubStatus ? reverseMapping.get(githubStatus) : undefined;
          const statusChanged = localStatus !== parsed.frontmatter.status;

          // Fetch and compare issue body
          // eslint-disable-next-line no-await-in-loop
          const [bodyError, issueData] = await github.issues.get(issueNumber);
          if (bodyError) {
            if (ctx.args.verbose) {
              ctx.logger.warn(`Failed to fetch issue #${issueNumber}: ${bodyError.message}`);
            }
            continue;
          }
          const githubBody = issueData.body;
          const localBody = buildIssueBody(parsed.content);

          const contentChanged = localBody ? localBody.body !== githubBody : false;

          if (!statusChanged && !contentChanged) {
            if (ctx.args.verbose) {
              ctx.logger.info(`${filename}: already in sync`);
            }
            continue;
          }

          changes.push({
            filename,
            filepath,
            raw,
            issueNumber,
            statusChanged,
            fromStatus: parsed.frontmatter.status ?? "(none)",
            toStatus: localStatus ?? "(none)",
            contentChanged,
            fromContent: parsed.content,
            toContent: githubBody,
          });
        }

        ctx.spinner.stop(`Checked ${checked} linked file(s)`);

        if (changes.length === 0) {
          ctx.logger.success("All feature statuses are already in sync");
          return 0;
        }

        // Step 2: Display changes in diff format
        const red = "\x1b[31m";
        const green = "\x1b[32m";
        const strike = "\x1b[9m";
        const reset = "\x1b[0m";

        ctx.logger.newlines();
        ctx.logger.info(`┌─ Changes to be applied (${changes.length} file(s))`);
        for (const change of changes) {
          ctx.logger.message(`│ ${change.filename} [#${change.issueNumber}]`);
          if (change.statusChanged) {
            ctx.logger.message(
              `│ ${red}${strike}- status: ${change.fromStatus}${reset}\n│ ${green}+ status: ${change.toStatus}${reset}`,
            );
          }
          if (change.contentChanged) {
            ctx.logger.message(`│ ${green}+ content: updated from GitHub${reset}`);
          }
        }
        ctx.logger.info("└─");
        ctx.logger.newlines();

        if (ctx.args["dry-run"]) {
          ctx.logger.warn("Dry run: no changes applied");
          return 0;
        }

        // Step 3: Ask for confirmation
        const [confirmErr, confirmed] = await ctx.prompts.confirm({
          message: `Apply ${changes.length} change(s)?`,
          initialValue: true,
        });

        if (confirmErr?.cancelled || !confirmed || cancelled) {
          ctx.logger.warn("Cancelled by user");
          return 1;
        }

        // Step 4: Create backup of local files before overwriting from GitHub
        ctx.spinner.start("Creating backup...");
        const backup = createBackup({
          root: ctx.root,
          namespace: {
            owner,
            project: number,
          },
        });
        const [backupError, backupPath] = await backup.local.directory({
          sourcePath: featuresDir,
          backupName: "features",
          fileExtension: ".md",
        });
        if (backupError) {
          ctx.spinner.stop();
          ctx.logger.error(`Failed to create backup: ${backupError.message}`);
          return 1;
        }
        ctx.spinner.stop(`Backup created at ${backupPath}`);

        // Step 5: Apply changes
        let updated = 0;
        for (const change of changes) {
          if (cancelled) {
            ctx.logger.warn("Cancelled by user");
            break;
          }

          let updatedRaw = change.raw;

          if (change.statusChanged) {
            updatedRaw = updateFrontmatter(updatedRaw, { status: change.toStatus });
          }

          if (change.contentChanged) {
            const match = updatedRaw.match(FRONTMATTER_RE);
            if (match) {
              updatedRaw = `${match[0]}\n${change.toContent}`;
            }
          }

          // eslint-disable-next-line no-await-in-loop
          await writeFile(change.filepath, updatedRaw);

          const changes_list: string[] = [];
          if (change.statusChanged) {
            changes_list.push(`status → ${change.toStatus}`);
          }
          if (change.contentChanged) {
            changes_list.push("content");
          }

          ctx.logger.success(`Updated ${change.filename} [${changes_list.join(", ")}]`);
          updated++;
        }

        ctx.logger.newlines();
        ctx.logger.success(`Updated ${updated} file(s)`);
        return 0;
      }

      // Step 2: Scan feature files and check for changes
      if (ctx.args.verbose) {
        ctx.logger.info(`Scanning features in ${featuresDir}`);
      }

      const files = await readdir(featuresDir);
      const mdFiles = files.filter((f) => f.endsWith(".md")).toSorted();

      if (mdFiles.length === 0) {
        ctx.logger.warn("No feature files found");
        return 0;
      }

      ctx.logger.info(`Found ${mdFiles.length} feature file(s)`);

      const featuresToCreate: FeatureFile[] = [];
      const featuresToUpdate: Array<FeatureFile & { issueNumber: number }> = [];

      ctx.spinner.start("Checking for differences...");
      let checked = 0;

      for (const filename of mdFiles) {
        const filepath = join(featuresDir, filename);
        // eslint-disable-next-line no-await-in-loop
        const raw = await readFile(filepath, "utf-8");

        const parsed = parseFrontmatter(raw);
        if (!parsed) {
          ctx.logger.warn(`Skipping ${filename}: no frontmatter`);
          continue;
        }

        const built = buildIssueBody(parsed.content);
        if (!built) {
          ctx.logger.warn(`Skipping ${filename}: no title found`);
          continue;
        }

        const feature: FeatureFile = {
          filename,
          filepath,
          title: built.title,
          body: built.body,
          raw,
          frontmatter: parsed.frontmatter,
        };

        if (parsed.frontmatter.issue) {
          checked++;
          ctx.spinner.message(`Checking ${checked} existing issue(s)...`);

          // Check if content has changed
          // eslint-disable-next-line no-await-in-loop
          const [bodyError, issueData] = await github.issues.get(parsed.frontmatter.issue);
          if (bodyError) {
            if (ctx.args.verbose) {
              ctx.logger.warn(
                `Failed to fetch issue #${parsed.frontmatter.issue}: ${bodyError.message}`,
              );
            }
            continue;
          }
          if (built.body !== issueData.body) {
            featuresToUpdate.push({ ...feature, issueNumber: parsed.frontmatter.issue });
          } else if (ctx.args.verbose) {
            ctx.logger.info(`${filename}: issue #${parsed.frontmatter.issue} already in sync`);
          }
        } else {
          featuresToCreate.push(feature);
        }
      }

      ctx.spinner.stop(`Checked ${checked} existing issue(s)`);

      if (featuresToCreate.length === 0 && featuresToUpdate.length === 0) {
        ctx.logger.success("All features are in sync with GitHub");
        return 0;
      }

      ctx.logger.info(
        `${featuresToCreate.length} feature(s) to create, ${featuresToUpdate.length} feature(s) to update`,
      );

      // Display changes in diff format
      const green = "\x1b[32m";
      const reset = "\x1b[0m";

      ctx.logger.newlines();
      ctx.logger.info(
        `┌─ Changes to be applied (${featuresToCreate.length + featuresToUpdate.length} change(s))`,
      );

      for (const feature of featuresToCreate) {
        const statusLabel = feature.frontmatter.status ? ` [${feature.frontmatter.status}]` : "";
        ctx.logger.message(`│ ${green}+ Create issue: ${feature.title}${statusLabel}${reset}`);
      }

      for (const feature of featuresToUpdate) {
        ctx.logger.message(
          `│ ${feature.filename} [#${feature.issueNumber}]\n│ ${green}+ content: update issue body${reset}`,
        );
      }

      ctx.logger.info("└─");
      ctx.logger.newlines();

      if (ctx.args["dry-run"]) {
        ctx.logger.warn("Dry run: no changes applied");
        return 0;
      }

      // Ask for confirmation
      const [confirmErr, confirmed] = await ctx.prompts.confirm({
        message: `Apply ${featuresToCreate.length + featuresToUpdate.length} change(s)?`,
        initialValue: true,
      });

      if (confirmErr?.cancelled || !confirmed || cancelled) {
        ctx.logger.warn("Cancelled by user");
        return 1;
      }

      // Step 3: Create backup of GitHub state before pushing local changes
      ctx.spinner.start("Creating backup of GitHub state...");
      const backup = createBackup({
        root: ctx.root,
        namespace: {
          owner,
          project: number,
        },
      });
      const [backupError, backupPath] = await backup.github.features({
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

      // Step 4: Fetch project state in parallel
      ctx.spinner.start("Fetching project field options...");
      const [[projectError, projectData], [fieldsError, fieldsData]] = await Promise.all([
        github.projects.get({ owner, number }),
        github.projects.fields.list({ owner, number }),
      ]);

      if (projectError) {
        ctx.logger.error(`Failed to fetch project: ${projectError.message}`);
        return 1;
      }
      if (fieldsError) {
        ctx.logger.error(`Failed to fetch project fields: ${fieldsError.message}`);
        return 1;
      }

      const projectId = projectData.id;
      const statusFieldData = fieldsData.find((f) => f.name === "Status");
      const productAreaFieldData = fieldsData.find((f) => f.name === "Product Area");

      if (!statusFieldData || !statusFieldData.options) {
        ctx.logger.error("Could not find Status field with options in project");
        return 1;
      }

      const statusField: StatusField = {
        id: statusFieldData.id,
        options: new Map(statusFieldData.options.map((o) => [o.name, o.id])),
      };

      const productAreaField: ProductAreaField | undefined = productAreaFieldData?.options
        ? {
            id: productAreaFieldData.id,
            options: new Map(productAreaFieldData.options.map((o) => [o.name, o.id])),
          }
        : undefined;

      ctx.spinner.stop("Fetched project field options");

      // Step 4: Validate that all feature statuses exist in statusMapping
      const allFeatures = [...featuresToCreate, ...featuresToUpdate];
      const usedStatuses = [
        ...new Set(allFeatures.map((f) => f.frontmatter.status).filter(Boolean)),
      ] as string[];

      const unmappedStatuses = usedStatuses.filter((s) => !(s in config.statusMapping));
      if (unmappedStatuses.length > 0) {
        ctx.logger.error(
          `Feature statuses not found in statusMapping: ${unmappedStatuses.join(", ")}`,
        );
        return 1;
      }

      // Validate that all mapped statuses exist in the project
      const mappedStatuses = [...new Set(usedStatuses.map((s) => config.statusMapping[s]))];
      const missingStatuses = mappedStatuses.filter((s) => !statusField.options.has(s));

      if (missingStatuses.length > 0) {
        ctx.logger.error(`Missing project status options: ${missingStatuses.join(", ")}`);
        return 1;
      }

      // Step 5: Apply changes
      let processed = 0;

      // Process updates first
      for (const feature of featuresToUpdate) {
        if (cancelled) {
          ctx.logger.warn("Cancelled by user");
          break;
        }

        ctx.spinner.start(`Updating issue #${feature.issueNumber}...`);

        // eslint-disable-next-line no-await-in-loop
        const [updateError] = await github.issues.update({
          issueNumber: feature.issueNumber,
          body: feature.body,
        });

        if (updateError) {
          ctx.spinner.stop();
          ctx.logger.error(
            `Failed to update issue #${feature.issueNumber}: ${updateError.message}`,
          );
        } else {
          ctx.spinner.stop(`Updated issue #${feature.issueNumber} for "${feature.title}"`);
          processed++;
        }
      }

      // Process creates
      for (const feature of featuresToCreate) {
        if (cancelled) {
          ctx.logger.warn("Cancelled by user");
          break;
        }

        ctx.spinner.start(`Creating issue for "${feature.title}"...`);

        // Search for existing issue with the same title
        // eslint-disable-next-line no-await-in-loop
        const [searchError, existingIssue] = await github.issues.search({
          title: feature.title,
        });

        if (searchError) {
          ctx.spinner.stop();
          ctx.logger.error(`Failed to search for existing issue: ${searchError.message}`);
          continue;
        }

        const mappedStatus = feature.frontmatter.status
          ? config.statusMapping[feature.frontmatter.status]
          : undefined;

        const productAreaOptionIds =
          productAreaField && feature.frontmatter.productArea
            ? feature.frontmatter.productArea
                .map((area) => productAreaField.options.get(area))
                .filter((id): id is string => id !== undefined)
            : undefined;

        if (existingIssue) {
          // Link existing issue instead of creating a duplicate
          const updated = updateFrontmatter(feature.raw, { issue: existingIssue.number });
          // eslint-disable-next-line no-await-in-loop
          await writeFile(feature.filepath, updated);

          ctx.spinner.message(`Adding #${existingIssue.number} to project...`);

          const optionId = mappedStatus ? statusField.options.get(mappedStatus) : undefined;
          // eslint-disable-next-line no-await-in-loop
          const [addError] = await github.projects.items.add({
            owner,
            number,
            projectId,
            issueUrl: existingIssue.url,
            statusFieldId: statusField.id,
            statusOptionId: optionId,
            productAreaFieldId: productAreaField?.id,
            productAreaOptionIds,
          });

          if (addError) {
            ctx.spinner.stop();
            ctx.logger.error(`Failed to add issue to project: ${addError.message}`);
            continue;
          }

          const statusLabel = feature.frontmatter.status ? ` [${feature.frontmatter.status}]` : "";
          ctx.spinner.stop(
            `Linked existing issue #${existingIssue.number}${statusLabel} for "${feature.title}"`,
          );
        } else {
          // Create new issue
          // eslint-disable-next-line no-await-in-loop
          const [createError, issue] = await github.issues.create({
            title: feature.title,
            body: feature.body,
          });

          if (createError) {
            ctx.spinner.stop();
            ctx.logger.error(`Failed to create issue: ${createError.message}`);
            continue;
          }

          // Write frontmatter immediately so re-runs don't create duplicates
          const updated = updateFrontmatter(feature.raw, { issue: issue.number });
          // eslint-disable-next-line no-await-in-loop
          await writeFile(feature.filepath, updated);

          ctx.spinner.message(`Adding #${issue.number} to project...`);

          const optionId = mappedStatus ? statusField.options.get(mappedStatus) : undefined;
          // eslint-disable-next-line no-await-in-loop
          const [addError] = await github.projects.items.add({
            owner,
            number,
            projectId,
            issueUrl: issue.url,
            statusFieldId: statusField.id,
            statusOptionId: optionId,
            productAreaFieldId: productAreaField?.id,
            productAreaOptionIds,
          });

          if (addError) {
            ctx.spinner.stop();
            ctx.logger.error(`Failed to add issue to project: ${addError.message}`);
            continue;
          }

          const statusLabel = feature.frontmatter.status ? ` [${feature.frontmatter.status}]` : "";
          ctx.spinner.stop(`Created issue #${issue.number}${statusLabel} for "${feature.title}"`);
        }

        processed++;
      }

      ctx.logger.newlines();
      ctx.logger.success(`Processed ${processed} issue(s)`);
    } finally {
      cleanup();
    }
  },
});

// ---------------------------------------------------------------------------
// Private
// ---------------------------------------------------------------------------

/**
 * Parses frontmatter from markdown content.
 *
 * @private
 */
function parseFrontmatter(raw: string): { frontmatter: Frontmatter; content: string } | null {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return null;
  }

  const frontmatter = parseYaml(match[1]) as Frontmatter;
  const content = raw.slice(match[0].length).replace(/^\n+/, "");

  return { frontmatter, content };
}

/**
 * Updates frontmatter in markdown content.
 *
 * @private
 */
function updateFrontmatter(raw: string, updates: Partial<Frontmatter>): string {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return raw;
  }

  const frontmatter = { ...(parseYaml(match[1]) as Frontmatter), ...updates };
  const rest = raw.slice(match[0].length);

  return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---${rest}`;
}

/**
 * Builds the issue body from the markdown content (without frontmatter).
 *
 * Includes the H1 title and the first N `##` sections.
 *
 * @private
 */
function buildIssueBody(content: string): { title: string; body: string } | null {
  const lines = content.split("\n");

  const titleIdx = lines.findIndex((l) => /^#\s+/.test(l));
  if (titleIdx === -1) {
    return null;
  }
  const title = lines[titleIdx].replace(/^#\s+/, "").trim();

  const sections: string[][] = [];
  let current: string[] | null = null;

  for (let i = titleIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      if (sections.length >= MAX_BODY_SECTIONS) {
        break;
      }
      current = [lines[i]];
      sections.push(current);
    } else if (current) {
      current.push(lines[i]);
    }
  }

  const bodyParts = [`# ${title}`, ""];
  for (const section of sections) {
    while (section.length > 1 && section[section.length - 1].trim() === "") {
      section.pop();
    }
    bodyParts.push(...section, "");
  }

  return { title, body: bodyParts.join("\n").trimEnd() + "\n" };
}

/**
 * Reads project owner, number, and statusMapping from scripts/conf/project.json.
 *
 * @private
 */
async function readFeaturesConfig(root: string): Promise<FeaturesConfig> {
  const raw = await readFile(join(root, "scripts/conf/project.json"), "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const project = parsed.project as FeaturesConfig["project"];
  const statusMapping = (parsed.statusMapping ?? {}) as Record<string, string>;

  return {
    project: { owner: project.owner, number: project.number },
    statusMapping,
  };
}

/**
 * Creates a reverse mapping from GitHub status to local status.
 *
 * @private
 */
function reverseStatusMapping(mapping: Record<string, string>): Map<string, string> {
  const reversed = new Map<string, string>();
  for (const [localStatus, githubStatus] of Object.entries(mapping)) {
    reversed.set(githubStatus, localStatus);
  }
  return reversed;
}
