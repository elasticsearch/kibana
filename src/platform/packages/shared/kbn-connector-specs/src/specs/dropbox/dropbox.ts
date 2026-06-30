/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Dropbox MCP Connector
 *
 * An MCP-native connector that connects to the official remote Dropbox MCP server
 * at https://mcp.dropbox.com/mcp.
 *
 * Auth: OAuth 2.0 Authorization Code flow (Dropbox OAuth)
 */

import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';
import { UISchemas, type ConnectorSpec } from '../../connector_spec';
import { withMcpClient, callToolContent, callToolJson } from '../../lib/mcp';
import type {
  CallToolInput,
  CreateSharedLinkInput,
  GetFileContentInput,
  GetFileMetadataInput,
  ListFolderInput,
  ListSharedLinksInput,
  SearchInput,
} from './types';
import {
  CallToolInputSchema,
  CreateSharedLinkInputSchema,
  GetFileContentInputSchema,
  GetFileMetadataInputSchema,
  ListFolderInputSchema,
  ListSharedLinksInputSchema,
  ListToolsInputSchema,
  SearchInputSchema,
  WhoAmIInputSchema,
} from './types';

const DROPBOX_MCP_SERVER_URL = 'https://mcp.dropbox.com/mcp';

export const Dropbox: ConnectorSpec = {
  metadata: {
    id: '.dropbox',
    displayName: 'Dropbox',
    description: i18n.translate('core.kibanaConnectorSpecs.dropbox.metadata.description', {
      defaultMessage: 'Search files and folders, read content, and manage shared links in Dropbox',
    }),
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['workflows', 'agentBuilder'],
  },

  auth: {
    types: [
      {
        type: 'oauth_authorization_code',
        defaults: {
          authorizationUrl: 'https://www.dropbox.com/oauth2/authorize',
          tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
          scope:
            'account_info.read files.metadata.read files.content.read sharing.read sharing.write',
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
  },

  schema: lazySchema(() =>
    z.object({
      serverUrl: UISchemas.url()
        .default(DROPBOX_MCP_SERVER_URL)
        .describe('Dropbox MCP Server URL')
        .meta({
          widget: 'text',
          placeholder: DROPBOX_MCP_SERVER_URL,
          hidden: true,
          label: i18n.translate('connectorSpecs.dropbox.config.serverUrl.label', {
            defaultMessage: 'MCP server URL',
          }),
          helpText: i18n.translate('connectorSpecs.dropbox.config.serverUrl.helpText', {
            defaultMessage: 'The URL of the official Dropbox remote MCP server.',
          }),
        }),
    })
  ),

  validateUrls: {
    fields: ['serverUrl'],
  },

  actions: {
    whoAmI: {
      isTool: true,
      description:
        'Retrieve details about the currently authenticated Dropbox user, including name, email, and account type. ' +
        'Use this to confirm authentication is working and to identify which Dropbox account is connected.',
      input: WhoAmIInputSchema,
      handler: async (ctx) => {
        return callToolJson(ctx, 'who_am_i');
      },
    },

    search: {
      isTool: true,
      description:
        'Search for files and folders in Dropbox by keyword. Searches across file names and content. Returns file paths, ' +
        'names, and metadata. Use this as the primary way to locate files before reading their content.',
      input: SearchInputSchema,
      handler: async (ctx, input: SearchInput) => {
        return callToolJson(ctx, 'search', {
          query: input.query,
          path: input.path,
          max_results: input.maxResults,
          file_extensions: input.fileExtensions,
          file_categories: input.fileCategories,
        });
      },
    },

    listFolder: {
      isTool: true,
      description:
        'List files and subfolders within a specific Dropbox folder. Use an empty string for the root folder. Use paths ' +
        'from search results to browse specific directories. Returns file names, paths, sizes, and modification dates.',
      input: ListFolderInputSchema,
      handler: async (ctx, input: ListFolderInput) => {
        return callToolJson(ctx, 'list_folder', {
          path: input.path,
          recursive: input.recursive,
        });
      },
    },

    getFileMetadata: {
      isTool: true,
      description:
        'Get detailed metadata for a specific file or folder in Dropbox, including size, modification date, content ' +
        'hash, and sharing info. Use this to inspect a file before downloading its content, or to verify a path exists.',
      input: GetFileMetadataInputSchema,
      handler: async (ctx, input: GetFileMetadataInput) => {
        return callToolJson(ctx, 'get_file_metadata', {
          path_or_file_id: input.path,
        });
      },
    },

    getFileContent: {
      isTool: true,
      description:
        'Download the content of a file from Dropbox and return it as text. Dropbox extracts text from documents (up' +
        ' to 5 MB). Use paths from search or listFolder results. WARNING: Returns base64-encoded binary content for ' +
        'non-text files — only call this when you have a plan to process the data (e.g. via an Elasticsearch ingest ' +
        'pipeline attachment processor). Large files can produce very large payloads.',
      input: GetFileContentInputSchema,
      handler: async (ctx, input: GetFileContentInput) => {
        return callToolContent(ctx, 'get_file_content', {
          path_or_file_id: input.path,
        });
      },
    },

    createSharedLink: {
      isTool: true,
      description:
        'Create a shared link for a file or folder in Dropbox. Returns a shareable URL. ' +
        'Use paths from search or listFolder results. ' +
        'Visibility options: "team_only" (Dropbox team members only, default) or "public" (anyone with the link).',
      input: CreateSharedLinkInputSchema,
      handler: async (ctx, input: CreateSharedLinkInput) => {
        return callToolJson(ctx, 'create_shared_link', {
          path: input.path,
          visibility: input.visibility,
        });
      },
    },

    listSharedLinks: {
      isTool: true,
      description:
        'List existing shared links in Dropbox. Optionally filter to links for a specific file or folder path. Returns ' +
        'URLs, visibility settings, and expiration dates for each link.',
      input: ListSharedLinksInputSchema,
      handler: async (ctx, input: ListSharedLinksInput) => {
        return callToolJson(ctx, 'list_shared_links', {
          path: input.path,
        });
      },
    },

    listTools: {
      isTool: true,
      description:
        'List all tools available on the Dropbox MCP server. Use this to discover available capabilities, including ' +
        'write operations (upload, move, copy, delete) and file versioning tools not exposed as named actions.',
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
        'Call any tool on the Dropbox MCP server directly by name. Use this as an escape hatch for tools not yet ' +
        'exposed as named actions (such as create_file, create_folder, copy, move, delete, or restore_file_revision). Use ' +
        'listTools first to discover available tool names and their arguments.',
      input: CallToolInputSchema,
      handler: async (ctx, input: CallToolInput) => {
        return callToolContent(ctx, input.name, input.arguments);
      },
    },
  },

  test: {
    description: i18n.translate('connectorSpecs.dropbox.test.description', {
      defaultMessage:
        'Verifies connection to the Dropbox MCP server by fetching the authenticated user.',
    }),
    handler: async (ctx) => {
      return withMcpClient(ctx, async (mcp) => {
        const { tools } = await mcp.listTools();
        return {
          ok: true,
          message: `Connected to Dropbox MCP server. ${tools.length} tools available.`,
        };
      });
    },
  },

  skill: [
    '## Dropbox Connector — usage guidance',
    '',
    '### Finding and reading files',
    'To read a file: call `search` (or `listFolder`) to get a path,',
    'then `getFileMetadata` to check size and permissions before calling `getFileContent`.',
    'Paths in Dropbox are case-insensitive and always start with "/" (e.g. "/Documents/report.pdf").',
    'Use an empty string "" for the root folder with `listFolder`.',
    '',
    '### File tags',
    'Dropbox does not support searching or filtering by tag — there is no "find files tagged X" API.',
    'The Dropbox MCP server does not expose a tags tool; use `callTool` with `listTools` to check for future additions.',
    '',
    '### Searching vs. browsing',
    'Combine both: use `search` to locate a folder path by keyword, then `listFolder` to enumerate its contents.',
    '',
    '### Shared links',
    'Use `listSharedLinks` to find existing shared links for a file or folder.',
    'Use `createSharedLink` to generate a new shareable URL.',
    '',
    '### Write operations and file versioning',
    'Write actions (upload, move, copy, create folder, delete) and file versioning (list revisions, restore revision)',
    'are not exposed as named actions. Use `listTools` to discover them, then invoke with `callTool`.',
    '',
    '### Common gotchas',
    'File paths are strings starting with "/" — never use numeric IDs as in some other cloud storage services.',
    'The root folder path is an empty string "" (not "/").',
    'Dropbox extracts text from documents up to 5 MB via the MCP server.',
    'If `getFileContent` returns very large base64 content, prefer passing it to an ingest pipeline',
    'attachment processor rather than reading it directly in the agent context.',
  ].join('\n'),
};
