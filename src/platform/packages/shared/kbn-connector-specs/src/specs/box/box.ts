/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Box MCP Connector (v2)
 *
 * An MCP-native v2 connector that connects to the remote Box MCP server
 * at https://mcp.box.com.
 *
 * Auth: OAuth 2.0 Authorization Code flow
 */

import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';
import { UISchemas, type ConnectorSpec } from '../../connector_spec';
import { withMcpClient, callToolContent, callToolJson } from '../../lib/mcp';
import type {
  AiExtractFreeformInput,
  AiExtractStructuredFromMetadataTemplateInput,
  AiQaHubInput,
  AiQaMultiFileInput,
  AiQaSingleFileInput,
  CallToolInput,
  GetCommentsInput,
  GetFileContentInput,
  GetFileDetailsInput,
  GetFolderDetailsInput,
  GetHubDetailsInput,
  GetHubItemsInput,
  ListFolderContentInput,
  ListRecentItemsInput,
  SearchByMetadataInput,
  SearchFilesKeywordInput,
  SearchFoldersByNameInput,
} from './types';
import {
  AiExtractFreeformInputSchema,
  AiExtractStructuredFromMetadataTemplateInputSchema,
  AiQaHubInputSchema,
  AiQaMultiFileInputSchema,
  AiQaSingleFileInputSchema,
  CallToolInputSchema,
  GetCommentsInputSchema,
  GetFileContentInputSchema,
  GetFileDetailsInputSchema,
  GetFolderDetailsInputSchema,
  GetHubDetailsInputSchema,
  GetHubItemsInputSchema,
  ListFolderContentInputSchema,
  ListHubsInputSchema,
  ListRecentItemsInputSchema,
  ListToolsInputSchema,
  SearchByMetadataInputSchema,
  SearchFilesKeywordInputSchema,
  SearchFoldersByNameInputSchema,
  WhoAmIInputSchema,
} from './types';

const BOX_MCP_SERVER_URL = 'https://mcp.box.com';

export const Box: ConnectorSpec = {
  metadata: {
    id: '.box',
    displayName: 'Box',
    description: i18n.translate('core.kibanaConnectorSpecs.box.metadata.description', {
      defaultMessage:
        'Search files and folders, read content, and query enterprise content using Box AI',
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
          authorizationUrl: 'https://account.box.com/api/oauth2/authorize',
          tokenUrl: 'https://api.box.com/oauth2/token',
          scope: 'root_readwrite ai.readwrite docgen.readwrite',
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
        .default(BOX_MCP_SERVER_URL)
        .describe('Box MCP Server URL')
        .meta({
          widget: 'text',
          placeholder: 'https://mcp.box.com',
          hidden: true,
          label: i18n.translate('connectorSpecs.box.config.serverUrl.label', {
            defaultMessage: 'MCP Server URL',
          }),
          helpText: i18n.translate('connectorSpecs.box.config.serverUrl.helpText', {
            defaultMessage: 'The URL of the remote Box MCP server.',
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
        'Retrieve details about the currently authenticated Box user, including name, email, and account type. Use this to confirm authentication is working and to identify which Box account is connected.',
      input: WhoAmIInputSchema,
      handler: async (ctx) => {
        return callToolJson(ctx, 'who_am_i');
      },
    },

    searchFilesKeyword: {
      isTool: true,
      description:
        'Search for files in Box by keyword. Box searches across file and folder names, document content, descriptions, and metadata. Returns file IDs, names, and paths. Use this as the primary way to locate files before reading their content or details.',
      input: SearchFilesKeywordInputSchema,
      handler: async (ctx, input: SearchFilesKeywordInput) => {
        return callToolJson(ctx, 'search_files_keyword', {
          query: input.query,
          limit: input.limit,
          offset: input.offset,
          folder_id: input.folderId,
        });
      },
    },

    searchFoldersByName: {
      isTool: true,
      description:
        'Search for folders in Box by name. Returns folder IDs, names, and parent paths. Use this to locate a specific folder before browsing its contents with listFolderContent.',
      input: SearchFoldersByNameInputSchema,
      handler: async (ctx, input: SearchFoldersByNameInput) => {
        return callToolJson(ctx, 'search_folders_by_name', {
          query: input.query,
          limit: input.limit,
        });
      },
    },

    listFolderContent: {
      isTool: true,
      description:
        'List files and subfolders inside a specific Box folder. Use folder ID "0" for the root folder. Use folder IDs from searchFoldersByName results to browse specific directories.',
      input: ListFolderContentInputSchema,
      handler: async (ctx, input: ListFolderContentInput) => {
        return callToolJson(ctx, 'list_folder_content_by_folder_id', {
          folder_id: input.folderId,
          limit: input.limit,
        });
      },
    },

    getFileContent: {
      isTool: true,
      description:
        'Retrieve the text content of a file stored in Box. Works with documents, spreadsheets, PDFs, and other text-extractable formats. Use file IDs from searchFilesKeyword or listFolderContent results. WARNING: For large files, this may return a very large payload. Only call this when you need the actual document content; use getFileDetails first to check file size if needed.',
      input: GetFileContentInputSchema,
      handler: async (ctx, input: GetFileContentInput) => {
        return callToolContent(ctx, 'get_file_content', {
          file_id: input.fileId,
        });
      },
    },

    getFileDetails: {
      isTool: true,
      description:
        'Get detailed metadata for a specific Box file, including size, owner, modification date, permissions, shared link status, and version info. Use this to inspect a file before downloading its content, or to check sharing and access settings.',
      input: GetFileDetailsInputSchema,
      handler: async (ctx, input: GetFileDetailsInput) => {
        return callToolJson(ctx, 'get_file_details', {
          file_id: input.fileId,
        });
      },
    },

    getFolderDetails: {
      isTool: true,
      description:
        'Get detailed metadata for a specific Box folder, including owner, modification date, permissions, collaboration settings, and shared link status.',
      input: GetFolderDetailsInputSchema,
      handler: async (ctx, input: GetFolderDetailsInput) => {
        return callToolJson(ctx, 'get_folder_details', {
          folder_id: input.folderId,
        });
      },
    },

    listRecentItems: {
      isTool: true,
      description:
        'List files and folders recently accessed or modified by the authenticated user in Box. Returns item IDs, names, types, and interaction timestamps. Use this to surface recently active content without needing a search query.',
      input: ListRecentItemsInputSchema,
      handler: async (ctx, input: ListRecentItemsInput) => {
        return callToolJson(ctx, 'list_recent_items', {
          limit: input.limit,
        });
      },
    },

    getComments: {
      isTool: true,
      description:
        'Retrieve all comments posted on a specific Box file. Returns comment text, author details, and timestamps. Use this to understand discussion or review feedback on a document.',
      input: GetCommentsInputSchema,
      handler: async (ctx, input: GetCommentsInput) => {
        return callToolJson(ctx, 'get_file_comments', {
          file_id: input.fileId,
        });
      },
    },

    searchByMetadata: {
      isTool: true,
      description:
        'Search for Box files and folders using metadata template fields and a structured query expression (e.g. `amount >= 100 AND currency = "USD"`). Returns items whose metadata matches the query. Use this when you need to filter content by structured attributes rather than keyword text. Use callTool with list_metadata_templates to discover available template keys and field names.',
      input: SearchByMetadataInputSchema,
      handler: async (ctx, input: SearchByMetadataInput) => {
        return callToolJson(ctx, 'search_by_metadata_query', {
          query: input.query,
          template_key: input.templateKey,
          scope: input.scope,
          ancestor_folder_id: input.ancestorFolderId,
          limit: input.limit,
        });
      },
    },

    aiQaSingleFile: {
      isTool: true,
      description:
        'Ask Box AI a question about a single file. Box AI reads the file and returns an answer with citations. Use this for targeted questions like "What is the contract renewal date?" or "Summarize the executive summary". Files must have fewer than 1 MB of extracted text. For questions spanning multiple files, use aiQaMultiFile instead.',
      input: AiQaSingleFileInputSchema,
      handler: async (ctx, input: AiQaSingleFileInput) => {
        return callToolJson(ctx, 'ai_qa_single_file', {
          file_id: input.fileId,
          question: input.prompt,
        });
      },
    },

    aiQaMultiFile: {
      isTool: true,
      description:
        'Ask Box AI a question across multiple files simultaneously. Box AI reads all specified files and returns a unified answer with citations. Use this for cross-document analysis such as "Compare the Q1 and Q2 budget reports" or "Which of these contracts has the earliest expiration date?".',
      input: AiQaMultiFileInputSchema,
      handler: async (ctx, input: AiQaMultiFileInput) => {
        return callToolJson(ctx, 'ai_qa_multi_file', {
          file_ids: input.fileIds,
          question: input.prompt,
        });
      },
    },

    aiQaHub: {
      isTool: true,
      description:
        'Ask Box AI a question about the contents of a Box Hub. Box AI searches across all items in the hub and returns an answer with citations. Use this to query a curated collection of content organized around a topic or project. Use listHubs to discover available hubs.',
      input: AiQaHubInputSchema,
      handler: async (ctx, input: AiQaHubInput) => {
        return callToolJson(ctx, 'ai_qa_hub', {
          hub_id: input.hubId,
          question: input.prompt,
        });
      },
    },

    aiExtractFreeform: {
      isTool: true,
      description:
        'Extract metadata from a Box file using a natural-language prompt. Box AI reads the file and returns structured key-value pairs matching the described fields. Use this when you need to pull specific data points from documents — for example, "Extract the vendor name, invoice date, and total amount" from an invoice. Files must have fewer than 1 MB of extracted text.',
      input: AiExtractFreeformInputSchema,
      handler: async (ctx, input: AiExtractFreeformInput) => {
        return callToolJson(ctx, 'ai_extract_freeform', {
          file_id: input.fileId,
          prompt: input.prompt,
        });
      },
    },

    aiExtractStructuredFromMetadataTemplate: {
      isTool: true,
      description:
        'Extract structured metadata from a Box file using an existing enterprise metadata template. Box AI reads the file and fills in the template fields automatically. Use this when a metadata template has already been defined in Box for a document type (e.g. contracts, invoices). Use callTool with list_metadata_templates to discover available templates.',
      input: AiExtractStructuredFromMetadataTemplateInputSchema,
      handler: async (ctx, input: AiExtractStructuredFromMetadataTemplateInput) => {
        return callToolJson(ctx, 'ai_extract_structured_from_metadata_template', {
          file_id: input.fileId,
          template_key: input.templateKey,
          scope: input.scope,
        });
      },
    },

    listHubs: {
      isTool: true,
      description:
        'List all Box Hubs accessible to the authenticated user. Returns hub IDs, titles, and descriptions. Use hub IDs with aiQaHub or getHubItems to query or browse hub contents.',
      input: ListHubsInputSchema,
      handler: async (ctx) => {
        return callToolJson(ctx, 'list_hubs');
      },
    },

    getHubDetails: {
      isTool: true,
      description:
        'Get metadata and details for a specific Box Hub, including title, description, and configuration. Use listHubs to discover hub IDs.',
      input: GetHubDetailsInputSchema,
      handler: async (ctx, input: GetHubDetailsInput) => {
        return callToolJson(ctx, 'get_hub_details', {
          hub_id: input.hubId,
        });
      },
    },

    getHubItems: {
      isTool: true,
      description:
        'List files and folders associated with a specific Box Hub. Returns item IDs and names that you can then read with getFileContent or query with aiQaSingleFile. Use listHubs to discover hub IDs.',
      input: GetHubItemsInputSchema,
      handler: async (ctx, input: GetHubItemsInput) => {
        return callToolJson(ctx, 'get_hub_items', {
          hub_id: input.hubId,
        });
      },
    },

    listTools: {
      isTool: true,
      description:
        'List all tools available on the Box MCP server. Use this to discover available capabilities or to find write/admin tools not exposed as named actions.',
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
        'Call any tool on the Box MCP server directly by name. Use this as an escape hatch for tools not yet exposed as named actions (e.g. write operations like upload_file, create_folder, or create_collaboration). Use listTools first to discover available tool names and their arguments.',
      input: CallToolInputSchema,
      handler: async (ctx, input: CallToolInput) => {
        return callToolContent(ctx, input.name, input.arguments);
      },
    },
  },

  test: {
    description: i18n.translate('connectorSpecs.box.test.description', {
      defaultMessage:
        'Verifies connection to the Box MCP server by fetching the authenticated user.',
    }),
    handler: async (ctx) => {
      return withMcpClient(ctx, async (mcp) => {
        const { tools } = await mcp.listTools();
        return {
          ok: true,
          message: `Connected to Box MCP server. ${tools.length} tools available.`,
        };
      });
    },
  },

  skill: [
    '## Box Connector — usage guidance',
    '',
    '### Finding and reading files',
    'To read a file: call `searchFilesKeyword` (or `searchFoldersByName` + `listFolderContent`) to get an ID,',
    'then `getFileDetails` to check size and permissions before calling `getFileContent`.',
    'For recently touched content, use `listRecentItems` instead of searching.',
    '',
    '### Metadata and comments',
    'Use `searchByMetadata` to filter content by structured attributes from a metadata template.',
    'Call `callTool` with `list_metadata_templates` to discover available template keys and fields.',
    'Use `getComments` to surface review feedback or discussion on a document.',
    '',
    '### Box AI — targeted extraction and Q&A',
    'Prefer `aiQaSingleFile` / `aiQaMultiFile` over `getFileContent` when you need answers, not raw text.',
    'Use `aiExtractFreeform` to pull ad-hoc fields; use `aiExtractStructuredFromMetadataTemplate` when a template exists.',
    'Box AI tools cap at ~1 MB of extracted text per file.',
    '',
    '### Box Hubs',
    'Call `listHubs` to discover hubs, then `getHubItems` to enumerate their contents.',
    'Query the hub with `aiQaHub` or drill into individual items with `aiQaSingleFile`.',
    '',
    '### Write operations',
    'Write actions (upload, move, copy, create folder, set metadata, manage collaborations) are not',
    'exposed as named actions. Use `listTools` to discover them, then invoke with `callTool`.',
    '',
    '### Common gotchas',
    'File and folder IDs are numeric strings in Box (e.g. "1234567890") — always use IDs from search/list results.',
    'The root folder ID is "0".',
  ].join('\n'),
};
