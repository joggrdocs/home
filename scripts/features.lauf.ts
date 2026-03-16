import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { diffLines } from "diff";
import { lauf, z } from "laufen";

import { ANSI } from "./lib/ansi.js";
import { createBackup } from "./lib/backup.js";
import { FEATURES_DIR, readProjectConfig } from "./lib/config.js";
import { displayDryRunWarning } from "./lib/dry-run-warning.js";
import { FRONTMATTER_RE, parseFrontmatter, updateFrontmatter } from "./lib/frontmatter.js";
import { createGitHubClient } from "./lib/github-client.js";
import { reverseStatusMapping } from "./lib/status.js";

export const MAX_BODY_SECTIONS = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface FeatureChanges {
  bodyChanged: boolean;
  statusChanged: boolean;
  productAreaChanged: boolean;
  oldBody?: string;
  oldStatus?: string;
  oldProductArea?: readonly string[];
}

interface StatusField {
  id: string;
  options: Map<string, string>;
}

interface ProductAreaField {
  id: string;
  type: string;
  options: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Script
// ---------------------------------------------------------------------------

export default lauf({
  description: "Syncs features to GitHub issues",
  env: {
    GH_TOKEN: process.env.GH_TOKEN ?? "",
  },
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
      if (ctx.args["dry-run"]) {
        displayDryRunWarning();
      }

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

        if ((promptErr !== null && promptErr.cancelled) || cancelled) {
          ctx.logger.warn("Cancelled by user");
          return 1;
        }

        direction = selected as "to-github" | "from-github";
      }

      const featuresDir = join(ctx.root, FEATURES_DIR);

      // Step 1: Read project config from scripts/conf/project.json
      ctx.spinner.start("Reading project config...");
      const [configError, config] = await readProjectConfig(ctx.root);
      if (configError) {
        ctx.spinner.stop();
        ctx.logger.error(`Failed to read config: ${configError.message}`);
        return 1;
      }
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
        const projectItems = new Map(
          projectItemsData
            .filter((item) => item.content.number !== undefined)
            .map((item) => [item.content.number as number, item.status ?? null] as const),
        );
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

          const parsed = parseFrontmatter<Frontmatter>(raw);
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

          const localStatus = resolveReverseStatus(githubStatus, reverseMapping);
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

          const contentChanged = localBody !== null && localBody.body !== githubBody;

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
        const { red, green, dim, reset } = ANSI;

        ctx.logger.newlines();
        ctx.logger.info(`┌─ Changes to be applied (${changes.length} file(s))`);
        for (const change of changes) {
          ctx.logger.message(`│ ${dim}#${change.issueNumber} --> ${change.filename}${reset}`);

          if (change.contentChanged) {
            const diff = diffLines(change.fromContent, change.toContent, {
              ignoreWhitespace: true,
            });
            const MAX_DIFF_LINES = 10;
            let linesShown = 0;

            for (const part of diff) {
              if (linesShown >= MAX_DIFF_LINES) {
                ctx.logger.message(`│   ${dim}... (diff truncated)${reset}`);
                break;
              }

              const lines = part.value.split("\n").filter((line) => line.length > 0);
              if (part.added) {
                for (const line of lines) {
                  if (linesShown >= MAX_DIFF_LINES) break;
                  ctx.logger.message(`│   ${green}+ ${line}${reset}`);
                  linesShown++;
                }
              } else if (part.removed) {
                for (const line of lines) {
                  if (linesShown >= MAX_DIFF_LINES) break;
                  ctx.logger.message(`│   ${red}- ${line}${reset}`);
                  linesShown++;
                }
              }
            }
          }

          if (change.statusChanged) {
            ctx.logger.message(`│   ${red}- status: ${change.fromStatus}${reset}`);
            ctx.logger.message(`│   ${green}+ status: ${change.toStatus}${reset}`);
          }
        }
        ctx.logger.info("└─");
        ctx.logger.newlines();

        if (ctx.args["dry-run"]) {
          return 0;
        }

        // Step 3: Ask for confirmation
        const [confirmErr, confirmed] = await ctx.prompts.confirm({
          message: `Apply ${changes.length} change(s)?`,
          initialValue: true,
        });

        if ((confirmErr !== null && confirmErr.cancelled) || !confirmed || cancelled) {
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
            updatedRaw = updateFrontmatter<Frontmatter>(updatedRaw, { status: change.toStatus });
          }

          if (change.contentChanged) {
            const match = updatedRaw.match(FRONTMATTER_RE);
            if (match) {
              updatedRaw = `${match[0]}\n${change.toContent}`;
            }
          }

          // eslint-disable-next-line no-await-in-loop
          await writeFile(change.filepath, updatedRaw);

          const changesList: string[] = [];
          if (change.statusChanged) {
            changesList.push(`status → ${change.toStatus}`);
          }
          if (change.contentChanged) {
            changesList.push("content");
          }

          ctx.logger.success(`Updated ${change.filename} [${changesList.join(", ")}]`);
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

      // Fetch project items to get current status and product area
      ctx.spinner.start("Fetching project items...");
      const [itemsError, projectItemsData] = await github.projects.items.list({
        owner,
        number,
      });
      if (itemsError) {
        ctx.logger.error(`Failed to fetch project items: ${itemsError.message}`);
        return 1;
      }
      const projectItems = new Map(
        projectItemsData
          .filter((item) => item.content.number !== undefined)
          .map(
            (item) =>
              [
                item.content.number as number,
                { status: item.status, productArea: item.productArea },
              ] as const,
          ),
      );
      ctx.spinner.stop(`Fetched ${projectItems.size} project item(s)`);

      const featuresToCreate: FeatureFile[] = [];
      const featuresToUpdate: Array<
        FeatureFile & { issueNumber: number; changes: FeatureChanges }
      > = [];

      ctx.spinner.start("Checking for differences...");
      let checked = 0;

      for (const filename of mdFiles) {
        const filepath = join(featuresDir, filename);
        // eslint-disable-next-line no-await-in-loop
        const raw = await readFile(filepath, "utf-8");

        const parsed = parseFrontmatter<Frontmatter>(raw);
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

          const projectItem = projectItems.get(parsed.frontmatter.issue);
          const localStatus = resolveLocalStatus(parsed.frontmatter.status, config.statusMapping);
          const githubStatus = extractItemStatus(projectItem);

          const localProductArea = parsed.frontmatter.productArea ?? [];
          const githubProductArea = extractItemProductArea(projectItem);

          const bodyChanged = built.body !== issueData.body;
          const statusChanged = localStatus !== githubStatus;
          const productAreaChanged =
            localProductArea.length !== githubProductArea.length ||
            !localProductArea.every((area) => githubProductArea.includes(area));

          if (bodyChanged || statusChanged || productAreaChanged) {
            featuresToUpdate.push({
              ...feature,
              issueNumber: parsed.frontmatter.issue,
              changes: buildFeatureChanges({
                bodyChanged,
                statusChanged,
                productAreaChanged,
                issueBody: issueData.body,
                githubStatus,
                githubProductArea,
              }),
            });
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
      const { red, green, dim, reset } = ANSI;

      ctx.logger.newlines();
      ctx.logger.info(
        `┌─ Changes to be applied (${featuresToCreate.length + featuresToUpdate.length} change(s))`,
      );

      for (const feature of featuresToCreate) {
        const statusLabel = formatStatusLabel(feature.frontmatter.status);
        const productAreaLabel = formatProductAreaLabel(feature.frontmatter.productArea);
        ctx.logger.message(
          `│ ${green}+ Create issue: ${feature.title}${statusLabel}${productAreaLabel}${reset}`,
        );
      }

      for (const feature of featuresToUpdate) {
        ctx.logger.message(`│ ${dim}${feature.filename} --> #${feature.issueNumber}${reset}`);

        if (feature.changes.bodyChanged && feature.changes.oldBody) {
          const diff = diffLines(feature.changes.oldBody, feature.body, {
            ignoreWhitespace: true,
          });
          const MAX_DIFF_LINES = 10;
          let linesShown = 0;

          for (const part of diff) {
            if (linesShown >= MAX_DIFF_LINES) {
              ctx.logger.message(`│   ${dim}... (diff truncated)${reset}`);
              break;
            }

            const lines = part.value.split("\n").filter((line) => line.length > 0);
            if (part.added) {
              for (const line of lines) {
                if (linesShown >= MAX_DIFF_LINES) break;
                ctx.logger.message(`│   ${green}+ ${line}${reset}`);
                linesShown++;
              }
            } else if (part.removed) {
              for (const line of lines) {
                if (linesShown >= MAX_DIFF_LINES) break;
                ctx.logger.message(`│   ${red}- ${line}${reset}`);
                linesShown++;
              }
            }
          }
        }

        if (feature.changes.statusChanged) {
          const localStatus =
            resolveLocalStatus(feature.frontmatter.status, config.statusMapping) ?? "(none)";
          const oldStatus = feature.changes.oldStatus ?? "(none)";
          ctx.logger.message(`│   ${red}- status: ${oldStatus}${reset}`);
          ctx.logger.message(`│   ${green}+ status: ${localStatus}${reset}`);
        }

        if (feature.changes.productAreaChanged) {
          const oldAreas = feature.changes.oldProductArea ?? [];
          const newAreas = feature.frontmatter.productArea ?? [];
          const removedAreas = oldAreas.filter((area) => !newAreas.includes(area));
          const addedAreas = newAreas.filter((area) => !oldAreas.includes(area));

          if (removedAreas.length > 0) {
            ctx.logger.message(`│   ${red}- productArea: ${removedAreas.join(", ")}${reset}`);
          }
          if (addedAreas.length > 0) {
            ctx.logger.message(`│   ${green}+ productArea: ${addedAreas.join(", ")}${reset}`);
          }
        }
      }

      ctx.logger.info("└─");
      ctx.logger.newlines();

      if (ctx.args["dry-run"]) {
        return 0;
      }

      // Ask for confirmation
      const [confirmErr, confirmed] = await ctx.prompts.confirm({
        message: `Apply ${featuresToCreate.length + featuresToUpdate.length} change(s)?`,
        initialValue: true,
      });

      if ((confirmErr !== null && confirmErr.cancelled) || !confirmed || cancelled) {
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

      const productAreaField = buildProductAreaField(productAreaFieldData);

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

      // Build project items map with IDs
      const projectItemsWithIds = new Map(
        projectItemsData
          .filter((item) => item.content.number !== undefined)
          .map((item) => [item.content.number as number, item.id] as const),
      );

      // Process updates first
      for (const feature of featuresToUpdate) {
        if (cancelled) {
          ctx.logger.warn("Cancelled by user");
          break;
        }

        ctx.spinner.start(`Updating issue #${feature.issueNumber}...`);

        // Update issue body if changed
        if (feature.changes.bodyChanged) {
          // eslint-disable-next-line no-await-in-loop
          const [updateError] = await github.issues.update({
            issueNumber: feature.issueNumber,
            body: feature.body,
          });

          if (updateError) {
            ctx.spinner.stop();
            ctx.logger.error(
              `Failed to update issue body #${feature.issueNumber}: ${updateError.message}`,
            );
            continue;
          }
        }

        const itemId = projectItemsWithIds.get(feature.issueNumber);
        if (!itemId) {
          ctx.spinner.stop();
          ctx.logger.warn(`Could not find project item ID for issue #${feature.issueNumber}`);
          continue;
        }

        // Update status field if changed
        if (feature.changes.statusChanged && feature.frontmatter.status) {
          const mappedStatus = config.statusMapping[feature.frontmatter.status];
          const statusOptionId = statusField.options.get(mappedStatus);

          if (statusOptionId) {
            // Create GraphQL mutation for status update
            const statusMutation = {
              query: `
                mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
                  updateProjectV2ItemFieldValue(input: {
                    projectId: $projectId
                    itemId: $itemId
                    fieldId: $fieldId
                    value: { singleSelectOptionId: $optionId }
                  }) {
                    projectV2Item { id }
                  }
                }
              `,
              variables: {
                projectId,
                itemId,
                fieldId: statusField.id,
                optionId: statusOptionId,
              },
            };

            // eslint-disable-next-line no-await-in-loop
            const [statusError] = await github.graphql({
              query: statusMutation.query,
              variables: statusMutation.variables,
            });

            if (statusError) {
              ctx.spinner.stop();
              ctx.logger.error(
                `Failed to update status for #${feature.issueNumber}: ${statusError.message}`,
              );
              continue;
            }
          }
        }

        // Update product area field if changed
        if (
          feature.changes.productAreaChanged &&
          productAreaField &&
          feature.frontmatter.productArea
        ) {
          const productAreaOptionIds = feature.frontmatter.productArea
            .map((area) => productAreaField.options.get(area))
            .filter((id): id is string => id !== undefined);

          if (productAreaOptionIds.length > 0) {
            // Both single-select and iteration fields only support a single value
            const optionId = productAreaOptionIds[0];

            const query = buildProductAreaMutation(productAreaField.type);

            // eslint-disable-next-line no-await-in-loop
            const [productAreaError] = await github.graphql({
              query,
              variables: {
                projectId,
                itemId,
                fieldId: productAreaField.id,
                optionId,
              },
            });

            if (productAreaError) {
              ctx.spinner.stop();
              ctx.logger.error(
                `Failed to update product area for #${feature.issueNumber}: ${productAreaError.message}`,
              );
              continue;
            }
          }
        }

        const changesList = [
          feature.changes.bodyChanged && "body",
          feature.changes.statusChanged && "status",
          feature.changes.productAreaChanged && "product area",
        ]
          .filter(Boolean)
          .join(", ");

        ctx.spinner.stop(
          `Updated issue #${feature.issueNumber} for "${feature.title}" (${changesList})`,
        );
        processed++;
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

        const mappedStatus = resolveLocalStatus(feature.frontmatter.status, config.statusMapping);

        const productAreaOptionIds = resolveProductAreaOptionIds(
          productAreaField,
          feature.frontmatter.productArea,
        );

        if (existingIssue) {
          // Link existing issue instead of creating a duplicate
          const updated = updateFrontmatter<Frontmatter>(feature.raw, {
            issue: existingIssue.number,
          });
          // eslint-disable-next-line no-await-in-loop
          await writeFile(feature.filepath, updated);

          ctx.spinner.message(`Adding #${existingIssue.number} to project...`);

          const optionId = resolveOptionId(mappedStatus, statusField.options);
          // eslint-disable-next-line no-await-in-loop
          const [addError] = await github.projects.items.add({
            owner,
            number,
            projectId,
            issueUrl: existingIssue.url,
            statusFieldId: statusField.id,
            statusOptionId: optionId,
            productAreaFieldId: getFieldId(productAreaField),
            productAreaOptionIds,
          });

          if (addError) {
            ctx.spinner.stop();
            ctx.logger.error(`Failed to add issue to project: ${addError.message}`);
            continue;
          }

          const statusLabel = formatStatusLabel(feature.frontmatter.status);
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
          const updated = updateFrontmatter<Frontmatter>(feature.raw, { issue: issue.number });
          // eslint-disable-next-line no-await-in-loop
          await writeFile(feature.filepath, updated);

          ctx.spinner.message(`Adding #${issue.number} to project...`);

          const optionId = resolveOptionId(mappedStatus, statusField.options);
          // eslint-disable-next-line no-await-in-loop
          const [addError] = await github.projects.items.add({
            owner,
            number,
            projectId,
            issueUrl: issue.url,
            statusFieldId: statusField.id,
            statusOptionId: optionId,
            productAreaFieldId: getFieldId(productAreaField),
            productAreaOptionIds,
          });

          if (addError) {
            ctx.spinner.stop();
            ctx.logger.error(`Failed to add issue to project: ${addError.message}`);
            continue;
          }

          const statusLabel = formatStatusLabel(feature.frontmatter.status);
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
 * Builds the issue body from the markdown content (without frontmatter).
 *
 * Includes the H1 title and the first N `##` sections.
 *
 * @private
 */
export function buildIssueBody(content: string): { title: string; body: string } | null {
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
 * Resolves a local frontmatter status to a GitHub status via the mapping.
 *
 * @private
 */
function resolveLocalStatus(
  status: string | undefined,
  statusMapping: Record<string, string>,
): string | undefined {
  if (status === undefined) {
    return undefined;
  }
  return statusMapping[status];
}

/**
 * Resolves a GitHub status string through a reverse mapping.
 *
 * @private
 */
function resolveReverseStatus(
  githubStatus: string | null,
  reverseMapping: Map<string, string>,
): string | undefined {
  if (githubStatus === null) {
    return undefined;
  }
  return reverseMapping.get(githubStatus);
}

/**
 * Extracts the status from a project item, or undefined if absent.
 *
 * @private
 */
function extractItemStatus(item: { status?: string } | undefined): string | undefined {
  if (item === undefined) {
    return undefined;
  }
  return item.status;
}

/**
 * Extracts the product area array from a project item, or empty array if absent.
 *
 * @private
 */
function extractItemProductArea(
  item: { productArea?: readonly string[] } | undefined,
): readonly string[] {
  if (item === undefined) {
    return [];
  }
  return item.productArea ?? [];
}

/**
 * Builds the feature changes object for tracking what needs to be updated.
 *
 * @private
 */
function buildFeatureChanges(params: {
  readonly bodyChanged: boolean;
  readonly statusChanged: boolean;
  readonly productAreaChanged: boolean;
  readonly issueBody: string;
  readonly githubStatus: string | undefined;
  readonly githubProductArea: readonly string[];
}): FeatureChanges {
  return {
    bodyChanged: params.bodyChanged,
    statusChanged: params.statusChanged,
    productAreaChanged: params.productAreaChanged,
    oldBody: conditionalValue(params.bodyChanged, params.issueBody),
    oldStatus: conditionalValue(params.statusChanged, params.githubStatus),
    oldProductArea: conditionalValue(params.productAreaChanged, params.githubProductArea),
  };
}

/**
 * Formats a status string as a bracketed label for display.
 *
 * @private
 */
function formatStatusLabel(status: string | undefined): string {
  if (status === undefined) {
    return "";
  }
  return ` [${status}]`;
}

/**
 * Formats a product area array as a parenthesized label for display.
 *
 * @private
 */
function formatProductAreaLabel(productArea: string[] | undefined): string {
  if (productArea === undefined || productArea.length === 0) {
    return "";
  }
  return ` (${productArea.join(", ")})`;
}

/**
 * Builds the ProductAreaField from raw field data, or returns undefined.
 *
 * @private
 */
function buildProductAreaField(
  fieldData:
    | { id: string; type: string; options?: ReadonlyArray<{ name: string; id: string }> }
    | undefined,
): ProductAreaField | undefined {
  if (fieldData === undefined || fieldData.options === undefined) {
    return undefined;
  }
  return {
    id: fieldData.id,
    type: fieldData.type,
    options: new Map(fieldData.options.map((o) => [o.name, o.id])),
  };
}

/**
 * Extracts the ID from an optional field object.
 *
 * @private
 */
function getFieldId(field: { id: string } | undefined): string | undefined {
  if (field === undefined) {
    return undefined;
  }
  return field.id;
}

/**
 * Resolves an option ID from a mapped status string.
 *
 * @private
 */
function resolveOptionId(
  mappedStatus: string | undefined,
  options: Map<string, string>,
): string | undefined {
  if (mappedStatus === undefined) {
    return undefined;
  }
  return options.get(mappedStatus);
}

/**
 * Resolves product area option IDs from frontmatter product area names.
 *
 * @private
 */
function resolveProductAreaOptionIds(
  productAreaField: ProductAreaField | undefined,
  productArea: string[] | undefined,
): string[] | undefined {
  if (productAreaField === undefined || productArea === undefined) {
    return undefined;
  }
  return productArea
    .map((area) => productAreaField.options.get(area))
    .filter((id): id is string => id !== undefined);
}

/**
 * Builds the GraphQL mutation query for updating a product area field.
 *
 * @private
 */
function buildProductAreaMutation(fieldType: string): string {
  if (fieldType === "ProjectV2SingleSelectField") {
    return `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }) {
          projectV2Item { id }
        }
      }
    `;
  }
  return `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: { iterationId: $optionId }
      }) {
        projectV2Item { id }
      }
    }
  `;
}

/**
 * Returns the value when the condition is true, undefined otherwise.
 *
 * @private
 */
function conditionalValue<T>(condition: boolean, value: T): T | undefined {
  if (condition) {
    return value;
  }
  return undefined;
}
