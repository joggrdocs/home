import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { lauf, z } from "laufen";

import { createBackup } from "./lib/backup.js";
import { FEATURES_DIR, readProjectConfig } from "./lib/config.js";
import { displayDiff, type DiffChange } from "./lib/diff.js";
import { displayDryRunWarning } from "./lib/dry-run-warning.js";
import { extractErrorMessage } from "./lib/errors.js";
import { extractTitle, parseFrontmatter } from "./lib/frontmatter.js";
import type { ProjectItem } from "./lib/github-client.js";
import { createGitHubClient } from "./lib/github-client.js";
import { reverseStatusMapping } from "./lib/status.js";

const README_PATH = "README.md";
const TARGET_START = "<!-- target:roadmap-table:start -->";
const TARGET_END = "<!-- target:roadmap-table:end -->";

interface FeatureFrontmatter {
  readonly status?: string;
  readonly issue?: number;
  readonly discussion?: number;
}

interface FeatureFile {
  readonly title: string;
  readonly issueNumber: number;
  readonly filename: string;
}

export interface Assignee {
  readonly login: string;
  readonly avatarUrl: string;
  readonly profileUrl: string;
}

export interface RoadmapItem {
  readonly title: string;
  readonly status: string;
  readonly issueNumber: number;
  readonly projectItemId: string;
  readonly assignees: readonly Assignee[];
}

export interface StatusBadge {
  readonly label: string;
  readonly color: string;
}

// ---------------------------------------------------------------------------
// Script
// ---------------------------------------------------------------------------

export default lauf({
  description: "Updates README.md roadmap table from GitHub Projects",
  args: {
    verbose: z.boolean().default(false).describe("Enable verbose logging"),
    "dry-run": z.boolean().default(false).describe("Preview changes without writing"),
    yes: z.boolean().default(false).describe("Skip confirmation prompt"),
    y: z.boolean().default(false).describe("Skip confirmation prompt (alias)"),
  },
  async run(ctx) {
    if (ctx.args["dry-run"]) {
      displayDryRunWarning();
    }

    // Step 1: Read project config
    ctx.spinner.start("Reading project config...");
    const [configError, config] = await readProjectConfig(ctx.root);
    if (configError) {
      ctx.spinner.stop();
      ctx.logger.error(`Failed to read config: ${configError.message}`);
      return 1;
    }
    ctx.spinner.stop(`Read config for project #${config.project.number}`);

    // Step 2: Read feature files
    ctx.spinner.start("Reading feature files...");
    const featuresPath = join(ctx.root, FEATURES_DIR);
    const [featuresError, features] = await readFeatureFiles(featuresPath);
    if (featuresError) {
      ctx.spinner.stop();
      ctx.logger.error(`Failed to read features: ${featuresError.message}`);
      return 1;
    }
    ctx.spinner.stop(`Read ${features.length} feature file(s)`);

    if (features.length === 0) {
      ctx.logger.warn("No feature files found");
      return 0;
    }

    // Step 3: Initialize GitHub client
    ctx.spinner.start("Initializing GitHub client...");
    const [clientError, github] = await createGitHubClient({ packageDir: ctx.packageDir });
    if (clientError) {
      ctx.spinner.stop();
      ctx.logger.error(`Failed to create GitHub client: ${clientError.message}`);
      return 1;
    }
    ctx.spinner.stop("GitHub client ready");

    // Step 4: Fetch project views
    ctx.spinner.start("Fetching project views...");
    const [viewsError, views] = await github.projects.views.list({
      owner: config.project.owner,
      number: config.project.number,
    });
    if (viewsError) {
      ctx.spinner.stop();
      ctx.logger.error(`Failed to fetch project views: ${viewsError.message}`);
      return 1;
    }
    if (views.length === 0) {
      ctx.spinner.stop();
      ctx.logger.error("No project views found");
      return 1;
    }
    const firstView = views[0];
    ctx.spinner.stop(`Found ${views.length} view(s), using "${firstView.name}"`);

    // Step 5: Fetch project items with live status
    ctx.spinner.start("Fetching live status from GitHub Projects...");
    const [itemsError, projectItems] = await github.projects.items.list({
      owner: config.project.owner,
      number: config.project.number,
    });
    if (itemsError) {
      ctx.spinner.stop();
      ctx.logger.error(`Failed to fetch project items: ${itemsError.message}`);
      return 1;
    }
    ctx.spinner.stop(`Fetched ${projectItems.length} project item(s)`);

    // Step 6: Match features with live status
    ctx.spinner.start("Matching features with live status...");
    const [matchError, roadmapItems] = await matchFeaturesWithStatus({
      features,
      projectItems,
      statusMapping: config.statusMapping,
      github,
      verbose: ctx.args.verbose,
      logger: ctx.logger,
    });
    if (matchError) {
      ctx.spinner.stop();
      ctx.logger.error(`Failed to match features: ${matchError.message}`);
      return 1;
    }
    ctx.spinner.stop(`Matched ${roadmapItems.length} roadmap item(s)`);

    if (roadmapItems.length === 0) {
      ctx.logger.warn("No roadmap items to display");
      return 0;
    }

    // Step 7: Build markdown table
    const table = buildMarkdownTable(
      roadmapItems,
      config.project.owner,
      config.project.repo,
      config.project.number,
      "3",
    );

    if (ctx.args.verbose) {
      ctx.logger.newlines();
      ctx.logger.info("Generated table:");
      ctx.logger.message(table);
      ctx.logger.newlines();
    }

    // Step 8: Update README
    ctx.spinner.start("Reading README.md...");
    const readmePath = join(ctx.root, README_PATH);
    const [readError, readme] = await readReadme(readmePath);
    if (readError) {
      ctx.spinner.stop();
      ctx.logger.error(`Failed to read README: ${readError.message}`);
      return 1;
    }
    ctx.spinner.stop("README.md loaded");

    const [replaceError, updatedReadme] = replaceTableContent(readme, table);
    if (replaceError) {
      ctx.logger.error(`Failed to replace table: ${replaceError.message}`);
      return 1;
    }

    if (readme.trim() === updatedReadme.trim()) {
      ctx.logger.success("README.md is already up to date");
      return 0;
    }

    // Display diff of changes
    const changes = buildDiffChanges(roadmapItems);
    displayDiff(ctx.logger, changes, `Roadmap table update (${roadmapItems.length} item(s))`);

    if (ctx.args["dry-run"]) {
      return 0;
    }

    const skipConfirmation = ctx.args.yes || ctx.args.y;

    if (!skipConfirmation) {
      const [confirmErr, confirmed] = await ctx.prompts.confirm({
        message: `Update README.md with ${roadmapItems.length} item(s)?`,
        initialValue: true,
      });

      if ((confirmErr !== null && confirmErr.cancelled) || !confirmed) {
        ctx.logger.warn("Cancelled by user");
        return 1;
      }
    }

    ctx.spinner.start("Creating backup...");
    const backup = createBackup({
      root: ctx.root,
      namespace: {
        owner: config.project.owner,
        project: config.project.number,
      },
    });
    const [backupError, backupPath] = await backup.local.file({
      sourcePath: join(ctx.root, README_PATH),
      backupName: "README",
    });
    if (backupError) {
      ctx.spinner.stop();
      ctx.logger.error(`Failed to create backup: ${backupError.message}`);
      return 1;
    }
    ctx.spinner.stop(`Backup created at ${backupPath}`);

    ctx.spinner.start("Writing README.md...");
    const [writeError] = await writeReadme(readmePath, updatedReadme);
    if (writeError) {
      ctx.spinner.stop();
      ctx.logger.error(`Failed to write README: ${writeError.message}`);
      return 1;
    }
    ctx.spinner.stop("README.md updated");

    ctx.logger.success(`Updated roadmap table with ${roadmapItems.length} item(s)`);
    return 0;
  },
});

// ---------------------------------------------------------------------------
// Private
// ---------------------------------------------------------------------------

/**
 * Reads and parses all feature files from the features directory.
 *
 * @private
 */
async function readFeatureFiles(
  featuresPath: string,
): Promise<[Error, null] | [null, readonly FeatureFile[]]> {
  try {
    const files = await readdir(featuresPath);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    const features = (
      await Promise.all(
        mdFiles.map(async (filename) => {
          const filepath = join(featuresPath, filename);
          const raw = await readFile(filepath, "utf-8");
          const parsed = parseFrontmatter<FeatureFrontmatter>(raw);
          if (!parsed) {
            return null;
          }
          const { frontmatter, content } = parsed;
          if (!frontmatter.issue) {
            return null;
          }
          const title = extractTitle(content);
          if (!title) {
            return null;
          }
          return { title, issueNumber: frontmatter.issue, filename };
        }),
      )
    ).filter((f): f is FeatureFile => f !== null);

    return [null, features];
  } catch (error) {
    return [new Error(`Failed to read feature files: ${extractErrorMessage(error)}`), null];
  }
}

/**
 * Matches feature files with live status from GitHub Projects.
 *
 * @private
 */
async function matchFeaturesWithStatus(params: {
  readonly features: readonly FeatureFile[];
  readonly projectItems: readonly ProjectItem[];
  readonly statusMapping: Record<string, string>;
  readonly github: Awaited<ReturnType<typeof createGitHubClient>>[1];
  readonly verbose: boolean;
  readonly logger: { info: (msg: string) => void };
}): Promise<[Error, null] | [null, readonly RoadmapItem[]]> {
  const { features, projectItems, statusMapping, github, verbose, logger } = params;

  if (!github) {
    return [new Error("GitHub client not initialized"), null];
  }

  const reverseMapping = reverseStatusMapping(statusMapping);
  const itemsByIssue = new Map(
    projectItems
      .filter((item) => item.content.number !== undefined)
      .map((item) => [item.content.number as number, item]),
  );

  const roadmapItems: RoadmapItem[] = [];

  // Sequential loop — each iteration makes a GitHub API call and order matters.
  for (const feature of features) {
    const projectItem = itemsByIssue.get(feature.issueNumber);
    if (!projectItem) {
      if (verbose) {
        logger.info(`Skipping ${feature.filename}: issue #${feature.issueNumber} not in project`);
      }
      continue;
    }

    const githubStatus = projectItem.status ?? null;

    if (githubStatus === null) {
      if (verbose) {
        logger.info(`Skipping ${feature.filename}: no status in project`);
      }
      continue;
    }

    const localStatus = reverseMapping.get(githubStatus);

    if (!localStatus) {
      if (verbose) {
        logger.info(`Skipping ${feature.filename}: no status mapping for "${githubStatus}"`);
      }
      continue;
    }

    if (localStatus !== "In progress") {
      if (verbose) {
        logger.info(`Skipping ${feature.filename}: status is "${localStatus}", not "In progress"`);
      }
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const [issueError, issue] = await github.issues.get(feature.issueNumber);
    if (issueError) {
      if (verbose) {
        logger.info(
          `Skipping ${feature.filename}: failed to fetch issue #${feature.issueNumber} (${issueError.message})`,
        );
      }
      continue;
    }

    roadmapItems.push({
      title: feature.title,
      status: localStatus,
      issueNumber: feature.issueNumber,
      projectItemId: projectItem.id,
      assignees: issue.assignees,
    });
  }

  return [null, roadmapItems];
}

/**
 * Builds markdown table from roadmap items.
 *
 * @private
 */
export function buildMarkdownTable(
  items: readonly RoadmapItem[],
  owner: string,
  repo: string,
  projectNumber: number,
  viewId: string,
): string {
  const header = ["| Feature | Status | Assignee |", "| ------- | ------ | -------- |"];

  const rows = items.map((item) => formatTableRow(item, owner, repo, projectNumber, viewId));

  return [...header, ...rows].join("\n");
}

/**
 * Formats a single roadmap item as a markdown table row.
 *
 * @private
 */
export function formatTableRow(
  item: RoadmapItem,
  owner: string,
  repo: string,
  projectNumber: number,
  viewId: string,
): string {
  const badge = getStatusBadge(item.status);
  const projectUrl = `https://github.com/orgs/${owner}/projects/${projectNumber}/views/${viewId}?pane=issue&itemId=${item.projectItemId}&issue=${owner}%7C${repo}%7C${item.issueNumber}`;
  const featureLink = `[${item.title}](${projectUrl})`;
  const statusBadge = `![${badge.label}](https://img.shields.io/badge/${encodeURIComponent(badge.label)}-${badge.color}?style=flat-square)`;
  const assigneeCell = formatAssignee(item.assignees);

  return `| ${featureLink} | ${statusBadge} | ${assigneeCell} |`;
}

/**
 * Formats assignee as a GitHub shield badge.
 *
 * Returns empty string if there are zero or multiple assignees.
 * Returns a shield badge for exactly one assignee.
 *
 * @private
 */
export function formatAssignee(assignees: readonly Assignee[]): string {
  if (assignees.length !== 1) {
    return "";
  }

  const assignee = assignees[0];
  const username = `@${assignee.login}`;
  const encodedUsername = encodeURIComponent(username);

  return `[![${username}](https://img.shields.io/badge/${encodedUsername}-black?style=flat-square&logo=github)](${assignee.profileUrl})`;
}

/**
 * Maps status to badge configuration.
 *
 * @private
 */
export function getStatusBadge(status: string): StatusBadge {
  const badges: Record<string, StatusBadge> = {
    Idea: { label: "Idea", color: "8a04ed" },
    Upcoming: { label: "Upcoming", color: "0C1565" },
    Planned: { label: "Planned", color: "0C1565" },
    "In progress": { label: "In Progress", color: "e85d04" },
    Released: { label: "Released", color: "00a67e" },
  };

  const badge = badges[status];
  if (!badge) {
    return { label: status, color: "5a347b" };
  }

  return badge;
}

/**
 * Reads README.md content.
 *
 * @private
 */
async function readReadme(path: string): Promise<[Error, null] | [null, string]> {
  try {
    const content = await readFile(path, "utf-8");
    return [null, content];
  } catch (error) {
    return [new Error(extractErrorMessage(error)), null];
  }
}

/**
 * Writes README.md content.
 *
 * @private
 */
async function writeReadme(path: string, content: string): Promise<[Error, null] | [null, void]> {
  try {
    await writeFile(path, content);
    return [null, undefined];
  } catch (error) {
    return [new Error(extractErrorMessage(error)), null];
  }
}

/**
 * Replaces content between target markers in README.
 *
 * @private
 */
export function replaceTableContent(readme: string, table: string): [Error, null] | [null, string] {
  const startIdx = readme.indexOf(TARGET_START);
  const endIdx = readme.indexOf(TARGET_END);

  if (startIdx === -1) {
    return [new Error(`Missing ${TARGET_START} marker in README`), null];
  }

  if (endIdx === -1) {
    return [new Error(`Missing ${TARGET_END} marker in README`), null];
  }

  if (startIdx >= endIdx) {
    return [new Error("Start marker appears after end marker"), null];
  }

  const before = readme.slice(0, startIdx + TARGET_START.length);
  const after = readme.slice(endIdx);

  return [null, `${before}\n${table}\n${after}`];
}

/**
 * Builds diff changes from roadmap items for display.
 *
 * @private
 */
export function buildDiffChanges(items: readonly RoadmapItem[]): readonly DiffChange[] {
  return items.map((item) => {
    const assigneesText = formatAssigneesText(item.assignees);
    return { type: "modify" as const, label: item.title, detail: `${item.status}${assigneesText}` };
  });
}

/**
 * Formats assignee logins into a parenthesized display string.
 *
 * @private
 */
function formatAssigneesText(assignees: readonly Assignee[]): string {
  if (assignees.length === 0) {
    return "";
  }
  return ` (${assignees.map((a) => `@${a.login}`).join(", ")})`;
}
