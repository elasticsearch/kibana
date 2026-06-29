/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * SharePoint Server (On-Premises) Connector
 *
 * This connector provides integration with SharePoint Server (on-premises) via
 * the native SharePoint REST API (/_api/). Features include:
 * - Site and list retrieval
 * - List items and folder contents
 * - File download
 * - Site page content retrieval
 * - KQL search
 *
 * Uses HTTP Basic authentication (username/password).
 */

import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';
import type { ConnectorSpec } from '../../connector_spec';
import { normalizeUrl } from '../../connector_utils';
import {
  CallRestApiInputSchema,
  DownloadFileInputSchema,
  DownloadFileOutputSchema,
  GetFolderContentsInputSchema,
  GetFolderContentsOutputSchema,
  GetListItemsInputSchema,
  GetSitePageContentsInputSchema,
  ODataCollectionOutputSchema,
  SearchInputSchema,
} from './types';

const ODATA_HEADERS = { Accept: 'application/json;odata=nometadata' };

export const SharepointServer: ConnectorSpec = {
  metadata: {
    id: '.sharepoint-server',
    displayName: 'SharePoint Server',
    description: i18n.translate('core.kibanaConnectorSpecs.sharepointServer.metadata.description', {
      defaultMessage:
        'Connect to SharePoint Server (on-premises) to search and retrieve site content.',
    }),
    minimumLicense: 'enterprise',
    supportedFeatureIds: ['workflows', 'agentBuilder'],
    isTechnicalPreview: true,
  },

  auth: {
    types: [{ type: 'basic', defaults: {} }],
  },

  schema: lazySchema(() =>
    z.object({
      siteUrl: z.string().url().max(2048).describe('SharePoint Server site URL').meta({
        label: 'Site URL',
        widget: 'text',
        placeholder: 'https://sharepoint.company.com/sites/mysite',
      }),
    })
  ),

  actions: {
    getWeb: {
      isTool: true,
      description:
        'Get metadata about the SharePoint site (title, URL, description, locale). Use this as a starting point to confirm the site is reachable and to retrieve the site title before browsing lists or folders.',
      input: z.object({}).optional(),
      output: z.any(),
      handler: async (ctx) => {
        const { siteUrl } = ctx.config as { siteUrl: string };
        ctx.log.debug('SharePoint Server getting web info');
        const response = await ctx.client.get(`${normalizeUrl(siteUrl)}/_api/web`, {
          headers: ODATA_HEADERS,
        });
        return response.data;
      },
    },

    getLists: {
      isTool: true,
      description:
        "List all lists and document libraries on the SharePoint site. Returns each list's Id, Title, ItemCount, Description, Created, and LastItemModifiedDate. Use the Title field as input to getListItems, and RootFolder.ServerRelativeUrl as the path input to getFolderContents.",
      input: z.object({}).optional(),
      output: ODataCollectionOutputSchema,
      handler: async (ctx) => {
        const { siteUrl } = ctx.config as { siteUrl: string };
        ctx.log.debug('SharePoint Server getting lists');
        const response = await ctx.client.get(`${normalizeUrl(siteUrl)}/_api/web/lists`, {
          headers: ODATA_HEADERS,
          params: {
            $select:
              'Id,Title,ItemCount,Description,Created,LastItemModifiedDate,RootFolder/ServerRelativeUrl',
            $expand: 'RootFolder',
          },
        });
        return response.data;
      },
    },

    getListItems: {
      isTool: true,
      description:
        "Get items from a list or document library by its exact display name (Title). Call getLists first to discover available list titles. The listTitle must match the Title field exactly (case-sensitive). Examples of valid titles: 'Documents', 'Tasks', 'Site Pages'.",
      input: GetListItemsInputSchema,
      output: ODataCollectionOutputSchema,
      handler: async (ctx, input) => {
        const { listTitle } = input as { listTitle: string };
        const { siteUrl } = ctx.config as { siteUrl: string };
        ctx.log.debug(`SharePoint Server getting items of list "${listTitle}"`);
        const escapedListTitle = listTitle.replace(/'/g, "''");
        const response = await ctx.client.get(
          `${normalizeUrl(siteUrl)}/_api/web/lists/GetByTitle('${escapedListTitle}')/items`,
          {
            headers: ODATA_HEADERS,
          }
        );
        return response.data;
      },
    },

    getFolderContents: {
      isTool: true,
      description:
        "List files and subfolders at a given server-relative folder path. The path starts with '/' and contains no hostname. Obtain a starting path from getLists (RootFolder.ServerRelativeUrl) or navigate deeper using ServerRelativeUrl from a previous getFolderContents result. Example path: '/sites/mysite/Shared Documents'.",
      input: GetFolderContentsInputSchema,
      output: GetFolderContentsOutputSchema,
      handler: async (ctx, input) => {
        const { path } = input as { path: string };
        const { siteUrl } = ctx.config as { siteUrl: string };
        ctx.log.debug(`SharePoint Server getting folder contents at "${path}"`);
        const escapedPath = path.replace(/'/g, "''");
        const [filesResponse, foldersResponse] = await Promise.all([
          ctx.client.get(
            `${normalizeUrl(
              siteUrl
            )}/_api/web/GetFolderByServerRelativeUrl('${escapedPath}')/Files`,
            { headers: ODATA_HEADERS }
          ),
          ctx.client.get(
            `${normalizeUrl(
              siteUrl
            )}/_api/web/GetFolderByServerRelativeUrl('${escapedPath}')/Folders`,
            { headers: ODATA_HEADERS }
          ),
        ]);
        return {
          files: filesResponse.data.value,
          folders: foldersResponse.data.value,
        };
      },
    },

    downloadFile: {
      isTool: true,
      description:
        'Download a file by its server-relative URL and return its raw content as UTF-8 text. Use getFolderContents to discover file paths (ServerRelativeUrl field). For plain-text files the text field contains the content directly. For binary files (PDF, .docx, etc.) the raw bytes are returned as text and should be processed through an Elasticsearch attachment ingest pipeline to extract readable content.',
      input: DownloadFileInputSchema,
      output: DownloadFileOutputSchema,
      handler: async (ctx, input) => {
        const { path } = input as { path: string };
        const { siteUrl } = ctx.config as { siteUrl: string };
        ctx.log.debug(`SharePoint Server downloading file at "${path}"`);
        const escapedPath = path.replace(/'/g, "''");
        const response = await ctx.client.get(
          `${normalizeUrl(siteUrl)}/_api/web/GetFileByServerRelativeUrl('${escapedPath}')/$value`,
          { responseType: 'arraybuffer' }
        );
        const buffer = Buffer.from(response.data);
        return {
          contentType: response.headers?.['content-type'],
          contentLength: response.headers?.['content-length'],
          text: buffer.toString('utf8'),
        };
      },
    },

    getSitePageContents: {
      isTool: true,
      description:
        "Get the content of a SharePoint site page by its integer item ID. To find the page ID, call getListItems with listTitle='Site Pages' and look for the Id field (an integer, not the GUID) on the desired page. Returns the page title and HTML content fields (CanvasContent1, WikiField).",
      input: GetSitePageContentsInputSchema,
      output: z.any(),
      handler: async (ctx, input) => {
        const { pageId } = input as { pageId: number };
        const { siteUrl } = ctx.config as { siteUrl: string };
        ctx.log.debug(`SharePoint Server getting site page contents for page ID ${pageId}`);
        const response = await ctx.client.get(
          `${normalizeUrl(siteUrl)}/_api/web/lists/GetByTitle('Site Pages')/items(${pageId})`,
          {
            headers: ODATA_HEADERS,
            params: {
              $select: 'Title,CanvasContent1,WikiField',
            },
          }
        );
        return response.data;
      },
    },

    search: {
      isTool: true,
      description:
        "Search SharePoint site content using Keyword Query Language (KQL). Supports plain keyword search as well as field:value filters. Use 'from' and 'size' for pagination. Example queries: 'budget report', 'FileExtension:docx', 'author:Jane AND project plan', 'ContentType:Document AND title:policy'.",
      input: SearchInputSchema,
      output: z.any(),
      handler: async (ctx, input) => {
        const { query, from, size } = input as { query: string; from?: number; size?: number };
        const { siteUrl } = ctx.config as { siteUrl: string };
        ctx.log.debug(`SharePoint Server search: "${query}"`);
        const response = await ctx.client.get(`${normalizeUrl(siteUrl)}/_api/search/query`, {
          headers: ODATA_HEADERS,
          params: {
            querytext: `'${query.replace(/'/g, "''")}'`,
            ...(from !== undefined && { startRow: from }),
            ...(size !== undefined && { rowLimit: size }),
          },
        });
        return response.data;
      },
    },

    callRestApi: {
      isTool: true,
      description:
        "Call any SharePoint Server REST API endpoint directly. Use this for advanced queries not covered by the other actions. The path must start with '_api/' (for example, '_api/web/title' or '_api/web/lists/GetByTitle(\\'Documents\\')/items?$top=5'). Prefer the dedicated actions (getLists, getListItems, getFolderContents, etc.) when they cover your use case.",
      input: CallRestApiInputSchema,
      output: z.any(),
      handler: async (ctx, input) => {
        const { method, path, body } = input as {
          method: 'GET' | 'POST';
          path: string;
          body?: unknown;
        };
        const { siteUrl } = ctx.config as { siteUrl: string };
        const url = `${normalizeUrl(siteUrl)}/${path}`;
        ctx.log.debug(`SharePoint Server callRestApi ${method} ${url}`);
        const response = await ctx.client.request({
          method,
          url,
          headers: ODATA_HEADERS,
          data: body,
        });
        return {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data,
        };
      },
    },
  },

  skill: [
    'SharePoint Server connector — usage guidance for LLM agents.',
    '',
    '## Navigation',
    'Use these actions to explore the site structure before reading content:',
    '1. `getWeb` — confirm the site is reachable and retrieve basic site metadata. No inputs required.',
    '2. `getLists` — enumerate all lists and document libraries. No inputs required. Each result has a `Title` (use with `getListItems`) and `RootFolder.ServerRelativeUrl` (use with `getFolderContents`).',
    '3. `getListItems` — retrieve items from a named list. Requires `listTitle` (exact `Title` value from `getLists`, case-sensitive). To find site pages, pass `listTitle: "Site Pages"`.',
    '4. `getFolderContents` — list files and sub-folders at a path. Requires `path` (a `ServerRelativeUrl` starting with `/`, obtained from `getLists` or a previous `getFolderContents` result).',
    '',
    '## Downloading file content',
    'Two strategies depending on the content type:',
    '',
    '### Text / plain files',
    "- Call `downloadFile` with `path` set to the file's `ServerRelativeUrl`.",
    '- The response `text` field contains the UTF-8 decoded content directly.',
    '',
    '### Binary files (PDF, .docx, .xlsx, etc.)',
    '- Call `downloadFile` to retrieve the raw bytes.',
    '- Pipe the result through the Elasticsearch attachment ingest pipeline (`/_ingest/pipeline/_simulate` with an `attachment` processor).',
    '- The human-readable extracted text is available in `docs[0].doc._source.attachment.content`.',
    '',
    '### Site pages',
    '- Call `getListItems` with `listTitle: "Site Pages"` to list pages. Note the integer `Id` field of the desired page (not the GUID).',
    '- Call `getSitePageContents` with that `pageId` to retrieve the page HTML (`CanvasContent1`, `WikiField`).',
    '',
    '## Search',
    '- Call `search` with a KQL `query` string.',
    '- Use `from` and `size` for pagination (offset / page-size).',
    '',
    '## Escape hatch',
    '- Use `callRestApi` for any SharePoint REST endpoint not covered by the dedicated actions.',
    '- `path` must start with `_api/` (no leading slash), e.g. `_api/web/title`.',
    '- Prefer the dedicated actions when they cover the use case.',
  ].join('\n'),

  test: {
    description: i18n.translate('core.kibanaConnectorSpecs.sharepointServer.test.description', {
      defaultMessage: 'Verifies SharePoint Server connection by fetching the site title.',
    }),
    handler: async (ctx) => {
      ctx.log.debug('SharePoint Server test handler');
      try {
        const { siteUrl } = ctx.config as { siteUrl: string };
        const response = await ctx.client.get(`${normalizeUrl(siteUrl)}/_api/web/title`, {
          headers: ODATA_HEADERS,
        });
        const title = response.data?.value ?? 'Unknown';
        return {
          ok: true,
          message: `Successfully connected to SharePoint Server: ${title}`,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { ok: false, message };
      }
    },
  },
};
