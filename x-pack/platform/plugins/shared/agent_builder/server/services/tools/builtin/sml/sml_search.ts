/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { getToolResultId, createErrorResult } from '@kbn/agent-builder-server';
import {
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  CONTEXT_ENGINE_ENABLED_SETTING_ID,
} from '@kbn/management-settings-ids';
import { SmlSearchFilterType } from '@kbn/agent-context-layer-plugin/server';
import type { SmlToolsOptions } from './types';

const smlSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(512)
    .describe(
      'Natural-language query describing what you are looking for. Combines BM25 (lexical) and semantic ' +
        'retrieval via reciprocal rank fusion, so phrasing that does not literally appear in the asset can ' +
        'still match. Pass "*" to return all available assets (e.g. for an inventory check).'
    ),
  size: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum number of results to return (defaults to 10).'),
  types: z
    .array(z.string().max(200))
    .max(20)
    .optional()
    .describe(
      'Optional. Restrict results to one or more SML record types (e.g. ["dashboard", "lens"]). ' +
        'ANY semantics — a record matches if its `type` is in this list. Omit to search all types.'
    ),
  tags: z
    .array(z.string().max(200))
    .max(20)
    .optional()
    .describe(
      'Optional. Restrict results to records with any of these tags (e.g. ["production", "sales"]). ' +
        'ANY semantics. Omit to ignore tags.'
    ),
});

/**
 * Creates the sml_search tool.
 * Searches the Semantic Metadata Layer for items matching a query.
 */
export const createSmlSearchTool = ({
  getAgentContextLayer,
}: SmlToolsOptions): BuiltinToolDefinition<typeof smlSearchSchema> => ({
  id: platformCoreTools.smlSearch,
  type: ToolType.builtin,
  description:
    'Search the Semantic Metadata Layer (SML) for Kibana assets such as saved visualizations, dashboards, ' +
    'workflows, connectors, and more. Semantic search — concept queries and synonyms match even when the ' +
    'literal terms are absent.\n\n' +
    'When to use this tool:\n' +
    "- The user asks about something that likely exists as a Kibana asset but you don't know its exact title.\n" +
    '- You need to discover what is available before deciding how to proceed.\n' +
    '- You want to surface candidates to attach to the conversation (then pass chunk_id to sml_attach).\n\n' +
    'Each result includes: chunk_id, attachment_id, attachment_type, type, title, description (when present), ' +
    'tags, references (URI strings to related SML records), and content (the full indexed content for the record).\n\n' +
    'Examples:\n' +
    '1. Plain natural-language query:\n' +
    '     { "query": "cpu usage over time for production hosts" }\n' +
    '2. Filtered by asset type and tag:\n' +
    '     { "query": "sales trends", "types": ["dashboard"], "tags": ["production"] }\n' +
    '3. Restrict to connectors (e.g. before calling a connector-aware tool):\n' +
    '     { "query": "github", "types": ["connector"] }\n' +
    '4. Wildcard inventory check:\n' +
    '     { "query": "*", "size": 50 }\n\n' +
    'To bring a result into the conversation as an attachment, pass its chunk_id to sml_attach.',
  schema: smlSearchSchema,
  tags: ['sml', 'search'],
  availability: {
    cacheMode: 'global',
    // SML lives inside Agent Builder, so it requires the Agent Builder experimental
    // flag in addition to the dedicated Context Engine flag. Both must be enabled.
    handler: async ({ uiSettings }) => {
      const [experimentalEnabled, contextEngineEnabled] = await Promise.all([
        uiSettings.get<boolean>(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID),
        uiSettings.get<boolean>(CONTEXT_ENGINE_ENABLED_SETTING_ID),
      ]);
      return experimentalEnabled && contextEngineEnabled
        ? { status: 'available' }
        : {
            status: 'unavailable',
            reason:
              'SML features require Agent Builder experimental features and the Context Engine to be enabled',
          };
    },
  },
  handler: async ({ query, size, types, tags }, context) => {
    const agentContextLayer = getAgentContextLayer();
    const { spaceId, esClient, request, agentConfiguration } = context;

    // Runtime-imposed scoping: the connector allow-list comes from the
    // resolved agent configuration. The LLM has no say in this — it's part
    // of the trust boundary.
    const connectorIds = agentConfiguration?.connector_ids;
    const scoping =
      connectorIds !== undefined
        ? { [SmlSearchFilterType.connector]: { ids: connectorIds } }
        : undefined;

    // Agent-discoverable filters: forwarded only when the LLM supplied them.
    const filters =
      (types && types.length > 0) || (tags && tags.length > 0)
        ? {
            ...(types && types.length > 0 ? { types } : {}),
            ...(tags && tags.length > 0 ? { tags } : {}),
          }
        : undefined;

    let searchResult;
    try {
      searchResult = await agentContextLayer.search({
        query,
        size,
        spaceId,
        esClient,
        request,
        constraints: scoping,
        filters,
      });
    } catch (error) {
      return {
        results: [
          createErrorResult({
            message: `SML search failed: ${(error as Error).message}`,
            metadata: { query },
          }),
        ],
      };
    }

    if (searchResult.results.length === 0) {
      return {
        results: [
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.other,
            data: {
              message: 'No results found in the Semantic Metadata Layer.',
              query,
              items: [],
            },
          },
        ],
      };
    }

    return {
      results: [
        {
          tool_result_id: getToolResultId(),
          type: ToolResultType.other,
          data: {
            items: searchResult.results.map((hit) => ({
              chunk_id: hit.id,
              attachment_id: hit.origin.uri,
              attachment_type: hit.type,
              type: hit.type,
              title: hit.title,
              content: hit.content,
              description: hit.description,
              tags: hit.tags,
              references: hit.references?.map((r) => r.uri),
            })),
          },
        },
      ],
    };
  },
});
