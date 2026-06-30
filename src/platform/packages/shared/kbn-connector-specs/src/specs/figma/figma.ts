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
import type * as Figma from './types';
const FIGMA_API_BASE = 'https://api.figma.com';

const FILE_PATH_PREFIXES = ['design', 'file', 'board', 'proto', 'slides'] as const;
const FILE_PATH_PREFIX_SET: Set<string> = new Set(FILE_PATH_PREFIXES);
const FILE_KEY_REGEX = /^[0-9a-zA-Z_-]+$/;

export const FigmaConnector: ConnectorSpec = {
  metadata: {
    id: '.figma',
    displayName: 'Figma',
    description: i18n.translate('core.kibanaConnectorSpecs.figma.metadata.description', {
      defaultMessage:
        'Browse Figma design files, inspect structure, render images, and explore team projects',
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
          authorizationUrl: 'https://www.figma.com/oauth',
          tokenUrl: 'https://api.figma.com/v1/oauth/token',
          scope: 'current_user:read file_content:read projects:read',
        },
      },
      { type: 'api_key_header', defaults: { headerField: 'X-Figma-Token' } },
    ],
  },

  actions: {
    // https://developers.figma.com/docs/rest-api/file-endpoints/#get-file
    // https://developers.figma.com/docs/rest-api/file-endpoints/#get-file-nodes
    // Response always includes components and styles maps alongside the document tree.
    getFile: {
      isTool: true,
      description:
        "Get a Figma file's structure, metadata, components, and styles. " +
        'File keys appear in Figma URLs as the segment after the file type: ' +
        'https://www.figma.com/:file_type/:file_key/:file_name — valid file_type values are ' +
        'design, file, board, proto, and slides. If the user provides a Figma URL, extract the ' +
        'file key directly from it instead of browsing through teams and projects. ' +
        'Use depth to control how deep into the document tree to traverse (e.g., depth=1 returns ' +
        'only pages, depth=2 returns pages and top-level objects). Optionally pass nodeIds to ' +
        'retrieve only specific nodes and their subtrees. The response includes the document tree, ' +
        'a components map, and a styles map.',
      input: lazySchema(() =>
        z.object({
          fileKey: z
            .string()
            .describe('File key from the Figma file URL (e.g. from figma.com/file/FILE_KEY/...)'),
          nodeIds: z
            .string()
            .optional()
            .describe('Comma-separated node IDs to retrieve specific nodes (e.g. "1:2,1:3")'),
          depth: z
            .number()
            .optional()
            .describe(
              'Tree depth: 1 = pages only, 2 = pages + top-level objects; omit for full tree'
            ),
        })
      ),
      handler: async (ctx, input: Figma.GetFileInput) => {
        const params: Record<string, string | number> = {};
        if (input.depth !== undefined) {
          params.depth = input.depth;
        }

        if (input.nodeIds) {
          params.ids = input.nodeIds;
          const response = await ctx.client.get(
            `${FIGMA_API_BASE}/v1/files/${input.fileKey}/nodes`,
            { params }
          );
          return response.data;
        }

        const response = await ctx.client.get(`${FIGMA_API_BASE}/v1/files/${input.fileKey}`, {
          params,
        });
        return response.data;
      },
    },

    // https://developers.figma.com/docs/rest-api/file-endpoints/#get-image
    renderNodes: {
      isTool: true,
      description:
        'Render Figma nodes as images. Provide a file key and one or more node IDs to get ' +
        'temporary image URLs (valid for 30 days). Supports PNG, JPG, SVG, and PDF formats. ' +
        'Use scale (0.01 to 4) to control resolution. Node IDs can be found in Figma URLs ' +
        '(?node-id=1:2) or from the getFile action output.',
      input: lazySchema(() =>
        z.object({
          fileKey: z.string().describe('File key from the Figma file URL'),
          nodeIds: z
            .string()
            .describe(
              'Comma-separated node IDs to render (e.g. "1:2,1:3"); find in URL ?node-id= or get_file output'
            ),
          format: z
            .enum(['png', 'jpg', 'svg', 'pdf'])
            .default('png')
            .describe('Image format (default: png)'),
          scale: z
            .number()
            .min(0.01)
            .max(4)
            .default(1)
            .describe('Scale factor between 0.01 and 4 (default: 1)'),
        })
      ),
      handler: async (ctx, input: Figma.RenderNodesInput) => {
        const params: Record<string, string | number> = { ids: input.nodeIds };
        if (input.format) {
          params.format = input.format;
        }
        if (input.scale !== undefined) {
          params.scale = input.scale;
        }

        const response = await ctx.client.get(`${FIGMA_API_BASE}/v1/images/${input.fileKey}`, {
          params,
        });
        return response.data;
      },
    },

    // https://developers.figma.com/docs/rest-api/projects-endpoints/#get-project-files
    listProjectFiles: {
      isTool: true,
      description:
        'List all files in a Figma project. Returns file names, keys, thumbnail URLs, and ' +
        'last modified dates. Use the file keys from the results with the getFile or ' +
        'renderNodes actions to inspect individual files.',
      input: lazySchema(() =>
        z.object({
          projectId: z
            .string()
            .describe('Figma project ID (from list with type teamProjects or project URL)'),
        })
      ),
      handler: async (ctx, input: Figma.ListProjectFilesInput) => {
        const response = await ctx.client.get(
          `${FIGMA_API_BASE}/v1/projects/${input.projectId}/files`,
          {}
        );
        return response.data;
      },
    },

    // https://developers.figma.com/docs/rest-api/projects-endpoints/#get-team-projects
    listTeamProjects: {
      isTool: true,
      description:
        'List all projects in a Figma team. Returns project names and IDs alongside the ' +
        'teamId (so it can be reused in later steps). Use the project IDs with listProjectFiles ' +
        'to browse files. Provide either teamId (from the team page URL, e.g. figma.com/team/123/Team-Name) ' +
        'or a full Figma team page url from which the team ID will be extracted. If neither is ' +
        'available in the conversation context, ask the user to provide one.',
      input: lazySchema(() =>
        z.object({
          teamId: z
            .string()
            .optional()
            .describe(
              'Figma team ID from the team page URL. If you do not have it, use url instead or ask the user to paste the team page URL (e.g. figma.com/team/123/Team-Name).'
            ),
          url: z
            .string()
            .optional()
            .describe(
              'Figma team page URL. Provide this if teamId is not available; the team ID will be extracted. If neither teamId nor url is provided, ask the user to paste the team page URL.'
            ),
        })
      ),
      handler: async (ctx, input: Figma.ListTeamProjectsInput) => {
        let teamId = input.teamId;
        if (teamId === undefined && input.url !== undefined) {
          const parsed = parseFigmaUrlInternal(input.url);
          if (parsed.error !== undefined) {
            throw new Error(parsed.error);
          }
          teamId = parsed.teamId;
          if (teamId === undefined || teamId === '') {
            throw new Error('URL did not match a file or team page');
          }
        }
        if (teamId === undefined || teamId === '') {
          throw new Error(
            'Either teamId or url is required. If you do not have the team ID, ask the user to paste the Figma team page URL.'
          );
        }
        const response = await ctx.client.get(`${FIGMA_API_BASE}/v1/teams/${teamId}/projects`, {});
        return { ...response.data, teamId };
      },
    },

    // https://developers.figma.com/docs/rest-api/users-endpoints/#get-me
    whoAmI: {
      isTool: true,
      description:
        'Get the currently authenticated Figma user. Returns the user ID, handle, email, ' +
        'and profile image URL for the API credentials in use. Useful for verifying which ' +
        'Figma account is connected.',
      input: lazySchema(() => z.object({})),
      handler: async (ctx): Promise<Figma.WhoAmIResult> => {
        const response = await ctx.client.get(`${FIGMA_API_BASE}/v1/me`);
        const data = response.data as Figma.WhoAmIResult;
        return {
          id: data.id,
          handle: data.handle,
          email: data.email,
          img_url: data.img_url,
        };
      },
    },
  },

  skill: [
    'Use whoAmI to confirm which Figma account is connected before performing other actions.',
    'Typical discovery workflow: listTeamProjects → listProjectFiles → getFile → renderNodes.',
    'If the user provides a Figma URL, extract the file key directly and skip the discovery steps.',
  ].join('\n'),

  test: {
    description: i18n.translate('core.kibanaConnectorSpecs.figma.test.description', {
      defaultMessage: 'Verifies Figma API connectivity by fetching current user information',
    }),
    handler: async (ctx) => {
      try {
        const response = await ctx.client.get(`${FIGMA_API_BASE}/v1/me`);
        return {
          ok: true,
          message: `Successfully connected to Figma as ${
            response.data.handle || response.data.email || 'user'
          }`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          message: `Failed to connect to Figma API: ${errorMessage}`,
        };
      }
    },
  },
};

/** Result of parsing a Figma URL (e.g. team page). Used only by parseFigmaUrlInternal. */
interface ParseFigmaUrlResult {
  fileKey?: string;
  teamId?: string;
  nodeId?: string;
  error?: string;
  code?: 'INVALID_URL' | 'NOT_FIGMA' | 'NO_MATCH';
}

/** Extracts teamId from a Figma team page URL. Used by listTeamProjects when url is provided. */
function parseFigmaUrlInternal(urlString: string): ParseFigmaUrlResult {
  const result: ParseFigmaUrlResult = {};
  try {
    const url = new URL(urlString.trim());
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'figma.com' && !hostname.endsWith('.figma.com')) {
      return { error: 'Not a Figma URL', code: 'NOT_FIGMA' };
    }
    const pathSegments = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (pathSegments.length >= 2 && pathSegments[0] === 'team') {
      result.teamId = pathSegments[1];
    }
    const firstSegment = pathSegments[0];
    if (
      pathSegments.length >= 2 &&
      firstSegment !== undefined &&
      FILE_PATH_PREFIX_SET.has(firstSegment)
    ) {
      const candidate = pathSegments[1];
      if (candidate && FILE_KEY_REGEX.test(candidate)) {
        result.fileKey = candidate;
      }
    }
    const nodeIdParam = url.searchParams.get('node-id');
    if (nodeIdParam) {
      result.nodeId = nodeIdParam.replace(/-/g, ':');
    }
    if (result.fileKey === undefined && result.teamId === undefined) {
      result.error = 'URL did not match a file or team page';
      result.code = 'NO_MATCH';
    }
  } catch {
    return { error: 'Invalid URL', code: 'INVALID_URL' };
  }
  return result;
}
