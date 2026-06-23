/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Brave Search Connector
 *
 * Provides web search capabilities using the Brave Search API.
 * Features:
 * - Web search with customizable parameters
 * - Support for localization and safe search
 */

import { z, lazySchema } from '@kbn/zod/v4';
import { i18n } from '@kbn/i18n';
import type { ConnectorSpec } from '../../connector_spec';

const DEFAULT_COUNT = 10;
const DEFAULT_OFFSET = 0;

export const BraveSearchConnector: ConnectorSpec = {
  metadata: {
    id: '.brave-search',
    displayName: 'Brave Search',
    description: i18n.translate('connectorSpecs.braveSearch.metadata.description', {
      defaultMessage: 'Search the web using Brave Search API for privacy-focused results',
    }),
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['workflows', 'agentBuilder'],
  },

  auth: {
    types: [{ type: 'api_key_header', defaults: { headerField: 'X-Subscription-Token' } }],
  },

  actions: {
    webSearch: {
      isTool: true,
      description:
        'Search the web using Brave Search. Returns a list of results with titles, URLs, and descriptions for a given query. Supports pagination via count and offset parameters.',
      input: lazySchema(() =>
        z.object({
          q: z.string().describe('Search query'),
          count: z
            .number()
            .int()
            .min(1)
            .max(20)
            .optional()
            .default(DEFAULT_COUNT)
            .describe('Number of results to return (max 20)'),
          offset: z
            .number()
            .int()
            .min(0)
            .optional()
            .default(DEFAULT_OFFSET)
            .describe('Result offset for pagination'),
        })
      ),
      output: lazySchema(() =>
        z.object({
          query: z.any().describe('Original query information'),
          results: z.array(z.any()).describe('Array of search results'),
          type: z.string().describe('Search type'),
        })
      ),
      handler: async (ctx, input) => {
        const typedInput = input as {
          q: string;
          count?: number;
          offset?: number;
        };

        const params: Record<string, string | number> = {
          q: typedInput.q,
          count: typedInput.count || DEFAULT_COUNT,
          offset: typedInput.offset || DEFAULT_OFFSET,
        };

        const response = await ctx.client.get('https://api.search.brave.com/res/v1/web/search', {
          params,
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
          },
        });

        return {
          query: response.data.query,
          results: response.data.web?.results || [],
          type: response.data.type,
        };
      },
    },
  },

  test: {
    handler: async (ctx) => {
      try {
        // Perform a simple test search
        await ctx.client.get('https://api.search.brave.com/res/v1/web/search', {
          params: {
            q: 'test',
            count: 1,
          },
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
          },
        });
        return {
          ok: true,
          message: 'Successfully connected to Brave Search API',
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          message: `Failed to connect to Brave Search API: ${errorMessage}`,
        };
      }
    },
    description: i18n.translate('connectorSpecs.braveSearch.test.description', {
      defaultMessage: 'Verifies Brave Search API key and connection',
    }),
  },
};
