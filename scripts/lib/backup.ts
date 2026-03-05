import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { GitHubClient } from "./github-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Backup context with root directory and GitHub project namespace.
 */
export interface BackupContext {
  readonly root: string;
  readonly namespace: BackupNamespace;
}

/**
 * GitHub project namespace for organizing backups.
 */
export interface BackupNamespace {
  readonly owner: string;
  readonly project: number;
}

/**
 * Result type for backup operations.
 */
export type BackupResult<T> = readonly [BackupError, null] | readonly [null, T];

/**
 * Backup operation error.
 */
export interface BackupError {
  readonly type: "fs_error" | "invalid_path" | "github_error";
  readonly message: string;
  readonly path?: string;
}

/**
 * Parameters for backing up a local file before from-github sync.
 */
export interface BackupLocalFileParams {
  readonly sourcePath: string;
  readonly backupName: string;
}

/**
 * Parameters for backing up a local directory before from-github sync.
 */
export interface BackupLocalDirectoryParams {
  readonly sourcePath: string;
  readonly backupName: string;
  readonly fileExtension?: string;
}

/**
 * Parameters for backing up GitHub project description before to-github sync.
 */
export interface BackupGitHubReadmeParams {
  readonly github: GitHubClient;
  readonly owner: string;
  readonly project: number;
}

/**
 * Parameters for backing up GitHub feature issues before to-github sync.
 */
export interface BackupGitHubFeaturesParams {
  readonly github: GitHubClient;
  readonly owner: string;
  readonly project: number;
}

/**
 * Parameters for backing up full GitHub project state before to-github sync.
 */
export interface BackupGitHubProjectParams {
  readonly github: GitHubClient;
  readonly owner: string;
  readonly project: number;
}

/**
 * Backup utility for creating timestamped backups with GitHub project namespacing.
 */
export interface Backup {
  readonly local: {
    readonly file: (params: BackupLocalFileParams) => Promise<BackupResult<string>>;
    readonly directory: (params: BackupLocalDirectoryParams) => Promise<BackupResult<string>>;
  };
  readonly github: {
    readonly readme: (params: BackupGitHubReadmeParams) => Promise<BackupResult<string>>;
    readonly features: (params: BackupGitHubFeaturesParams) => Promise<BackupResult<string>>;
    readonly project: (params: BackupGitHubProjectParams) => Promise<BackupResult<string>>;
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a backup utility with GitHub project namespacing.
 *
 * Backups are organized in `.backups/{owner}_{project}/` directories to prevent
 * mixing backups from different GitHub projects when multiple projects sync to
 * the same local repository.
 *
 * @param ctx - Context with root directory and GitHub project namespace
 * @returns Backup utility with methods for local and GitHub backups
 */
export function createBackup(ctx: BackupContext): Backup {
  const namespaceDir = `${ctx.namespace.owner}_${ctx.namespace.project}`;

  return {
    local: {
      /**
       * Backs up a local file before from-github sync overwrites it.
       */
      file: async (params) => {
        const timestamp = generateTimestamp();
        const backupPath = join(
          ctx.root,
          ".backups",
          namespaceDir,
          `${params.backupName}_${timestamp}`,
        );
        const extension = params.sourcePath.split(".").pop();
        const fullBackupPath = extension ? `${backupPath}.${extension}` : backupPath;

        const [dirError] = await ensureBackupDir(join(ctx.root, ".backups", namespaceDir));
        if (dirError) {
          return [dirError, null];
        }

        try {
          await copyFile(params.sourcePath, fullBackupPath);
          return [null, fullBackupPath];
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return [
            {
              type: "fs_error",
              message: `Failed to backup file: ${message}`,
              path: params.sourcePath,
            },
            null,
          ];
        }
      },

      /**
       * Backs up a local directory before from-github sync overwrites files.
       */
      directory: async (params) => {
        const timestamp = generateTimestamp();
        const backupPath = join(
          ctx.root,
          ".backups",
          namespaceDir,
          `${params.backupName}_${timestamp}`,
        );

        const [dirError] = await ensureBackupDir(backupPath);
        if (dirError) {
          return [dirError, null];
        }

        try {
          const files = await readdir(params.sourcePath);
          const filtered = params.fileExtension
            ? files.filter((f) => f.endsWith(params.fileExtension))
            : files;

          for (const file of filtered) {
            const srcPath = join(params.sourcePath, file);
            const dstPath = join(backupPath, file);
            // eslint-disable-next-line no-await-in-loop
            await copyFile(srcPath, dstPath);
          }

          return [null, backupPath];
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return [
            {
              type: "fs_error",
              message: `Failed to backup directory: ${message}`,
              path: params.sourcePath,
            },
            null,
          ];
        }
      },
    },

    github: {
      /**
       * Backs up GitHub project description before to-github sync overwrites it.
       */
      readme: async (params) => {
        const timestamp = generateTimestamp();
        const backupPath = join(
          ctx.root,
          ".backups",
          namespaceDir,
          `github-readme_${timestamp}.json`,
        );

        const [dirError] = await ensureBackupDir(join(ctx.root, ".backups", namespaceDir));
        if (dirError) {
          return [dirError, null];
        }

        const [projectError, project] = await params.github.projects.get({
          owner: params.owner,
          number: params.project,
        });

        if (projectError) {
          return [
            {
              type: "github_error",
              message: `Failed to fetch GitHub project: ${projectError.message}`,
            },
            null,
          ];
        }

        const backupData = {
          timestamp: new Date().toISOString(),
          owner: params.owner,
          project: params.project,
          readme: project.readme,
          shortDescription: project.shortDescription,
        };

        try {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(backupPath, JSON.stringify(backupData, null, 2));
          return [null, backupPath];
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return [
            {
              type: "fs_error",
              message: `Failed to write backup: ${message}`,
              path: backupPath,
            },
            null,
          ];
        }
      },

      /**
       * Backs up GitHub feature issues before to-github sync overwrites them.
       */
      features: async (params) => {
        const timestamp = generateTimestamp();
        const backupPath = join(
          ctx.root,
          ".backups",
          namespaceDir,
          `github-features_${timestamp}.json`,
        );

        const [dirError] = await ensureBackupDir(join(ctx.root, ".backups", namespaceDir));
        if (dirError) {
          return [dirError, null];
        }

        const [itemsError, items] = await params.github.projects.items.list({
          owner: params.owner,
          number: params.project,
        });

        if (itemsError) {
          return [
            {
              type: "github_error",
              message: `Failed to fetch GitHub project items: ${itemsError.message}`,
            },
            null,
          ];
        }

        const backupData = {
          timestamp: new Date().toISOString(),
          owner: params.owner,
          project: params.project,
          items,
        };

        try {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(backupPath, JSON.stringify(backupData, null, 2));
          return [null, backupPath];
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return [
            {
              type: "fs_error",
              message: `Failed to write backup: ${message}`,
              path: backupPath,
            },
            null,
          ];
        }
      },

      /**
       * Backs up full GitHub project state before to-github sync overwrites it.
       */
      project: async (params) => {
        const timestamp = generateTimestamp();
        const backupPath = join(
          ctx.root,
          ".backups",
          namespaceDir,
          `github-project_${timestamp}.json`,
        );

        const [dirError] = await ensureBackupDir(join(ctx.root, ".backups", namespaceDir));
        if (dirError) {
          return [dirError, null];
        }

        const [
          [metadataError, metadata],
          [fieldsError, fields],
          [viewsError, views],
          [itemsError, items],
        ] = await Promise.all([
          params.github.projects.get({ owner: params.owner, number: params.project }),
          params.github.projects.fields.list({ owner: params.owner, number: params.project }),
          params.github.projects.views.list({ owner: params.owner, number: params.project }),
          params.github.projects.items.list({ owner: params.owner, number: params.project }),
        ]);

        if (metadataError) {
          return [
            {
              type: "github_error",
              message: `Failed to fetch GitHub project metadata: ${metadataError.message}`,
            },
            null,
          ];
        }

        if (fieldsError) {
          return [
            {
              type: "github_error",
              message: `Failed to fetch GitHub project fields: ${fieldsError.message}`,
            },
            null,
          ];
        }

        if (viewsError) {
          return [
            {
              type: "github_error",
              message: `Failed to fetch GitHub project views: ${viewsError.message}`,
            },
            null,
          ];
        }

        if (itemsError) {
          return [
            {
              type: "github_error",
              message: `Failed to fetch GitHub project items: ${itemsError.message}`,
            },
            null,
          ];
        }

        const backupData = {
          timestamp: new Date().toISOString(),
          owner: params.owner,
          project: params.project,
          metadata,
          fields,
          views,
          items,
        };

        try {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(backupPath, JSON.stringify(backupData, null, 2));
          return [null, backupPath];
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return [
            {
              type: "fs_error",
              message: `Failed to write backup: ${message}`,
              path: backupPath,
            },
            null,
          ];
        }
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Private
// ---------------------------------------------------------------------------

/**
 * Generates ISO 8601 timestamp with safe filesystem characters.
 *
 * @returns Timestamp string like "2026-03-05_20-39-45-656Z"
 *
 * @private
 */
function generateTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").split("T").join("_");
}

/**
 * Ensures backup directory exists with recursive creation.
 *
 * @private
 */
async function ensureBackupDir(path: string): Promise<BackupResult<void>> {
  try {
    await mkdir(path, { recursive: true });
    return [null, undefined];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return [
      {
        type: "fs_error",
        message: `Failed to create backup directory: ${message}`,
        path,
      },
      null,
    ];
  }
}
