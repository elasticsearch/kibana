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
import type { ConnectorSpec } from '../../connector_spec';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DEFAULT_MAX_RESULTS = 10;
const MAX_PAGE_SIZE = 100;

function throwGmailError(error: unknown): void {
  const axiosError = error as {
    response?: { data?: { error?: { message?: string; code?: number } } };
  };
  const gmailError = axiosError.response?.data?.error;
  if (gmailError) {
    throw new Error(
      `Gmail API error (${gmailError.code ?? 'unknown'}): ${gmailError.message ?? 'Unknown'}`
    );
  }
}

export const GmailConnector: ConnectorSpec = {
  metadata: {
    id: '.gmail',
    displayName: 'Gmail',
    description: i18n.translate('core.kibanaConnectorSpecs.gmail.metadata.description', {
      defaultMessage: 'Search and read emails from Gmail',
    }),
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['workflows', 'agentBuilder'],
  },

  auth: {
    types: [
      {
        type: 'ears',
        isRecommended: true,
        isExperimental: true,
        overrides: {
          meta: { scope: { disabled: true } },
        },
        defaults: {
          provider: 'google',
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        },
      },
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
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        },
      },
      { type: 'bearer', isLegacy: true, defaults: {} },
    ],
    headers: {
      Accept: 'application/json',
    },
  },

  actions: {
    searchMessages: {
      isTool: true,
      description:
        'Search for emails in Gmail. Use a specific query (from:, subject:, is:unread, after:, newer_than:Nd) and limit maxResults (e.g. 10-20) to avoid large responses.',
      input: lazySchema(() =>
        z.object({
          query: z
            .string()
            .optional()
            .describe(
              'Gmail search query using Gmail search operators. Supported operators: from:user@example.com (sender), to:user@example.com (recipient), subject:keyword (subject line), is:unread / is:read (read status), has:attachment (emails with attachments), after:YYYY/MM/DD / before:YYYY/MM/DD (absolute date range), newer_than:7d / older_than:30d (relative date — d=days, m=months, y=years), label:LABELNAME (by label). Combine operators freely: "from:alice@example.com is:unread newer_than:7d". Prefer narrow queries to avoid large responses.'
            ),
          maxResults: z
            .number()
            .optional()
            .default(DEFAULT_MAX_RESULTS)
            .describe(
              'Maximum number of message IDs to return (1-100). Prefer 10-20 to keep context small; increase only if user explicitly needs more.'
            ),
          pageToken: z
            .string()
            .optional()
            .describe('Token for pagination from a previous response'),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as {
          query?: string;
          maxResults?: number;
          pageToken?: string;
        };
        const params: Record<string, string | number> = {
          maxResults: Math.min(typedInput.maxResults ?? DEFAULT_MAX_RESULTS, MAX_PAGE_SIZE),
        };
        if (typedInput.query) params.q = typedInput.query;
        if (typedInput.pageToken) params.pageToken = typedInput.pageToken;
        try {
          const response = await ctx.client.get(`${GMAIL_API_BASE}/messages`, { params });
          return {
            messages: response.data.messages ?? [],
            nextPageToken: response.data.nextPageToken,
            resultSizeEstimate: response.data.resultSizeEstimate,
          };
        } catch (error: unknown) {
          throwGmailError(error);
          throw error;
        }
      },
    },
    getMessage: {
      isTool: true,
      description:
        'Retrieve one Gmail message by ID. You must call searchMessages or listMessages first to get message IDs, then pass one of those IDs here.',
      input: lazySchema(() =>
        z.object({
          messageId: z
            .string()
            .min(1, { message: 'messageId is required to retrieve a Gmail message' })
            .describe(
              'Required. The Gmail message ID (e.g. from searchMessages or listMessages). Always pass this when calling getMessage.'
            ),
          format: z
            .enum(['minimal', 'full', 'raw'])
            .optional()
            .default('minimal')
            .describe(
              'Message format: use "minimal" (headers only) to save context; use "full" only when the user needs the email body content.'
            ),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as { messageId: string; format?: string };
        try {
          const response = await ctx.client.get(
            `${GMAIL_API_BASE}/messages/${typedInput.messageId}`,
            {
              params: { format: typedInput.format ?? 'minimal' },
            }
          );
          return response.data;
        } catch (error: unknown) {
          throwGmailError(error);
          throw error;
        }
      },
    },
    getAttachment: {
      isTool: true,
      description:
        'Retrieve one Gmail attachment by message ID and attachment ID. Call getMessage with format "full" first to get attachment IDs from payload.parts[].body.attachmentId (and parts[].filename for the file name).',
      input: lazySchema(() =>
        z.object({
          messageId: z
            .string()
            .min(1, { message: 'messageId is required to retrieve an attachment' })
            .describe(
              'Required. The Gmail message ID (from getMessage or search/list). Get attachment IDs from getMessage with format "full" — see payload.parts[].body.attachmentId.'
            ),
          attachmentId: z
            .string()
            .min(1, { message: 'attachmentId is required to retrieve an attachment' })
            .describe(
              'Required. The attachment ID from the message. Call getMessage with format "full" and read payload.parts[].body.attachmentId (and parts[].filename for the file name).'
            ),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as { messageId: string; attachmentId: string };
        try {
          const response = await ctx.client.get(
            `${GMAIL_API_BASE}/messages/${typedInput.messageId}/attachments/${typedInput.attachmentId}`
          );
          return response.data;
        } catch (error: unknown) {
          throwGmailError(error);
          throw error;
        }
      },
    },
    listMessages: {
      isTool: true,
      description:
        'List Gmail message IDs by label (e.g. INBOX, SENT). Prefer searchMessages when the user has a specific query; limit maxResults (e.g. 10-20) to keep context small.',
      input: lazySchema(() =>
        z.object({
          maxResults: z
            .number()
            .optional()
            .default(DEFAULT_MAX_RESULTS)
            .describe(
              'Maximum number of message IDs to return (1-100). Prefer 10-20 to keep context small.'
            ),
          pageToken: z
            .string()
            .optional()
            .describe('Token for pagination from a previous response'),
          labelIds: z
            .array(z.string())
            .optional()
            .describe(
              'Filter messages by Gmail label IDs (e.g. ["INBOX"], ["SENT"], ["UNREAD"]). Use this to scope to a mailbox folder. Omit to list from all labels. Prefer searchMessages when you need query-based filtering.'
            ),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as {
          maxResults?: number;
          pageToken?: string;
          labelIds?: string[];
        };
        const params: Record<string, string | number | string[]> = {
          maxResults: Math.min(typedInput.maxResults ?? DEFAULT_MAX_RESULTS, MAX_PAGE_SIZE),
        };
        if (typedInput.pageToken) params.pageToken = typedInput.pageToken;
        if (typedInput.labelIds?.length) params.labelIds = typedInput.labelIds;
        try {
          const response = await ctx.client.get(`${GMAIL_API_BASE}/messages`, { params });
          return {
            messages: response.data.messages ?? [],
            nextPageToken: response.data.nextPageToken,
            resultSizeEstimate: response.data.resultSizeEstimate,
          };
        } catch (error: unknown) {
          throwGmailError(error);
          throw error;
        }
      },
    },
  },

  test: {
    description: 'Verifies Gmail connection by fetching user profile',
    handler: async (ctx) => {
      ctx.log.debug('Gmail test handler');
      try {
        const response = await ctx.client.get(`${GMAIL_API_BASE}/profile`);
        if (response.status !== 200) {
          return {
            ok: false,
            message: 'Failed to connect to Gmail API',
          };
        }
        const emailAddress = response.data?.emailAddress ?? 'user';
        return {
          ok: true,
          message: `Successfully connected to Gmail as ${emailAddress}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          ok: false,
          message: `Failed to connect to Gmail API: ${errorMessage}`,
        };
      }
    },
  },

  skill: [
    '## Gmail multi-step workflow',
    '',
    '1. **Find messages** — call `searchMessages` (query-based) or `listMessages` (label-based) to get message IDs.',
    '2. **Read a message** — call `getMessage` with one of those IDs. Use `format: "minimal"` (default) for headers only; use `format: "full"` when the user needs the body or attachment metadata.',
    '3. **Download an attachment** (optional) — call `getMessage` with `format: "full"` first, then call `getAttachment` with the `messageId` and an `attachmentId` from `payload.parts[].body.attachmentId`.',
  ].join('\n'),
};
