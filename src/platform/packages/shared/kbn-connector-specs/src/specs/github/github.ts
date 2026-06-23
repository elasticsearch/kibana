/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * GitHub MCP Connector (v2)
 *
 * An MCP-native v2 connector that connects to the GitHub Copilot MCP server.
 *
 * Auth: Bearer token (PAT or OAuth token)
 */

import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';
import { UISchemas, type ConnectorSpec } from '../../connector_spec';
import { withMcpClient, callToolContent, callToolJson } from '../../lib/mcp';
import type {
  CallToolInput,
  GetCommitInput,
  GetFileContentsInput,
  GetIssueCommentsInput,
  GetIssueInput,
  GetLatestReleaseInput,
  ListBranchesInput,
  ListCommitsInput,
  ListIssuesInput,
  ListPullRequestsInput,
  ListReleasesInput,
  ListTagsInput,
  PullRequestReadInput,
  SearchCodeInput,
  SearchIssuesInput,
  SearchPullRequestsInput,
  SearchRepositoriesInput,
  SearchUsersInput,
} from './types';
import {
  GetMeInputSchema,
  ListToolsInputSchema,
  SearchCodeInputSchema,
  SearchRepositoriesInputSchema,
  SearchIssuesInputSchema,
  SearchPullRequestsInputSchema,
  SearchUsersInputSchema,
  ListIssuesInputSchema,
  ListPullRequestsInputSchema,
  ListCommitsInputSchema,
  ListBranchesInputSchema,
  ListReleasesInputSchema,
  ListTagsInputSchema,
  GetCommitInputSchema,
  GetLatestReleaseInputSchema,
  PullRequestReadInputSchema,
  GetFileContentsInputSchema,
  GetIssueInputSchema,
  GetIssueCommentsInputSchema,
  CallToolInputSchema,
} from './types';

const GITHUB_MCP_SERVER_URL = 'https://api.githubcopilot.com/mcp/';

export const GithubConnector: ConnectorSpec = {
  metadata: {
    id: '.github',
    displayName: 'GitHub',
    description: i18n.translate('core.kibanaConnectorSpecs.github.metadata.description', {
      defaultMessage:
        'Search repositories, issues, and pull requests, browse file contents, and list branches in GitHub',
    }),
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['workflows', 'agentBuilder'],
  },

  auth: {
    types: [
      'bearer',
      {
        type: 'oauth_authorization_code',
        defaults: {
          authorizationUrl: 'https://github.com/login/oauth/authorize',
          tokenUrl: 'https://github.com/login/oauth/access_token',
          scope: 'repo',
        },
        overrides: {
          meta: {
            authorizationUrl: { hidden: true },
            tokenUrl: { hidden: true },
            scope: { hidden: true },
          },
        },
      },
    ],
    headers: {
      Accept: 'application/vnd.github+json',
    },
  },

  schema: lazySchema(() =>
    z.object({
      serverUrl: UISchemas.url()
        .default(GITHUB_MCP_SERVER_URL)
        .describe('GitHub MCP Server URL')
        .meta({
          widget: 'text',
          placeholder: 'https://api.githubcopilot.com/mcp/',
          label: i18n.translate('connectorSpecs.github.config.serverUrl.label', {
            defaultMessage: 'MCP Server URL',
          }),
          helpText: i18n.translate('connectorSpecs.github.config.serverUrl.helpText', {
            defaultMessage: 'The URL of the GitHub Copilot MCP server.',
          }),
        }),
    })
  ),

  validateUrls: {
    fields: ['serverUrl'],
  },

  actions: {
    getMe: {
      isTool: true,
      description: 'Get the authenticated GitHub user profile.',
      input: GetMeInputSchema,
      handler: async (ctx) => {
        return callToolJson(ctx, 'get_me');
      },
    },

    searchCode: {
      isTool: true,
      description: 'Search for code across GitHub repositories.',
      input: SearchCodeInputSchema,
      handler: async (ctx, input: SearchCodeInput) => {
        return callToolJson(ctx, 'search_code', {
          query: input.query,
          page: input.page,
          perPage: input.perPage,
        });
      },
    },

    searchRepositories: {
      isTool: true,
      description: 'Search for GitHub repositories.',
      input: SearchRepositoriesInputSchema,
      handler: async (ctx, input: SearchRepositoriesInput) => {
        return callToolJson(ctx, 'search_repositories', {
          query: input.query,
          page: input.page,
          perPage: input.perPage,
        });
      },
    },

    searchIssues: {
      isTool: true,
      description: 'Search for issues across GitHub repositories.',
      input: SearchIssuesInputSchema,
      handler: async (ctx, input: SearchIssuesInput) => {
        return callToolJson(ctx, 'search_issues', {
          query: input.query,
          order: input.order,
          sort: input.sort,
          page: input.page,
          perPage: input.perPage,
        });
      },
    },

    searchPullRequests: {
      isTool: true,
      description: 'Search for pull requests across GitHub repositories.',
      input: SearchPullRequestsInputSchema,
      handler: async (ctx, input: SearchPullRequestsInput) => {
        return callToolJson(ctx, 'search_pull_requests', {
          query: input.query,
          order: input.order,
          sort: input.sort,
          page: input.page,
          perPage: input.perPage,
        });
      },
    },

    searchUsers: {
      isTool: true,
      description: 'Search for GitHub users.',
      input: SearchUsersInputSchema,
      handler: async (ctx, input: SearchUsersInput) => {
        return callToolJson(ctx, 'search_users', {
          query: input.query,
          page: input.page,
          perPage: input.perPage,
        });
      },
    },

    listIssues: {
      isTool: true,
      description: 'List issues in a GitHub repository. Uses cursor-based pagination.',
      input: ListIssuesInputSchema,
      handler: async (ctx, input: ListIssuesInput) => {
        return callToolJson(ctx, 'list_issues', {
          owner: input.owner,
          repo: input.repo,
          state: input.state,
          first: input.first,
          after: input.after,
        });
      },
    },

    listPullRequests: {
      isTool: true,
      description: 'List pull requests in a GitHub repository. Uses cursor-based pagination.',
      input: ListPullRequestsInputSchema,
      handler: async (ctx, input: ListPullRequestsInput) => {
        return callToolJson(ctx, 'list_pull_requests', {
          owner: input.owner,
          repo: input.repo,
          state: input.state,
          first: input.first,
          after: input.after,
        });
      },
    },

    listCommits: {
      isTool: true,
      description: 'List commits in a GitHub repository. Uses cursor-based pagination.',
      input: ListCommitsInputSchema,
      handler: async (ctx, input: ListCommitsInput) => {
        return callToolJson(ctx, 'list_commits', {
          owner: input.owner,
          repo: input.repo,
          sha: input.sha,
          first: input.first,
          after: input.after,
        });
      },
    },

    listBranches: {
      isTool: true,
      description: 'List branches in a GitHub repository. Uses cursor-based pagination.',
      input: ListBranchesInputSchema,
      handler: async (ctx, input: ListBranchesInput) => {
        return callToolJson(ctx, 'list_branches', {
          owner: input.owner,
          repo: input.repo,
          first: input.first,
          after: input.after,
        });
      },
    },

    listReleases: {
      isTool: true,
      description: 'List releases in a GitHub repository. Uses cursor-based pagination.',
      input: ListReleasesInputSchema,
      handler: async (ctx, input: ListReleasesInput) => {
        return callToolJson(ctx, 'list_releases', {
          owner: input.owner,
          repo: input.repo,
          first: input.first,
          after: input.after,
        });
      },
    },

    listTags: {
      isTool: true,
      description: 'List tags in a GitHub repository. Uses cursor-based pagination.',
      input: ListTagsInputSchema,
      handler: async (ctx, input: ListTagsInput) => {
        return callToolJson(ctx, 'list_tags', {
          owner: input.owner,
          repo: input.repo,
          first: input.first,
          after: input.after,
        });
      },
    },

    getCommit: {
      isTool: true,
      description: 'Get details of a specific commit.',
      input: GetCommitInputSchema,
      handler: async (ctx, input: GetCommitInput) => {
        return callToolJson(ctx, 'get_commit', {
          owner: input.owner,
          repo: input.repo,
          sha: input.sha,
        });
      },
    },

    getLatestRelease: {
      isTool: true,
      description: 'Get the latest release of a GitHub repository.',
      input: GetLatestReleaseInputSchema,
      handler: async (ctx, input: GetLatestReleaseInput) => {
        return callToolJson(ctx, 'get_latest_release', { owner: input.owner, repo: input.repo });
      },
    },

    pullRequestRead: {
      isTool: true,
      description: 'Read the full details of a specific pull request.',
      input: PullRequestReadInputSchema,
      handler: async (ctx, input: PullRequestReadInput) => {
        return callToolJson(ctx, 'pull_request_read', {
          owner: input.owner,
          repo: input.repo,
          pullNumber: input.pullNumber,
          method: input.method,
        });
      },
    },

    getFileContents: {
      isTool: true,
      description: 'Get the contents of a file or directory from a GitHub repository.',
      input: GetFileContentsInputSchema,
      handler: async (ctx, input: GetFileContentsInput) => {
        return callToolContent(ctx, 'get_file_contents', {
          owner: input.owner,
          repo: input.repo,
          path: input.path,
          ref: input.ref,
        });
      },
    },

    getIssue: {
      isTool: true,
      description: 'Get details of a specific issue in a GitHub repository.',
      input: GetIssueInputSchema,
      handler: async (ctx, input: GetIssueInput) => {
        return callToolJson(ctx, 'issue_read', {
          owner: input.owner,
          repo: input.repo,
          issue_number: input.issueNumber,
          method: 'get',
        });
      },
    },

    getIssueComments: {
      isTool: true,
      description: 'Get comments for a specific issue in a GitHub repository.',
      input: GetIssueCommentsInputSchema,
      handler: async (ctx, input: GetIssueCommentsInput) => {
        return callToolJson(ctx, 'issue_read', {
          owner: input.owner,
          repo: input.repo,
          issue_number: input.issueNumber,
          method: 'get_comments',
        });
      },
    },

    listTools: {
      isTool: true,
      description:
        'List all tools available on the GitHub MCP server. Use this to discover available capabilities or refresh tool context for the LLM.',
      input: ListToolsInputSchema,
      handler: async (ctx) => {
        return withMcpClient(ctx, async (mcp) => {
          const { tools } = await mcp.listTools();
          return tools;
        });
      },
    },

    callTool: {
      isTool: true,
      description:
        'Call any tool on the GitHub MCP server directly by name. Use this as an escape hatch when a specific tool is not yet exposed as a named action.',
      input: CallToolInputSchema,
      handler: async (ctx, input: CallToolInput) => {
        return callToolContent(ctx, input.name, input.arguments);
      },
    },
  },

  test: {
    description: i18n.translate('connectorSpecs.github.test.description', {
      defaultMessage:
        'Verifies connection to the GitHub Copilot MCP server by listing available tools.',
    }),
    handler: async (ctx) => {
      return withMcpClient(ctx, async (mcp) => {
        const { tools } = await mcp.listTools();
        return {
          ok: true,
          message: `Connected to GitHub MCP server. ${tools.length} tools available.`,
        };
      });
    },
  },

  skill: [
    'Action strategy guide:',
    '- Start with getMe to identify the authenticated user.',
    '- For broad discovery: use search* actions (searchCode, searchRepositories, searchIssues, searchPullRequests, searchUsers).',
    '- For browsing a specific repo: use list* actions (listIssues, listPullRequests, listCommits, listBranches, listReleases, listTags). All use cursor-based pagination via "first" + "after".',
    '- For specific details: use get* actions (getIssue, getIssueComments, pullRequestRead, getCommit, getLatestRelease, getFileContents).',
    '- For capabilities not yet exposed as named actions: listTools to discover, callTool to invoke.',
  ].join('\n'),
};
