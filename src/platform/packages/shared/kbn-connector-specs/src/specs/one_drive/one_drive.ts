/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * OneDrive Connector
 *
 * Connects to Microsoft OneDrive via the Microsoft Graph API.
 * Supports browsing personal drives, searching files, reading content,
 * and listing shared files.
 *
 * Auth: OAuth 2.0 Authorization Code (Microsoft Entra ID / Azure AD)
 * Tenant-specific authorization and token URLs must be supplied by the user.
 */

import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';
import type { ConnectorSpec } from '../../connector_spec';
import type {
  GetFileContentInput,
  GetFileMetadataInput,
  GetItemChildrenInput,
  ListRecentFilesInput,
  ListSharedWithMeInput,
  SearchInput,
} from './types';
import {
  GetFileContentInputSchema,
  GetFileMetadataInputSchema,
  GetItemChildrenInputSchema,
  ListRecentFilesInputSchema,
  ListSharedWithMeInputSchema,
  SearchInputSchema,
} from './types';

const COMMON_SELECT = 'id,name,size,webUrl,file,folder,createdDateTime,lastModifiedDateTime';
const ITEM_CHILDREN_SELECT = `${COMMON_SELECT},@microsoft.graph.downloadUrl`;
const SEARCH_SELECT = `${COMMON_SELECT},parentReference`;
const FILE_METADATA_SELECT = `${COMMON_SELECT},parentReference,@microsoft.graph.downloadUrl`;
const REMOTE_ITEMS_SELECT = `${COMMON_SELECT},remoteItem`;

export const OneDrive: ConnectorSpec = {
  metadata: {
    id: '.one_drive',
    displayName: 'OneDrive',
    description: i18n.translate('core.kibanaConnectorSpecs.oneDrive.metadata.description', {
      defaultMessage:
        'Search files and folders, browse drives, read file content, and list files shared with you in Microsoft OneDrive',
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
          scope: 'Files.Read.All offline_access User.Read',
        },
        overrides: {
          meta: {
            scope: { hidden: true },
            authorizationUrl: {
              placeholder: 'https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/authorize',
              helpText: i18n.translate(
                'core.kibanaConnectorSpecs.oneDrive.auth.authorizationUrl.helpText',
                {
                  defaultMessage:
                    "Replace '{tenant-id}' with your Microsoft Entra (Azure AD) tenant ID: https://login.microsoftonline.com/my-tenant/oauth2/v2.0/authorize",
                }
              ),
            },
            tokenUrl: {
              placeholder: 'https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token',
              helpText: i18n.translate(
                'core.kibanaConnectorSpecs.oneDrive.auth.tokenUrl.helpText',
                {
                  defaultMessage:
                    "Replace '{tenant-id}' with your Microsoft Entra (Azure AD) tenant ID: https://login.microsoftonline.com/my-tenant/oauth2/v2.0/token",
                }
              ),
            },
          },
        },
      },
    ],
  },

  actions: {
    // ── Discovery ──────────────────────────────────────────────────────────────
    getMe: {
      isTool: true,
      description:
        'Retrieve details about the currently authenticated Microsoft account, including display ' +
        'name, email address, and user ID. Use this to confirm authentication is working and to ' +
        'identify which account is connected.',
      input: lazySchema(() => z.object({})),
      handler: async (ctx) => {
        const response = await ctx.client.get('https://graph.microsoft.com/v1.0/me', {
          params: { $select: 'id,displayName,mail,userPrincipalName' },
        });
        return response.data;
      },
    },

    getDrive: {
      isTool: true,
      description:
        "Retrieve metadata about the authenticated user's personal OneDrive, including quota " +
        'information (used space and total capacity), drive ID, and owner details. Use this to ' +
        'orient the agent before browsing files.',
      input: lazySchema(() => z.object({})),
      handler: async (ctx) => {
        const response = await ctx.client.get('https://graph.microsoft.com/v1.0/me/drive', {
          params: { $select: 'id,name,driveType,quota,owner' },
        });
        return response.data;
      },
    },

    // ── Browse ─────────────────────────────────────────────────────────────────
    getItemChildren: {
      isTool: true,
      description:
        'List the files and subfolders within a OneDrive folder. Pass an empty string or omit ' +
        'itemId to list the root of the drive. Use the item IDs returned here with getFileMetadata ' +
        'or getFileContent to drill into a specific file. ' +
        'If the response contains a nextPageToken field, pass it as pageToken to fetch the next page.',
      input: GetItemChildrenInputSchema,
      handler: async (ctx, input: GetItemChildrenInput) => {
        const url =
          input.itemId && input.itemId !== ''
            ? `https://graph.microsoft.com/v1.0/me/drive/items/${input.itemId}/children`
            : 'https://graph.microsoft.com/v1.0/me/drive/root/children';

        const response = await ctx.client.get(url, {
          params: {
            $select: ITEM_CHILDREN_SELECT,
            $top: input.top ?? 50,
            ...(input.pageToken ? { $skiptoken: input.pageToken } : {}),
          },
        });
        return withNextPageToken(response.data);
      },
    },

    // ── Search ─────────────────────────────────────────────────────────────────
    search: {
      isTool: true,
      description:
        'Search for files and folders in OneDrive by keyword. Searches across file names and ' +
        'content. Returns matching items with IDs, names, paths, and metadata. Use this as the ' +
        'primary way to locate a specific file before reading its content. ' +
        'If the response contains a nextPageToken field, pass it as pageToken to fetch the next page. ' +
        'For page 2+, pass the same query value alongside pageToken.',
      input: SearchInputSchema,
      handler: async (ctx, input: SearchInput) => {
        const url = input.query
          ? `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(
              input.query.replace(/'/g, "''")
            )}')`
          : 'https://graph.microsoft.com/v1.0/me/drive/root/search';
        const response = await ctx.client.get(url, {
          params: {
            $select: SEARCH_SELECT,
            $top: input.top ?? 25,
            ...(input.pageToken ? { $skiptoken: input.pageToken } : {}),
          },
        });
        return withNextPageToken(response.data);
      },
    },

    // ── Metadata ───────────────────────────────────────────────────────────────
    getFileMetadata: {
      isTool: true,
      description:
        'Get detailed metadata for a specific file or folder by its item ID. Returns name, size, ' +
        'content type, modification date, path, and a time-limited download URL. ' +
        'For items from your own drive (search, getItemChildren): pass itemId only. ' +
        'For items from listSharedWithMe or listRecentFiles that have a remoteItem property: ' +
        'pass remoteItem.id as itemId and remoteItem.parentReference.driveId as driveId — ' +
        'using the top-level id without driveId will 404.',
      input: GetFileMetadataInputSchema,
      handler: async (ctx, input: GetFileMetadataInput) => {
        const itemUrl = input.driveId
          ? `https://graph.microsoft.com/v1.0/drives/${input.driveId}/items/${input.itemId}`
          : `https://graph.microsoft.com/v1.0/me/drive/items/${input.itemId}`;
        const response = await ctx.client.get(itemUrl, {
          params: {
            $select: FILE_METADATA_SELECT,
          },
        });
        return response.data;
      },
    },

    // ── Content ────────────────────────────────────────────────────────────────
    getFileContent: {
      isTool: true,
      description:
        'Download the content of a file from OneDrive. Text files (.txt, .md, .csv, .json) are ' +
        'returned as a plain UTF-8 string. Binary files (PDFs, .docx, .xlsx, images) are returned ' +
        'base64-encoded. Check the `encoding` field in the response ("utf-8" or "base64") and the ' +
        '`mimeType` field to know how to interpret the `content` field. ' +
        'For items from listSharedWithMe or listRecentFiles that have a remoteItem property: ' +
        'pass remoteItem.id as itemId and remoteItem.parentReference.driveId as driveId. ' +
        'WARNING: Large files and binary formats produce very large payloads. Only call this when ' +
        'you have a plan to process the data (e.g. via an Elasticsearch ingest pipeline attachment processor).',
      input: GetFileContentInputSchema,
      handler: async (ctx, input: GetFileContentInput) => {
        const itemUrl = input.driveId
          ? `https://graph.microsoft.com/v1.0/drives/${input.driveId}/items/${input.itemId}/content`
          : `https://graph.microsoft.com/v1.0/me/drive/items/${input.itemId}/content`;
        const response = await ctx.client.get(itemUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        const rawContentType = String(response.headers?.['content-type'] ?? '');
        const mimeType = rawContentType.split(';')[0].trim();
        const isText = mimeType.startsWith('text/') || mimeType === 'application/json';
        return {
          mimeType,
          encoding: isText ? 'utf-8' : 'base64',
          content: isText ? buffer.toString('utf8') : buffer.toString('base64'),
        };
      },
    },

    // ── Shared ─────────────────────────────────────────────────────────────────
    listSharedWithMe: {
      isTool: true,
      description:
        "List files that others have shared with the authenticated user's OneDrive. " +
        'Items on external drives include a remoteItem property. To use getFileMetadata or ' +
        'getFileContent on those items, pass remoteItem.id as itemId and ' +
        'remoteItem.parentReference.driveId as driveId — the top-level id alone will 404. ' +
        'If the response contains a nextPageToken field, pass it as pageToken to fetch the next page.',
      input: ListSharedWithMeInputSchema,
      handler: async (ctx, input: ListSharedWithMeInput) => {
        const response = await ctx.client.get(
          'https://graph.microsoft.com/v1.0/me/drive/sharedWithMe',
          {
            params: {
              $select: REMOTE_ITEMS_SELECT,
              ...(input.pageToken ? { $skiptoken: input.pageToken } : {}),
            },
          }
        );
        return withNextPageToken(response.data);
      },
    },

    listRecentFiles: {
      isTool: true,
      description:
        'List files the authenticated user has recently accessed or modified. ' +
        'Files on external drives include a remoteItem property. To use getFileMetadata or ' +
        'getFileContent on those items, pass remoteItem.id as itemId and ' +
        'remoteItem.parentReference.driveId as driveId — the top-level id alone will 404. ' +
        'If the response contains a nextPageToken field, pass it as pageToken to fetch the next page.',
      input: ListRecentFilesInputSchema,
      handler: async (ctx, input: ListRecentFilesInput) => {
        const response = await ctx.client.get('https://graph.microsoft.com/v1.0/me/drive/recent', {
          params: {
            $select: REMOTE_ITEMS_SELECT,
            $top: 25,
            ...(input.pageToken ? { $skiptoken: input.pageToken } : {}),
          },
        });
        return withNextPageToken(response.data);
      },
    },
  },

  test: {
    description: i18n.translate('core.kibanaConnectorSpecs.oneDrive.test.description', {
      defaultMessage:
        'Verifies the OneDrive connection by fetching the authenticated user profile.',
    }),
    handler: async (ctx) => {
      try {
        const response = await ctx.client.get('https://graph.microsoft.com/v1.0/me', {
          params: { $select: 'displayName,mail' },
        });
        const { displayName, mail } = response.data as { displayName: string; mail: string };
        return {
          ok: true,
          message: `Connected to OneDrive as ${displayName} (${mail})`,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { ok: false, message };
      }
    },
  },

  skill: [
    '## OneDrive Connector — usage guidance',
    '',
    '### Finding files',
    'Use `search` to locate files by keyword across file names and content.',
    'Use `getItemChildren` to browse folder contents — pass an empty string for the root folder,',
    'or pass an item ID from a previous search/browse result for a subfolder.',
    '',
    '### Pagination',
    'search, getItemChildren, and listSharedWithMe support multi-page results.',
    'When more pages are available, the response includes a nextPageToken field.',
    'Pass that value as pageToken in the next call (with the same other parameters) to fetch the next page.',
    'For search: the Graph API ties the continuation token to the original query, so pass the same query alongside pageToken for page 2+.',
    '',
    '### Reading file content',
    'To read a file: call `search` or `getItemChildren` to find the item ID, then `getFileContent`.',
    'Use `getFileMetadata` first if you only need size, dates, or path — it avoids downloading the content.',
    'Before calling `getFileContent` on an unknown file, check its size in the metadata response.',
    'For PDFs and Office documents, prefer passing the file through an Elasticsearch ingest',
    'pipeline attachment processor rather than processing raw binary content in the agent context.',
    '',
    '### Shared and recent files — cross-drive item IDs',
    'Items from `listSharedWithMe` and `listRecentFiles` often live on external drives.',
    'These items have a `remoteItem` property in the response.',
    'To call `getFileMetadata` or `getFileContent` on them:',
    '  - Use `remoteItem.id` as `itemId` (NOT the top-level `id`)',
    '  - Use `remoteItem.parentReference.driveId` as `driveId`',
    'Using the top-level `id` without `driveId` will return a 404 — this is a Graph API limitation.',
    "Items from `search` and `getItemChildren` are always on the user's own drive and need no `driveId`.",
    '',
    '### Authentication',
    'Requires OAuth 2.0 Authorization Code flow with tenant-specific Microsoft Entra ID URLs.',
    'The user must supply the authorization URL and token URL with their Azure AD tenant ID.',
    'Required scopes: Files.Read.All, offline_access, User.Read.',
    '',
    '### Common gotchas',
    '- Item IDs are stable within a drive but are not portable across drives or tenants.',
    '- `@microsoft.graph.downloadUrl` fields in responses are time-limited pre-authenticated URLs.',
    '- The Graph API uses delta tokens for efficient change tracking — not exposed here yet.',
  ].join('\n'),
};

// The token to support paging is buried in the @odata.nextLink link as the $skipToken param, this extracts it to
// help the LLM more consistently work.
const withNextPageToken = (data: unknown): unknown => {
  let obj = data as Record<string, unknown>;
  const nextLink = obj['@odata.nextLink'];
  if (typeof nextLink === 'string') {
    const token = new URL(nextLink).searchParams.get('$skiptoken');
    if (token) {
      obj = { ...obj, nextPageToken: token };
    }
  }
  return obj;
};
