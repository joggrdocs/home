import { spawn } from "node:child_process";

import { loadQueries } from "./query-loader.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result type for operations that can fail.
 */
export type Result<T, E = GitHubError> = readonly [E, null] | readonly [null, T];

/**
 * GitHub API error.
 */
export interface GitHubError {
  readonly type: "api_error" | "parse_error" | "not_found";
  readonly message: string;
  readonly code?: number;
}

/**
 * GitHub issue assignee.
 */
export interface Assignee {
  readonly login: string;
  readonly avatarUrl: string;
  readonly profileUrl: string;
}

/**
 * GitHub issue data.
 */
export interface Issue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly assignees: readonly Assignee[];
}

/**
 * GitHub project metadata.
 */
export interface Project {
  readonly id: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly public: boolean;
  readonly readme: string;
}

/**
 * GitHub project field.
 */
export interface ProjectField {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly options?: ReadonlyArray<{ id: string; name: string }>;
}

/**
 * GitHub project item.
 */
export interface ProjectItem {
  readonly id: string;
  readonly content: {
    readonly number?: number;
    readonly title?: string;
  };
  readonly status?: string;
  readonly productArea?: readonly string[];
}

/**
 * GitHub project view.
 */
export interface ProjectView {
  readonly id: string;
  readonly name: string;
  readonly layout: string;
  readonly filter: string | null;
  readonly groupByFields: ReadonlyArray<{ name: string }>;
  readonly sortByFields: ReadonlyArray<{
    field: { name: string };
    direction: string;
  }>;
  readonly visibleFields: ReadonlyArray<{ name: string }>;
}

/**
 * Parameters for creating an issue.
 */
export interface CreateIssueParams {
  readonly title: string;
  readonly body: string;
}

/**
 * Parameters for updating an issue.
 */
export interface UpdateIssueParams {
  readonly issueNumber: number;
  readonly body: string;
}

/**
 * Parameters for searching issues.
 */
export interface SearchIssuesParams {
  readonly title: string;
}

/**
 * Parameters for fetching project metadata.
 */
export interface GetProjectParams {
  readonly owner: string;
  readonly number: number;
}

/**
 * Parameters for listing project fields.
 */
export interface ListProjectFieldsParams {
  readonly owner: string;
  readonly number: number;
}

/**
 * Parameters for creating a project field.
 */
export interface CreateProjectFieldParams {
  readonly owner: string;
  readonly number: number;
  readonly name: string;
  readonly dataType: string;
  readonly singleSelectOptions?: ReadonlyArray<{
    readonly name: string;
    readonly description?: string;
    readonly color?: string;
  }>;
  readonly multiSelectOptions?: ReadonlyArray<{
    readonly name: string;
    readonly description?: string;
    readonly color?: string;
  }>;
}

/**
 * Parameters for deleting a project field.
 */
export interface DeleteProjectFieldParams {
  readonly fieldId: string;
}

/**
 * Parameters for updating project field options.
 */
export interface UpdateProjectFieldOptionsParams {
  readonly fieldId: string;
  readonly options: ReadonlyArray<{
    readonly name: string;
    readonly description?: string;
    readonly color?: string;
  }>;
}

/**
 * Parameters for listing project items.
 */
export interface ListProjectItemsParams {
  readonly owner: string;
  readonly number: number;
  readonly limit?: number;
}

/**
 * Parameters for adding an item to a project.
 */
export interface AddProjectItemParams {
  readonly owner: string;
  readonly number: number;
  readonly projectId: string;
  readonly issueUrl: string;
  readonly statusFieldId?: string;
  readonly statusOptionId?: string;
  readonly productAreaFieldId?: string;
  readonly productAreaOptionIds?: readonly string[];
}

/**
 * Parameters for listing project views.
 */
export interface ListProjectViewsParams {
  readonly owner: string;
  readonly number: number;
}

/**
 * Parameters for a GraphQL mutation.
 */
export interface GraphQLMutationParams {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

/**
 * GitHub client interface.
 */
export interface GitHubClient {
  readonly issues: {
    readonly get: (issueNumber: number) => Promise<Result<Issue>>;
    readonly create: (params: CreateIssueParams) => Promise<Result<Issue>>;
    readonly update: (params: UpdateIssueParams) => Promise<Result<void>>;
    readonly search: (params: SearchIssuesParams) => Promise<Result<Issue | null>>;
  };
  readonly projects: {
    readonly get: (params: GetProjectParams) => Promise<Result<Project>>;
    readonly fields: {
      readonly list: (params: ListProjectFieldsParams) => Promise<Result<ProjectField[]>>;
      readonly create: (params: CreateProjectFieldParams) => Promise<Result<void>>;
      readonly delete: (params: DeleteProjectFieldParams) => Promise<Result<void>>;
      readonly updateOptions: (params: UpdateProjectFieldOptionsParams) => Promise<Result<void>>;
    };
    readonly items: {
      readonly list: (params: ListProjectItemsParams) => Promise<Result<ProjectItem[]>>;
      readonly add: (params: AddProjectItemParams) => Promise<Result<string>>;
    };
    readonly views: {
      readonly list: (params: ListProjectViewsParams) => Promise<Result<ProjectView[]>>;
    };
  };
  readonly graphql: (params: GraphQLMutationParams) => Promise<Result<string>>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Context with package directory for loading queries.
 */
export interface GitHubClientContext {
  readonly packageDir: string;
}

/**
 * Creates a GitHub client for interacting with the GitHub API via gh CLI.
 *
 * @param ctx - Context with packageDir to locate query files
 * @returns GitHub client with namespaced methods for issues and projects, or an error if query loading fails.
 */
export async function createGitHubClient(ctx: GitHubClientContext): Promise<Result<GitHubClient>> {
  const [queryError, queries] = await loadQueries(ctx);
  if (queryError) {
    return [
      { type: "api_error", message: `Failed to load GraphQL queries: ${queryError.message}` },
      null,
    ];
  }

  const client: GitHubClient = {
    issues: {
      /**
       * Fetches an issue by number.
       */
      get: async (issueNumber) => {
        const [execError, stdout] = await gh([
          "issue",
          "view",
          String(issueNumber),
          "--json",
          "number,title,body,url,assignees",
        ]);

        if (execError) {
          return [execError, null];
        }

        try {
          const data = JSON.parse(stdout) as {
            number: number;
            title: string;
            body: string;
            url: string;
            assignees: Array<{ login: string }>;
          };
          const assignees = data.assignees.map((a) => ({
            login: a.login,
            avatarUrl: `https://github.com/${a.login}.png?size=48`,
            profileUrl: `https://github.com/${a.login}`,
          }));
          return [
            null,
            {
              number: data.number,
              title: data.title,
              body: data.body ?? "",
              url: data.url,
              assignees,
            },
          ];
        } catch {
          return [{ type: "parse_error", message: "Failed to parse issue JSON" }, null];
        }
      },

      /**
       * Creates a new GitHub issue.
       */
      create: async ({ title, body }) => {
        const [execError, stdout] = await gh(
          ["issue", "create", "--title", title, "--body-file", "-"],
          body,
        );

        if (execError) {
          return [execError, null];
        }

        const issueUrl = stdout;
        const match = issueUrl.match(/\/issues\/(\d+)$/);
        if (!match) {
          return [
            { type: "parse_error", message: `Could not parse issue number from: ${issueUrl}` },
            null,
          ];
        }

        return [null, { number: parseInt(match[1], 10), title, body, url: issueUrl }];
      },

      /**
       * Updates an existing GitHub issue body.
       */
      update: async ({ issueNumber, body }) => {
        const [execError] = await gh(
          ["issue", "edit", String(issueNumber), "--body-file", "-"],
          body,
        );

        if (execError) {
          return [execError, null];
        }

        return [null, undefined];
      },

      /**
       * Searches for an issue with an exact title match.
       */
      search: async ({ title }) => {
        const [execError, stdout] = await gh([
          "issue",
          "list",
          "--search",
          `"${title}" in:title`,
          "--state",
          "all",
          "--json",
          "number,title,url",
          "--limit",
          "100",
        ]);

        if (execError) {
          return [execError, null];
        }

        try {
          const issues = JSON.parse(stdout) as Array<{
            number: number;
            title: string;
            url: string;
          }>;
          const exact = issues.find((i) => i.title === title);

          if (!exact) {
            return [null, null];
          }

          return [null, { number: exact.number, title: exact.title, body: "", url: exact.url }];
        } catch {
          return [{ type: "parse_error", message: "Failed to parse issues JSON" }, null];
        }
      },
    },

    projects: {
      /**
       * Fetches project metadata by owner and number.
       */
      get: async ({ owner, number }) => {
        const [execError, stdout] = await gh([
          "api",
          "graphql",
          "-f",
          `query=${queries.getProject}`,
          "-F",
          `owner=${owner}`,
          "-F",
          `number=${number}`,
        ]);

        if (execError) {
          return [execError, null];
        }

        try {
          const data = JSON.parse(stdout) as {
            data: { organization: { projectV2: Project } };
          };
          const project = data.data.organization.projectV2;

          return [
            null,
            {
              id: project.id,
              title: project.title,
              shortDescription: project.shortDescription ?? "",
              public: project.public,
              readme: project.readme ?? "",
            },
          ];
        } catch {
          return [{ type: "parse_error", message: "Failed to parse project JSON" }, null];
        }
      },

      fields: {
        /**
         * Lists all fields in a project.
         */
        list: async ({ owner, number }) => {
          const [execError, stdout] = await gh([
            "project",
            "field-list",
            String(number),
            "--owner",
            owner,
            "--format",
            "json",
          ]);

          if (execError) {
            return [execError, null];
          }

          try {
            const data = JSON.parse(stdout) as { fields: ProjectField[] };
            return [null, data.fields];
          } catch {
            return [{ type: "parse_error", message: "Failed to parse fields JSON" }, null];
          }
        },

        /**
         * Creates a new field in a project.
         */
        create: async ({
          owner,
          number,
          name,
          dataType,
          singleSelectOptions,
          multiSelectOptions,
        }) => {
          const args = [
            "project",
            "field-create",
            String(number),
            "--owner",
            owner,
            "--name",
            name,
            "--data-type",
            dataType,
          ];

          if (dataType === "SINGLE_SELECT" && singleSelectOptions) {
            const optionsJson = JSON.stringify(
              singleSelectOptions.map((o) => ({
                name: o.name,
                description: o.description ?? "",
                color: o.color ?? "GRAY",
              })),
            );
            args.push("--single-select-options", optionsJson);
          }

          if (dataType === "MULTI_SELECT" && multiSelectOptions) {
            const optionsJson = JSON.stringify(
              multiSelectOptions.map((o) => ({
                name: o.name,
                description: o.description ?? "",
                color: o.color ?? "GRAY",
              })),
            );
            args.push("--single-select-options", optionsJson);
          }

          const [execError] = await gh(args);

          if (execError) {
            return [execError, null];
          }

          return [null, undefined];
        },

        /**
         * Deletes a field from a project.
         */
        delete: async ({ fieldId }) => {
          const [execError] = await gh(["project", "field-delete", "--id", fieldId]);

          if (execError) {
            return [execError, null];
          }

          return [null, undefined];
        },

        /**
         * Updates field options for a single-select field.
         */
        updateOptions: async ({ fieldId, options }) => {
          const mutation = {
            query: queries.updateFieldOptions,
            variables: {
              fieldId,
              options: options.map((o) => ({
                name: o.name,
                description: o.description ?? "",
                color: o.color ?? "GRAY",
              })),
            },
          };

          const [execError] = await gh(
            ["api", "graphql", "--input", "-"],
            JSON.stringify(mutation),
          );

          if (execError) {
            return [execError, null];
          }

          return [null, undefined];
        },
      },

      items: {
        /**
         * Lists all items in a project with field values.
         */
        list: async ({ owner, number }) => {
          const [execError, stdout] = await gh([
            "api",
            "graphql",
            "-f",
            `query=${queries.listProjectItems}`,
            "-F",
            `owner=${owner}`,
            "-F",
            `number=${number}`,
          ]);

          if (execError) {
            return [execError, null];
          }

          try {
            const data = JSON.parse(stdout) as {
              data: {
                organization: {
                  projectV2: {
                    items: {
                      nodes: Array<{
                        id: string;
                        content: { number?: number; title?: string };
                        fieldValues: {
                          nodes: Array<{
                            field?: { name?: string };
                            name?: string;
                          }>;
                        };
                      }>;
                    };
                  };
                };
              };
            };

            const items = data.data.organization.projectV2.items.nodes.map((item) => {
              const statusField = item.fieldValues.nodes.find(
                (fv) => fv.field?.name === "Status" && fv.name,
              );
              const status = statusField?.name ?? undefined;

              return {
                id: item.id,
                content: {
                  number: item.content.number,
                  title: item.content.title,
                },
                status,
                productArea: undefined,
              };
            });

            return [null, items];
          } catch {
            return [{ type: "parse_error", message: "Failed to parse project items JSON" }, null];
          }
        },

        /**
         * Adds an item to a project with optional status and product area.
         */
        add: async ({
          owner,
          number,
          projectId,
          issueUrl,
          statusFieldId,
          statusOptionId,
          productAreaFieldId,
          productAreaOptionIds,
        }) => {
          const [addError, addStdout] = await gh([
            "project",
            "item-add",
            String(number),
            "--owner",
            owner,
            "--url",
            issueUrl,
            "--format",
            "json",
          ]);

          if (addError) {
            return [addError, null];
          }

          let itemId: string;
          try {
            const data = JSON.parse(addStdout) as { id: string };
            itemId = data.id;
          } catch {
            return [{ type: "parse_error", message: "Failed to parse item ID" }, null];
          }

          if (statusFieldId && statusOptionId) {
            const [editError] = await gh([
              "project",
              "item-edit",
              "--project-id",
              projectId,
              "--id",
              itemId,
              "--field-id",
              statusFieldId,
              "--single-select-option-id",
              statusOptionId,
            ]);

            if (editError) {
              return [editError, null];
            }
          }

          if (productAreaFieldId && productAreaOptionIds && productAreaOptionIds.length > 0) {
            const optionIdsJson = JSON.stringify(productAreaOptionIds);
            const [editError] = await gh([
              "project",
              "item-edit",
              "--project-id",
              projectId,
              "--id",
              itemId,
              "--field-id",
              productAreaFieldId,
              "--option-id",
              optionIdsJson,
            ]);

            if (editError) {
              return [editError, null];
            }
          }

          return [null, itemId];
        },
      },

      views: {
        /**
         * Lists all views in a project.
         */
        list: async ({ owner, number }) => {
          const [execError, stdout] = await gh([
            "api",
            "graphql",
            "-f",
            `query=${queries.listProjectViews}`,
            "-F",
            `owner=${owner}`,
            "-F",
            `number=${number}`,
          ]);

          if (execError) {
            return [execError, null];
          }

          try {
            const data = JSON.parse(stdout) as {
              data: {
                organization: {
                  projectV2: {
                    views: {
                      nodes: Array<{
                        id: string;
                        name: string;
                        layout: string;
                        filter: string | null;
                        groupByFields: { nodes: Array<{ name: string }> };
                        sortByFields: {
                          nodes: Array<{ field: { name: string }; direction: string }>;
                        };
                        visibleFields: { nodes: Array<{ name: string }> };
                      }>;
                    };
                  };
                };
              };
            };

            const views = data.data.organization.projectV2.views.nodes.map((v) => ({
              id: v.id,
              name: v.name,
              layout: v.layout,
              filter: v.filter ?? null,
              groupByFields: v.groupByFields.nodes,
              sortByFields: v.sortByFields.nodes,
              visibleFields: v.visibleFields.nodes,
            }));

            return [null, views];
          } catch {
            return [{ type: "parse_error", message: "Failed to parse views JSON" }, null];
          }
        },
      },
    },

    /**
     * Executes a raw GraphQL mutation.
     */
    graphql: async ({ query, variables }) => {
      const body = variables ? { query, variables } : { query };
      const [execError, stdout] = await gh(
        ["api", "graphql", "--input", "-"],
        JSON.stringify(body),
      );

      if (execError) {
        return [execError, null];
      }

      return [null, stdout];
    },
  };

  return [null, client];
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Execute gh CLI command with optional stdin input.
 *
 * @private
 */
async function gh(args: string[], stdin?: string): Promise<Result<string>> {
  return new Promise((resolve) => {
    const proc = spawn("gh", args, { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        resolve([
          { type: "api_error", message: stderr.trim() || `gh exited with code ${code}`, code },
          null,
        ]);
      } else {
        resolve([null, stdout.trim()]);
      }
    });

    if (stdin) {
      proc.stdin.write(stdin);
    }
    proc.stdin.end();
  });
}
