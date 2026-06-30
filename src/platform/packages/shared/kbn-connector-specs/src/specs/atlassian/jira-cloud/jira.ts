/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';
import type {
  GetIssueInput,
  GetProjectInput,
  GetProjectsInput,
  SearchIssuesWithJqlInput,
  SearchUsersInput,
} from './types';
import {
  GetIssueInputSchema,
  GetProjectInputSchema,
  GetProjectsInputSchema,
  SearchUsersInputSchema,
  SearchIssuesWithJqlInputSchema,
} from './types';
import type { ActionContext, ConnectorSpec } from '../../../..';

const buildBaseUrl = (ctx: ActionContext): string => {
  if (ctx.secrets?.authType === 'oauth_authorization_code') {
    const cloudId = String(ctx.config?.cloudId ?? '').trim();
    if (cloudId === '') {
      throw new Error(
        'Jira Cloud ID is required in connector configuration when using OAuth authentication.'
      );
    }
    return `https://api.atlassian.com/ex/jira/${cloudId}`;
  }
  const subdomain = String(ctx.config?.subdomain ?? '').trim();
  if (subdomain === '') {
    throw new Error('Jira Cloud subdomain is required');
  }
  return `https://${subdomain}.atlassian.net`;
};

export const JiraConnector: ConnectorSpec = {
  metadata: {
    id: '.jira-cloud',
    displayName: 'Jira Cloud',
    description: i18n.translate('core.kibanaConnectorSpecs.jira.metadata.description', {
      defaultMessage: 'Search issues, browse projects, and look up users in Jira Cloud',
    }),
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['workflows', 'agentBuilder'],
  },
  auth: {
    types: [
      {
        type: 'oauth_authorization_code',
        overrides: {
          meta: {
            authorizationUrl: { hidden: true },
            tokenUrl: { hidden: true },
            scope: { hidden: true },
          },
        },
        defaults: {
          authorizationUrl: 'https://auth.atlassian.com/authorize',
          tokenUrl: 'https://auth.atlassian.com/oauth/token',
          scope: 'read:jira-work read:jira-user offline_access',
        },
      },
      {
        type: 'basic',
        defaults: {},
        overrides: {
          label: i18n.translate('core.kibanaConnectorSpecs.jira.auth.basic.label', {
            defaultMessage: 'Shared API key',
          }),
          meta: {
            password: {
              label: i18n.translate('core.kibanaConnectorSpecs.jira.auth.password.label', {
                defaultMessage: 'API key',
              }),
              helpText: i18n.translate('core.kibanaConnectorSpecs.jira.auth.password.helpText', {
                defaultMessage: 'Your Jira API token',
              }),
            },
          },
        },
      },
    ],
  },
  schema: lazySchema(() =>
    z.object({
      subdomain: z
        .string()
        .min(1)
        .describe(
          i18n.translate('core.kibanaConnectorSpecs.jira.config.subdomain.description', {
            defaultMessage: 'Your Atlassian subdomain',
          })
        )
        .meta({
          widget: 'text',
          label: i18n.translate('core.kibanaConnectorSpecs.jira.config.subdomain.label', {
            defaultMessage: 'Subdomain',
          }),
          placeholder: 'your-domain',
          helpText: i18n.translate('core.kibanaConnectorSpecs.jira.config.subdomain.helpText', {
            defaultMessage:
              'The subdomain for your Jira Cloud site (e.g. your-domain for https://your-domain.atlassian.net)',
          }),
        }),
      cloudId: z
        .string()
        .optional()
        .describe(
          i18n.translate('core.kibanaConnectorSpecs.jira.config.cloudId.description', {
            defaultMessage: 'Atlassian cloud ID (OAuth)',
          })
        )
        .meta({
          widget: 'text',
          label: i18n.translate('core.kibanaConnectorSpecs.jira.config.cloudId.label', {
            defaultMessage: 'Cloud ID',
          }),
          helpText: i18n.translate('core.kibanaConnectorSpecs.jira.config.cloudId.helpText', {
            defaultMessage:
              'Required for OAuth. To find your Cloud ID, visit https://your-subdomain.atlassian.net/_edge/tenant_info (replace your-subdomain with your Atlassian subdomain) and use the cloudId value from the response.',
          }),
        }),
    })
  ),
  actions: {
    searchIssuesWithJql: {
      isTool: true,
      description:
        'Search or filter Jira issues using JQL (Jira Query Language). Use when you need to find issues by status, assignee, project, label, or any other criteria. Supports pagination via nextPageToken.',
      input: SearchIssuesWithJqlInputSchema,
      handler: async (ctx, input: SearchIssuesWithJqlInput) => {
        const typedInput = input as {
          jql: string;
          maxResults?: number;
          nextPageToken?: string;
        };
        const baseUrl = buildBaseUrl(ctx);
        const response = await ctx.client.post(`${baseUrl}/rest/api/3/search/jql`, typedInput);
        return response.data;
      },
    },
    getIssue: {
      isTool: true,
      description:
        'Fetch full details of a single Jira issue by its ID or key. Use when you already have the issue key (e.g. PROJ-123) or issue ID and need the complete record including fields, comments, and metadata.',
      input: GetIssueInputSchema,
      handler: async (ctx, input: GetIssueInput) => {
        const typedInput = input as {
          issueId: string;
        };
        const baseUrl = buildBaseUrl(ctx);
        const response = await ctx.client.get(`${baseUrl}/rest/api/3/issue/${typedInput.issueId}`);
        return response.data;
      },
    },
    getProjects: {
      isTool: true,
      description:
        'List or search Jira projects. Use when you need to discover available projects or find a project by name or key. Supports pagination and optional text filtering.',
      input: GetProjectsInputSchema,
      handler: async (ctx, input: GetProjectsInput) => {
        const typedInput = input as {
          maxResults?: number;
          startAt?: number;
          query?: string;
        };
        const baseUrl = buildBaseUrl(ctx);
        const response = await ctx.client.get(`${baseUrl}/rest/api/3/project/search`, {
          params: typedInput,
        });
        return response.data;
      },
    },
    getProject: {
      isTool: true,
      description:
        'Fetch full details of a single Jira project by its ID or key. Use when you already have the project key (e.g. PROJ) or numeric project ID and need the complete project record.',
      input: GetProjectInputSchema,
      handler: async (ctx, input: GetProjectInput) => {
        const typedInput = input as {
          projectId: string;
        };
        const baseUrl = buildBaseUrl(ctx);
        const response = await ctx.client.get(
          `${baseUrl}/rest/api/3/project/${typedInput.projectId}`
        );
        return response.data;
      },
    },
    searchUsers: {
      isTool: true,
      description:
        'Find Jira users by name, username, or email. Use when you need a user accountId (e.g. for JQL assignee filters) or to look up user contact details. At least one search parameter should be provided.',
      input: SearchUsersInputSchema,
      handler: async (ctx, input: SearchUsersInput) => {
        const typedInput = input as {
          query?: string;
          username?: string;
          accountId?: string;
          startAt?: number;
          maxResults?: number;
          property?: string;
        };
        const baseUrl = buildBaseUrl(ctx);
        const response = await ctx.client.get(`${baseUrl}/rest/api/3/user/search`, {
          params: typedInput,
        });
        return response.data;
      },
    },
  },
  skill: [
    'Typical patterns:',
    '- Discovery: getProjects → getProject (by key) → searchIssuesWithJql (scoped to project)',
    '- Issue lookup: searchIssuesWithJql → getIssue (by key from results)',
    '- User-filtered search: searchUsers (to get accountId) → searchIssuesWithJql with assignee = "accountId"',
  ].join('\n'),
};
