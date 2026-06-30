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
import type * as Notion from './types';
export const NotionConnector: ConnectorSpec = {
  metadata: {
    id: '.notion',
    displayName: 'Notion',
    description: i18n.translate('core.kibanaConnectorSpecs.notion.metadata.description', {
      defaultMessage: 'Explore content and databases in Notion',
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
          authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
          tokenUrl: 'https://api.notion.com/v1/oauth/token',
        },
      },
      { type: 'bearer', isLegacy: true, defaults: {} },
    ],
    headers: {
      'Notion-Version': '2025-09-03',
    },
  },

  actions: {
    // https://developers.notion.com/reference/post-search
    searchPageOrDSByTitle: {
      isTool: true,
      description:
        'Search for Notion pages or data sources (databases) whose title contains a given string. Use this to discover what pages or databases exist before fetching their content or querying their rows.',
      input: lazySchema(() =>
        z.object({
          query: z
            .string()
            .describe(
              'The text string to search for within page or data source titles. Example: "Engineering roadmap"'
            ),
          queryObjectType: z
            .enum(['page', 'data_source'])
            .describe(
              'Whether to search for pages ("page") or databases/data sources ("data_source"). Use "page" to find wiki-style content, and "data_source" to find structured databases.'
            ),
          startCursor: z
            .string()
            .optional()
            .describe(
              'Pagination cursor returned from a previous search response. Pass this to retrieve the next page of results.'
            ),
          pageSize: z
            .number()
            .max(100)
            .default(10)
            .describe(
              'Maximum number of results to return per page. Defaults to 10 if not specified.'
            ),
        })
      ),
      handler: async (ctx, input: Notion.SearchByTitleInput) => {
        const response = await ctx.client.post('https://api.notion.com/v1/search', {
          query: input.query,
          filter: {
            value: input.queryObjectType,
            property: 'object',
          },
          ...(input.startCursor && { start_cursor: input.startCursor }),
          ...(input.pageSize && { page_size: input.pageSize }),
        });

        return response.data;
      },
    },

    // https://developers.notion.com/reference/retrieve-a-page
    getPage: {
      isTool: true,
      description:
        'Given the ID of a Notion page, retrieve its metadata — including title, properties, parent, created/edited timestamps, and URL. Use this after finding a page ID via searchPageOrDSByTitle.',
      input: lazySchema(() =>
        z.object({
          pageId: z
            .string()
            .describe(
              'The Notion page ID to retrieve. This is the UUID found in the page URL or returned by searchPageOrDSByTitle. Example: "5b2c3d4e-1234-5678-abcd-ef0123456789"'
            ),
        })
      ),
      handler: async (ctx, input: Notion.GetPageInput) => {
        const response = await ctx.client.get(
          `https://api.notion.com/v1/pages/${input.pageId}`,
          {}
        );
        return response.data;
      },
    },

    // https://developers.notion.com/reference/retrieve-a-data-source
    getDataSource: {
      isTool: true,
      description:
        'Given the ID of a Notion data source (database), retrieve its schema — including the names, types, and options for all columns/properties. Use this before querying rows so you know what filters and fields are available.',
      input: lazySchema(() =>
        z.object({
          dataSourceId: z
            .string()
            .describe(
              'The Notion data source (database) ID to inspect. This is the UUID found in the database URL or returned by searchPageOrDSByTitle. Example: "a1b2c3d4-5678-90ab-cdef-1234567890ab"'
            ),
        })
      ),
      handler: async (ctx, input: Notion.GetDataSourceInput) => {
        const response = await ctx.client.get(
          `https://api.notion.com/v1/data_sources/${input.dataSourceId}`,
          {}
        );
        return response.data;
      },
    },

    // https://developers.notion.com/reference/query-a-data-source
    queryDataSource: {
      isTool: true,
      description:
        'Given the ID of a Notion data source (database), query its rows. Returns up to 10 rows by default. Supports filtering via the Notion filter JSON format (see https://developers.notion.com/reference/filter-data-source-entries) and cursor-based pagination. Use getDataSource first to understand the available columns and their types before constructing a filter.',
      input: lazySchema(() =>
        z.object({
          dataSourceId: z
            .string()
            .describe(
              'The Notion data source (database) ID to query. Example: "a1b2c3d4-5678-90ab-cdef-1234567890ab"'
            ),
          filter: z
            .string()
            .optional()
            .describe(
              'Optional filter expressed as a JSON string following the Notion filter format (https://developers.notion.com/reference/filter-data-source-entries). Each filter targets one property by name and applies a type-specific condition. Common patterns:\n' +
                '- Status: {"property":"Status","status":{"equals":"In progress"}}\n' +
                '- Checkbox: {"property":"Done","checkbox":{"equals":true}}\n' +
                '- Text contains: {"property":"Name","rich_text":{"contains":"keyword"}}\n' +
                '- Date after: {"property":"Due","date":{"after":"2024-01-01"}}\n' +
                '- Compound (AND): {"and":[{...},{...}]}\n' +
                '- Compound (OR): {"or":[{...},{...}]}\n' +
                'Always call getDataSource first to discover the available property names and their types before constructing a filter. Omit to return all rows up to pageSize.'
            ),
          startCursor: z
            .string()
            .optional()
            .describe(
              'Pagination cursor returned from a previous queryDataSource response. Pass this to fetch the next page of rows.'
            ),
          pageSize: z
            .number()
            .max(100)
            .default(10)
            .describe(
              'Maximum number of rows to return. Defaults to 10 if not specified. Maximum allowed by Notion is 100.'
            ),
        })
      ),
      handler: async (ctx, input: Notion.QueryDataSourceInput) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let requestData: Record<string, any> = {
          page_size: input.pageSize,
          start_cursor: input.startCursor,
        };
        if (input.filter) {
          requestData = { ...requestData, filter: JSON.parse(input.filter) };
        }

        const response = await ctx.client.post(
          `https://api.notion.com/v1/data_sources/${input.dataSourceId}/query`,
          requestData
        );
        return response.data;
      },
    },
  },

  skill: [
    'Use this connector to explore and retrieve content from Notion workspaces.',
    '',
    '## Discovery',
    'Use searchPageOrDSByTitle to find pages or databases by title before fetching details.',
    'Set queryObjectType to "page" for wiki-style pages, or "data_source" for structured databases.',
    '',
    '## Pages',
    'Workflow: searchPageOrDSByTitle (queryObjectType="page") → getPage',
    'getPage returns metadata: title, properties, parent, URL, created/last-edited timestamps.',
    '',
    '## Data Sources (Databases)',
    'Workflow: searchPageOrDSByTitle (queryObjectType="data_source") → getDataSource → queryDataSource',
    'getDataSource returns the schema: column names, types, and options — inspect this before constructing filters.',
    'queryDataSource returns rows from the database, with optional filtering and pagination.',
    '',
    '## Pagination',
    'Both searchPageOrDSByTitle and queryDataSource support cursor-based pagination.',
    'Pass startCursor from the previous response to retrieve the next page.',
    'Use pageSize to control results per page; maximum allowed by Notion is 100.',
  ].join('\n'),

  test: {
    description: i18n.translate('core.kibanaConnectorSpecs.notion.test.description', {
      defaultMessage: 'Verifies Notion connection by fetching metadata about given data source',
    }),
    // TODO: might need to accept some input here in order to pass to the API endpoint to test
    // if listing all users feels a bit too much
    handler: async (ctx) => {
      ctx.log.debug('Notion test handler');

      try {
        const response = await ctx.client.get('https://api.notion.com/v1/users');
        const numOfUsers = response.data.results.length;
        return {
          ok: true,
          message: `Successfully connected to Notion API: found ${numOfUsers} users`,
        };
      } catch (error) {
        return { ok: false, message: error.message };
      }
    },
  },
};
