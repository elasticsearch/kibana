/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Tavily MCP Connector (v2)
 *
 * An MCP-native v2 connector that connects to the Tavily MCP server.
 *
 * Auth: Bearer token (API key)
 */

import { i18n } from '@kbn/i18n';
import { z, lazySchema } from '@kbn/zod/v4';
import { UISchemas, type ConnectorSpec } from '../../connector_spec';
import { withMcpClient, callToolContent, callToolJson } from '../../lib/mcp';
import type { CallToolInput, CrawlInput, ExtractInput, MapInput, SearchInput } from './types';
import {
  ListToolsInputSchema,
  SearchInputSchema,
  ExtractInputSchema,
  CrawlInputSchema,
  MapInputSchema,
  CallToolInputSchema,
} from './types';

const TAVILY_MCP_SERVER_URL = 'https://mcp.tavily.com/mcp/';

export const TavilyConnector: ConnectorSpec = {
  metadata: {
    id: '.tavily_mcp',
    displayName: 'Tavily',
    description: i18n.translate('core.kibanaConnectorSpecs.tavily.metadata.description', {
      defaultMessage: 'Search the web and extract content from pages using Tavily',
    }),
    minimumLicense: 'enterprise',
    isTechnicalPreview: true,
    supportedFeatureIds: ['workflows', 'agentBuilder'],
  },

  auth: {
    types: ['bearer'],
  },

  schema: lazySchema(() =>
    z.object({
      serverUrl: UISchemas.url()
        .default(TAVILY_MCP_SERVER_URL)
        .describe('Tavily MCP Server URL')
        .meta({
          widget: 'text',
          placeholder: 'https://mcp.tavily.com/mcp/',
          hidden: true,
          label: i18n.translate('connectorSpecs.tavily.config.serverUrl.label', {
            defaultMessage: 'MCP Server URL',
          }),
          helpText: i18n.translate('connectorSpecs.tavily.config.serverUrl.helpText', {
            defaultMessage: 'The URL of the Tavily MCP server.',
          }),
        }),
    })
  ),

  validateUrls: {
    fields: ['serverUrl'],
  },

  actions: {
    tavilySearch: {
      isTool: true,
      description:
        'Search the web for current information on any topic using Tavily. Returns a list of relevant web pages with titles, URLs, snippets, and relevance scores. Use this when you need up-to-date information, news, or answers to factual questions that may not be in your training data.',
      input: SearchInputSchema,
      handler: async (ctx, input: SearchInput) => {
        return callToolJson(ctx, 'tavily_search', {
          query: input.query,
          max_results: input.max_results,
          search_depth: input.search_depth,
          include_raw_content: input.include_raw_content,
        });
      },
    },

    tavilyExtract: {
      isTool: true,
      description:
        'Extract and retrieve the full text content from one or more web page URLs using Tavily. Use this when you have specific URLs and need to read their content — for example, to summarize an article, answer questions about a page, or process structured data from a known source. Prefer this over tavilySearch when you already know the exact URLs.',
      input: ExtractInputSchema,
      handler: async (ctx, input: ExtractInput) => {
        return callToolJson(ctx, 'tavily_extract', {
          urls: input.urls,
          extract_depth: input.extract_depth,
          include_images: input.include_images,
        });
      },
    },

    tavilyCrawl: {
      isTool: true,
      description:
        'Crawl a website starting from a root URL, following links and extracting page content with configurable depth and breadth. Returns the text content of each discovered page. Use this when you need to ingest content from an entire site or section — for example, to build a knowledge base from documentation, scan a product catalog, or audit a set of pages. For just a list of URLs without content, use tavilyMap instead.',
      input: CrawlInputSchema,
      handler: async (ctx, input: CrawlInput) => {
        return callToolJson(ctx, 'tavily_crawl', {
          url: input.url,
          max_depth: input.max_depth,
          max_breadth: input.max_breadth,
          limit: input.limit,
          instructions: input.instructions,
          extract_depth: input.extract_depth,
        });
      },
    },

    tavilyMap: {
      isTool: true,
      description:
        "Map a website's structure by returning a list of URLs discovered starting from a base URL, without fetching page content. Use this to understand the shape of a site, find relevant sub-pages to later extract or crawl, or enumerate available resources. For retrieving actual page content, use tavilyCrawl instead.",
      input: MapInputSchema,
      handler: async (ctx, input: MapInput) => {
        return callToolJson(ctx, 'tavily_map', {
          url: input.url,
          max_depth: input.max_depth,
          max_breadth: input.max_breadth,
          limit: input.limit,
          instructions: input.instructions,
        });
      },
    },

    listTools: {
      isTool: true,
      description:
        'List all tools available on the Tavily MCP server. Use this to discover available capabilities.',
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
        'Call any tool on the Tavily MCP server directly by name. Use this as an escape hatch when a specific tool is not yet exposed as a named action.',
      input: CallToolInputSchema,
      handler: async (ctx, input: CallToolInput) => {
        return callToolContent(ctx, input.name, input.arguments);
      },
    },
  },

  test: {
    description: i18n.translate('connectorSpecs.tavily.test.description', {
      defaultMessage: 'Verifies connection to the Tavily MCP server by listing available tools.',
    }),
    handler: async (ctx) => {
      return withMcpClient(ctx, async (mcp) => {
        const { tools } = await mcp.listTools();
        return {
          ok: true,
          message: `Connected to Tavily MCP server. ${tools.length} tools available.`,
        };
      });
    },
  },

  skill: [
    'Tavily — cross-action guidance for web research.',
    '',
    'Typical pattern for researching an unfamiliar site:',
    '  1. tavilyMap — discover available URLs.',
    '  2. Review the URL list to identify relevant pages.',
    '  3. tavilyExtract — fetch content from the specific pages that matter.',
    '',
    'Use tavilyCrawl instead of map+extract when you need broad coverage and cannot review URLs first.',
  ].join('\n'),
};
