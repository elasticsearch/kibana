/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, KibanaRequest } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { getStreamTypeFromDefinition, type FeatureUpsert, type Streams } from '@kbn/streams-schema';
import type { ToolsStart } from '@kbn/agent-builder-server';
import {
  generateAllComputedFeatures,
  CODE_ANALYSIS_PROVIDER_KEY,
  type ComputedFeatureProvider,
} from '@kbn/streams-ai';
import type { KnowledgeIndicatorClient } from '../../streams/ki';
import { createCodeAnalysisProvider } from '../../semantic_code_search_grounding/compute_code_analysis';
import type { EbtTelemetryClient } from '../../telemetry';
import { reconcileComputedFeatures } from './reconcile_features';

export interface IdentifyComputedFeaturesOptions {
  stream: Streams.all.Definition;
  streamName: string;
  start: number;
  end: number;
  esClient: ElasticsearchClient;
  kiClient: KnowledgeIndicatorClient;
  logger: Logger;
  runId: string;
  /**
   * Agent Builder tools + request enable the `code_analysis` computed feature
   * (Semantic Code Search grounding). Pass them only when the feature flag is on
   * and Agent Builder is available; when absent, code grounding is skipped.
   */
  agentBuilderTools?: ToolsStart;
  request?: KibanaRequest;
  /** Optional telemetry client to record code_analysis grounding outcomes. */
  telemetry?: EbtTelemetryClient;
}

export async function identifyComputedFeatures({
  stream,
  streamName,
  start,
  end,
  esClient,
  kiClient,
  logger,
  runId,
  agentBuilderTools,
  request,
  telemetry,
}: IdentifyComputedFeaturesOptions): Promise<FeatureUpsert[]> {
  const providers: Record<string, ComputedFeatureProvider> | undefined =
    agentBuilderTools && request
      ? {
          [CODE_ANALYSIS_PROVIDER_KEY]: createCodeAnalysisProvider({
            agentBuilderTools,
            request,
            onOutcome: telemetry
              ? (outcome) =>
                  telemetry.trackCodeAnalysisGrounding({
                    stream_name: streamName,
                    stream_type: getStreamTypeFromDefinition(stream),
                    status: outcome.status,
                    repository: outcome.repository,
                    candidate_count: outcome.candidateCount,
                    verified_count: outcome.verifiedCount,
                  })
              : undefined,
          }),
        }
      : undefined;

  const computedFeatures = await generateAllComputedFeatures({
    stream,
    start,
    end,
    esClient,
    logger: logger.get('computed_features'),
    providers,
  });

  const reconciledComputedFeatures = reconcileComputedFeatures({
    computedFeatures,
    streamName,
    runId,
  });

  if (reconciledComputedFeatures.length > 0) {
    await kiClient.bulk(
      streamName,
      reconciledComputedFeatures.map((feature) => ({ index: { feature } }))
    );
  }

  return reconciledComputedFeatures;
}
