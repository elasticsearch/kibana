/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ElasticsearchClient,
  FeatureFlagsStart,
  KibanaRequest,
  Logger,
} from '@kbn/core/server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { InferenceClient } from '@kbn/inference-common';
import {
  getStreamTypeFromDefinition,
  STREAMS_SIG_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID,
  type SignificantEventsQueriesGenerationResult,
} from '@kbn/streams-schema';
import { isInferenceProviderError } from '@kbn/inference-common';
import type { SearchInferenceEndpointsPluginStart } from '@kbn/search-inference-endpoints/server';
import type { SignificantEventsToolUsage } from '@kbn/streams-ai';
import { isSignificantEventsMemoryEnabled } from '../memory/is_significant_events_memory_enabled';
import type { StreamsClient } from '../streams/client';
import type { KnowledgeIndicatorClient } from '../streams/ki';
import type { EbtTelemetryClient } from '../telemetry';
import { resolveConnectorForFeature } from '../../routes/utils/resolve_connector_for_feature';
import { formatInferenceProviderError } from '../../routes/utils/create_connector_sse_error';
import { PromptsConfigService } from './saved_objects/prompts_config_service';
import { generateSignificantEventDefinitions } from './generate_significant_events';
import { MemoryServiceImpl } from '../memory';
import { createMemoryDiscoveryTools } from './memory_discovery_tools';

export interface GenerateKIQueriesParams {
  streamName: string;
  connectorId?: string;
  maxExistingQueriesForContext?: number;
}

export interface GenerateKIQueriesDependencies {
  streamsClient: StreamsClient;
  inferenceClient: InferenceClient;
  soClient: SavedObjectsClientContract;
  kiClient: KnowledgeIndicatorClient;
  esClient: ElasticsearchClient;
  featureFlags: FeatureFlagsStart;
  searchInferenceEndpoints: SearchInferenceEndpointsPluginStart | undefined;
  request: KibanaRequest;
  logger: Logger;
  signal: AbortSignal;
  telemetry: EbtTelemetryClient;
}

export async function generateKIQueries(
  params: GenerateKIQueriesParams,
  deps: GenerateKIQueriesDependencies
): Promise<
  SignificantEventsQueriesGenerationResult & {
    toolUsage: SignificantEventsToolUsage;
    connectorId: string;
  }
> {
  const { streamName, connectorId: connectorIdOverride, maxExistingQueriesForContext } = params;
  const {
    streamsClient,
    inferenceClient,
    soClient,
    kiClient,
    esClient,
    featureFlags,
    searchInferenceEndpoints,
    request,
    logger,
    signal,
    telemetry,
  } = deps;

  const connectorId =
    connectorIdOverride ??
    (await resolveConnectorForFeature({
      searchInferenceEndpoints,
      featureId: STREAMS_SIG_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID,
      featureName: 'query generation',
      request,
    }));

  logger.debug(`Using connector ${connectorId} for query generation`);

  const [definition, { significantEventsPromptOverride }, useMemory] = await Promise.all([
    streamsClient.getStream(streamName),
    new PromptsConfigService({ soClient, logger }).getPrompt(),
    isSignificantEventsMemoryEnabled(featureFlags),
  ]);

  const memoryTools = useMemory
    ? createMemoryDiscoveryTools({
        memoryService: new MemoryServiceImpl({
          logger: logger.get('memory'),
          esClient,
        }),
      })
    : undefined;

  const startedAt = Date.now();
  const result = await generateSignificantEventDefinitions(
    {
      definition,
      connectorId,
      systemPrompt: significantEventsPromptOverride,
      maxExistingQueriesForContext,
    },
    {
      inferenceClient,
      esClient,
      kiClient,
      logger: logger.get('significant_events_generation'),
      signal,
      memoryTools,
    }
  ).catch(async (error) => {
    if (isInferenceProviderError(error)) {
      const connector = await inferenceClient.getConnectorById(connectorId).catch(() => undefined);
      if (connector) {
        throw new Error(formatInferenceProviderError(error, connector), { cause: error });
      }
    }
    throw error;
  });
  const durationMs = Date.now() - startedAt;

  telemetry.trackSignificantEventsQueriesGenerated({
    count: result.queries.length,
    connector_id: connectorId,
    stream_name: definition.name,
    stream_type: getStreamTypeFromDefinition(definition),
    input_tokens_used: result.tokensUsed.prompt,
    output_tokens_used: result.tokensUsed.completion,
    cached_tokens_used: result.tokensUsed.cached ?? 0,
    duration_ms: durationMs,
    tool_usage: result.toolUsage,
  });

  return { ...result, connectorId };
}
