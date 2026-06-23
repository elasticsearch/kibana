/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { ChatCompletionTokenCount, InferenceClient } from '@kbn/inference-common';
import type { GeneratedSignificantEventQuery, Streams } from '@kbn/streams-schema';
import {
  QUERY_TYPE_STATS,
  ensureMetadata,
  STREAMS_SIG_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID,
  STREAMS_SIGNIFICANT_EVENTS_INFERENCE_PARENT_FEATURE_ID,
} from '@kbn/streams-schema';
import { generateSignificantEvents } from '@kbn/streams-ai';
import type { SignificantEventsToolUsage } from '@kbn/streams-ai';
import type { ToolCallback, ToolDefinition } from '@kbn/inference-common';
import type { KnowledgeIndicatorClient } from '../streams/ki';
import type { MemoryDiscoveryTools } from './memory_discovery_tools';
import type { SemanticCodeSearchTools } from '../semantic_code_search_grounding/semantic_code_search_tools';

/**
 * Step budget for the query-generation reasoning agent when semantic code
 * search grounding tools are active. Higher than the default (6 with memory
 * tools) because verifying queries against source code — and, when a
 * repository is linked, its git history — adds tool round-trips.
 */
const MAX_STEPS_WITH_SEMANTIC_CODE_SEARCH_TOOLS = 10;

interface Params {
  definition: Streams.all.Definition;
  connectorId: string;
  systemPrompt: string;
  maxExistingQueriesForContext?: number;
}

interface Dependencies {
  inferenceClient: InferenceClient;
  kiClient: KnowledgeIndicatorClient;
  logger: Logger;
  signal: AbortSignal;
  esClient: ElasticsearchClient;
  memoryTools?: MemoryDiscoveryTools;
  semanticCodeSearchTools?: SemanticCodeSearchTools;
}

export async function generateSignificantEventDefinitions(
  params: Params,
  dependencies: Dependencies
): Promise<{
  queries: GeneratedSignificantEventQuery[];
  tokensUsed: ChatCompletionTokenCount;
  toolUsage: SignificantEventsToolUsage;
}> {
  const { definition, connectorId, systemPrompt, maxExistingQueriesForContext } = params;
  const {
    inferenceClient,
    kiClient,
    logger,
    signal,
    esClient,
    memoryTools,
    semanticCodeSearchTools,
  } = dependencies;

  const discoveryTools = [memoryTools, semanticCodeSearchTools].filter(
    (toolset): toolset is MemoryDiscoveryTools | SemanticCodeSearchTools => toolset !== undefined
  );

  const additionalTools: Record<string, ToolDefinition> = Object.assign(
    {},
    ...discoveryTools.map((toolset) => toolset.tools)
  );
  const additionalToolCallbacks: Record<string, ToolCallback> = Object.assign(
    {},
    ...discoveryTools.map((toolset) => toolset.callbacks)
  );
  const hasAdditionalTools = discoveryTools.length > 0;

  const combinedSystemPrompt = discoveryTools.reduce(
    (prompt, toolset) => `${prompt}\n${toolset.promptSnippet}`,
    systemPrompt
  );

  const { [definition.name]: existingLinks } = await kiClient.getStreamToQueryLinksMap([
    definition.name,
  ]);

  const existingQueries = existingLinks.map(({ query: q }) => ({
    id: q.id,
    title: q.title,
    type: q.type,
    severity_score: q.severity_score,
    description: q.description.slice(0, 200),
    esql: q.esql.query,
  }));

  const boundInferenceClient = inferenceClient.bindTo({
    connectorId,
    metadata: {
      connectorTelemetry: {
        pluginId: STREAMS_SIG_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID,
        aggregateBy: STREAMS_SIGNIFICANT_EVENTS_INFERENCE_PARENT_FEATURE_ID,
      },
    },
  });

  const { queries, tokensUsed, toolUsage } = await generateSignificantEvents({
    stream: definition,
    esClient,
    inferenceClient: boundInferenceClient,
    logger,
    signal,
    systemPrompt: combinedSystemPrompt,
    getFeatures: async (filters) => {
      const response = await kiClient.getFeatures(definition.name, filters);
      return response.hits;
    },
    additionalTools: hasAdditionalTools ? additionalTools : undefined,
    additionalToolCallbacks: hasAdditionalTools ? additionalToolCallbacks : undefined,
    existingQueries,
    maxExistingQueriesForContext,
    maxSteps: semanticCodeSearchTools ? MAX_STEPS_WITH_SEMANTIC_CODE_SEARCH_TOOLS : undefined,
  });

  return {
    queries: queries.map((query) => ({
      type: query.type,
      title: query.title,
      description: query.description,
      esql: {
        query: query.type === QUERY_TYPE_STATS ? query.esql : ensureMetadata(query.esql),
      },
      severity_score: query.severity_score,
      evidence: query.evidence,
      replaces: query.replaces,
      features: query.features,
    })),
    tokensUsed,
    toolUsage,
  };
}
