/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { Logger } from '@kbn/logging';
import type { BoundInferenceClient, ChatCompletionTokenCount } from '@kbn/inference-common';
import type { StreamType } from '@kbn/streams-schema';
import {
  type Feature,
  type FeatureUpsert,
  type BaseFeature,
  type IterationResult,
  isComputedFeature,
  isFeatureWithFilter,
} from '@kbn/streams-schema';
import {
  EMPTY_TOKENS,
  identifyFeatures,
  type ExcludedFeatureSummary,
  type IgnoredFeature,
} from '@kbn/streams-ai';
import type { KnowledgeIndicatorClient } from '../../streams/ki';
import { fetchSampleDocuments } from '../../tasks/task_definitions/features_identification/fetch_sample_documents';
import { PromptsConfigService } from '../saved_objects/prompts_config_service';
import type { SigEventsTuningConfig } from '../../../../common/sig_events_tuning_config';
import { DEFAULT_SIG_EVENTS_TUNING_CONFIG } from '../../../../common/sig_events_tuning_config';
import {
  reconcileInferredFeatures,
  toFeatureSummary,
  toFeatureProjection,
} from './reconcile_features';

const DEFAULT_MAX_PREVIOUSLY_IDENTIFIED_FEATURES = 100;

// ---------------------------------------------------------------------------
// Tuning params type (subset of SigEventsTuningConfig)
// ---------------------------------------------------------------------------

type IterationTuningParams = Partial<
  Pick<
    SigEventsTuningConfig,
    | 'sample_size'
    | 'entity_filtered_ratio'
    | 'diverse_ratio'
    | 'max_excluded_features_in_prompt'
    | 'max_entity_filters'
  >
> & {
  maxPreviouslyIdentifiedFeatures?: number;
};

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export interface FeaturesIdentifiedTelemetry {
  run_id: string;
  connector_id: string;
  iteration: number;
  stream_name: string;
  stream_type: StreamType;
  docs_count: number;
  excluded_features_count: number;
  total_filters: number;
  filters_capped: boolean;
  has_filtered_documents: boolean;
  duration_ms: number;
  state: 'success' | 'failure' | 'canceled';
  features_new: number;
  features_updated: number;
  input_tokens_used: number;
  output_tokens_used: number;
  total_tokens_used: number;
  cached_tokens_used: number;
  llm_ignored_count: number;
  code_ignored_count: number;
}

export interface TelemetryContext {
  run_id: string;
  connector_id: string;
  iteration: number;
  stream_name: string;
  stream_type: StreamType;
  docs_count: number;
  excluded_features_count: number;
  total_filters: number;
  filters_capped: boolean;
  has_filtered_documents: boolean;
}

export function buildTelemetry(
  ctx: TelemetryContext,
  durationMs: number,
  outcome:
    | { state: 'failure' | 'canceled' }
    | {
        state: 'success';
        tokensUsed: ChatCompletionTokenCount;
        newCount: number;
        updatedCount: number;
        llmIgnoredCount: number;
        codeIgnoredCount: number;
      }
): FeaturesIdentifiedTelemetry {
  if (outcome.state !== 'success') {
    return {
      ...ctx,
      duration_ms: durationMs,
      state: outcome.state,
      features_new: 0,
      features_updated: 0,
      input_tokens_used: 0,
      output_tokens_used: 0,
      total_tokens_used: 0,
      cached_tokens_used: 0,
      llm_ignored_count: 0,
      code_ignored_count: 0,
    };
  }
  const { tokensUsed } = outcome;
  return {
    ...ctx,
    duration_ms: durationMs,
    state: 'success',
    features_new: outcome.newCount,
    features_updated: outcome.updatedCount,
    input_tokens_used: tokensUsed.prompt,
    output_tokens_used: tokensUsed.completion,
    total_tokens_used: tokensUsed.total,
    cached_tokens_used: tokensUsed.cached ?? 0,
    llm_ignored_count: outcome.llmIgnoredCount,
    code_ignored_count: outcome.codeIgnoredCount,
  };
}

// ---------------------------------------------------------------------------
// LLM inference wrapper
// ---------------------------------------------------------------------------

type InferenceResult =
  | {
      success: true;
      rawFeatures: BaseFeature[];
      ignoredFeatures: IgnoredFeature[];
      tokensUsed: ChatCompletionTokenCount;
    }
  | { success: false };

async function tryIdentifyFeatures(
  args: Parameters<typeof identifyFeatures>[0]
): Promise<InferenceResult> {
  try {
    const result = await identifyFeatures(args);
    return {
      success: true,
      rawFeatures: result.features,
      ignoredFeatures: result.ignoredFeatures,
      tokensUsed: result.tokensUsed,
    };
  } catch (error) {
    if (args.signal.aborted) {
      throw error;
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    args.logger.warn(`LLM inference failed: ${errorMsg}`);
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// Single inferred-features iteration (internal)
// ---------------------------------------------------------------------------

interface RunInferredIterationOptions {
  esClient: ElasticsearchClient;
  streamName: string;
  start: number;
  end: number;
  runId: string;
  allFeatures: Feature[];
  discoveredFeatures: Feature[];
  excludedFeatures: Feature[];
  inferenceClient: BoundInferenceClient;
  systemPrompt: string;
  logger: Logger;
  signal: AbortSignal;
  tuning: IterationTuningParams;
  diverseOffset: number;
}

type InferredIterationResult =
  | { hasDocuments: false; nextDiverseOffset: number }
  | {
      hasDocuments: true;
      docsCount: number;
      docIds: string[];
      totalFilters: number;
      filtersCapped: boolean;
      hasFilteredDocuments: boolean;
      nextDiverseOffset: number;
      outcome:
        | { state: 'failure' }
        | {
            state: 'success';
            tokensUsed: ChatCompletionTokenCount;
            newFeatures: FeatureUpsert[];
            updatedFeatures: FeatureUpsert[];
            ignoredFeatures: IgnoredFeature[];
            codeIgnoredCount: number;
          };
    };

async function runInferredIteration({
  esClient,
  streamName,
  start,
  end,
  runId,
  allFeatures,
  discoveredFeatures,
  excludedFeatures,
  inferenceClient,
  systemPrompt,
  logger,
  signal,
  tuning,
  diverseOffset,
}: RunInferredIterationOptions): Promise<InferredIterationResult> {
  const {
    sample_size: sampleSize = DEFAULT_SIG_EVENTS_TUNING_CONFIG.sample_size,
    entity_filtered_ratio:
      entityFilteredRatio = DEFAULT_SIG_EVENTS_TUNING_CONFIG.entity_filtered_ratio,
    diverse_ratio: diverseRatio = DEFAULT_SIG_EVENTS_TUNING_CONFIG.diverse_ratio,
    max_entity_filters: maxEntityFilters = DEFAULT_SIG_EVENTS_TUNING_CONFIG.max_entity_filters,
    max_excluded_features_in_prompt:
      maxExcludedFeaturesInPrompt = DEFAULT_SIG_EVENTS_TUNING_CONFIG.max_excluded_features_in_prompt,
    maxPreviouslyIdentifiedFeatures = DEFAULT_MAX_PREVIOUSLY_IDENTIFIED_FEATURES,
  } = tuning;

  const batchResult = await fetchSampleDocuments({
    esClient,
    index: streamName,
    start,
    end,
    features: discoveredFeatures.filter(isFeatureWithFilter),
    logger,
    size: sampleSize,
    entityFilteredRatio,
    diverseRatio,
    maxEntityFilters,
    diverseOffset,
  });

  if (batchResult.documents.length === 0) {
    return { hasDocuments: false, nextDiverseOffset: batchResult.nextOffset };
  }

  const { totalFilters, filtersCapped, hasFilteredDocuments } = batchResult;
  const docsCount = batchResult.documents.length;
  const docIds = batchResult.documents
    .map((doc) => doc._id)
    .filter((id): id is string => id != null);

  const allKnownFeatures = allFeatures.filter((f) => !isComputedFeature(f));
  const topRanked = [...allKnownFeatures]
    .sort((a, b) => {
      const aEntity = a.type === 'entity' ? 0 : 1;
      const bEntity = b.type === 'entity' ? 0 : 1;
      if (aEntity !== bEntity) return aEntity - bEntity;
      return b.confidence - a.confidence;
    })
    .slice(0, maxPreviouslyIdentifiedFeatures);

  const excludedSummaries: ExcludedFeatureSummary[] = excludedFeatures
    .slice(0, maxExcludedFeaturesInPrompt)
    .map(toFeatureProjection);

  const inferResult = await tryIdentifyFeatures({
    streamName,
    sampleDocuments: batchResult.documents,
    excludedFeatures: excludedSummaries,
    inferenceClient,
    systemPrompt,
    logger,
    signal,
    previouslyIdentifiedFeatures: topRanked.map(toFeatureProjection),
  });

  if (!inferResult.success) {
    return {
      hasDocuments: true,
      docsCount,
      docIds,
      totalFilters,
      filtersCapped,
      hasFilteredDocuments,
      nextDiverseOffset: batchResult.nextOffset,
      outcome: { state: 'failure' },
    };
  }

  const { rawFeatures, ignoredFeatures, tokensUsed } = inferResult;

  const { newFeatures, updatedFeatures, codeIgnoredCount } = reconcileInferredFeatures({
    rawFeatures,
    allKnownFeatures,
    discoveredFeatures,
    ignoredFeatures,
    excludedFeatures,
    runId,
    logger,
  });

  return {
    hasDocuments: true,
    docsCount,
    docIds,
    totalFilters,
    filtersCapped,
    hasFilteredDocuments,
    nextDiverseOffset: batchResult.nextOffset,
    outcome: {
      state: 'success',
      tokensUsed,
      newFeatures,
      updatedFeatures,
      ignoredFeatures,
      codeIgnoredCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Top-level: Identify inferred features (one iteration, full handler)
// ---------------------------------------------------------------------------

export interface IdentifyInferredFeaturesOptions {
  esClient: ElasticsearchClient;
  kiClient: KnowledgeIndicatorClient;
  soClient: SavedObjectsClientContract;
  inferenceClient: BoundInferenceClient;
  connectorId: string;
  logger: Logger;
  signal: AbortSignal;
  streamName: string;
  streamType: StreamType;
  start: number;
  end: number;
  runId: string;
  iteration?: number;
  tuning?: IterationTuningParams;
  diverseOffset?: number;
  trackFeaturesIdentified?: (data: FeaturesIdentifiedTelemetry) => void;
}

export interface IdentifyInferredFeaturesResult {
  hasDocuments: boolean;
  docsCount: number;
  docIds: string[];
  discoveredFeatures: FeatureUpsert[];
  iterationResult: IterationResult;
  nextDiverseOffset: number;
}

export async function identifyInferredFeatures({
  esClient,
  kiClient,
  soClient,
  inferenceClient,
  connectorId,
  logger,
  signal,
  streamName,
  streamType,
  start,
  end,
  runId,
  iteration = 1,
  tuning = {},
  diverseOffset = 0,
  trackFeaturesIdentified,
}: IdentifyInferredFeaturesOptions): Promise<IdentifyInferredFeaturesResult> {
  const [
    { hits: allFeatures },
    { hits: excludedFeatures },
    { featurePromptOverride: systemPrompt },
  ] = await Promise.all([
    kiClient.getFeatures(streamName),
    kiClient.getExcludedFeatures(streamName),
    new PromptsConfigService({ soClient, logger }).getPrompt(),
  ]);

  const discoveredFeatures = allFeatures.filter((f) => !isComputedFeature(f) && f.run_id === runId);

  const startedAt = Date.now();

  const iterationResult = await runInferredIteration({
    esClient,
    streamName,
    start,
    end,
    runId,
    allFeatures,
    discoveredFeatures,
    excludedFeatures,
    inferenceClient,
    systemPrompt,
    logger,
    signal,
    tuning,
    diverseOffset,
  });

  if (!iterationResult.hasDocuments) {
    return {
      hasDocuments: false,
      docsCount: 0,
      docIds: [],
      discoveredFeatures,
      iterationResult: {
        runId,
        iteration,
        durationMs: Date.now() - startedAt,
        state: 'success',
        tokensUsed: { ...EMPTY_TOKENS },
        newFeatures: [],
        updatedFeatures: [],
      },
      nextDiverseOffset: iterationResult.nextDiverseOffset,
    };
  }

  const { docsCount, docIds, totalFilters, filtersCapped, hasFilteredDocuments, outcome } =
    iterationResult;

  const durationMs = Date.now() - startedAt;

  const telemetryCtx: TelemetryContext = {
    run_id: runId,
    connector_id: connectorId,
    iteration,
    stream_name: streamName,
    stream_type: streamType,
    docs_count: docsCount,
    excluded_features_count: excludedFeatures.length,
    total_filters: totalFilters,
    filters_capped: filtersCapped,
    has_filtered_documents: hasFilteredDocuments,
  };

  if (outcome.state !== 'success') {
    const failedEntry: IterationResult = {
      runId,
      iteration,
      durationMs,
      state: 'failure',
      tokensUsed: { ...EMPTY_TOKENS },
      newFeatures: [],
      updatedFeatures: [],
    };

    trackFeaturesIdentified?.(buildTelemetry(telemetryCtx, durationMs, { state: 'failure' }));

    return {
      hasDocuments: true,
      docsCount,
      docIds,
      discoveredFeatures,
      iterationResult: failedEntry,
      nextDiverseOffset: iterationResult.nextDiverseOffset,
    };
  }

  const { tokensUsed, newFeatures, updatedFeatures, ignoredFeatures, codeIgnoredCount } = outcome;

  const allChanged = [...newFeatures, ...updatedFeatures];
  if (allChanged.length > 0) {
    await kiClient.bulk(
      streamName,
      allChanged.map((feature) => ({ index: { feature } }))
    );
  }

  const discoveredMap = new Map<string, FeatureUpsert>(discoveredFeatures.map((f) => [f.id, f]));
  for (const feature of allChanged) {
    discoveredMap.set(feature.id, feature);
  }

  const iterationEntry: IterationResult = {
    runId,
    iteration,
    durationMs,
    state: 'success',
    tokensUsed,
    newFeatures: newFeatures.map(toFeatureSummary),
    updatedFeatures: updatedFeatures.map(toFeatureSummary),
  };

  trackFeaturesIdentified?.(
    buildTelemetry(telemetryCtx, durationMs, {
      state: 'success',
      tokensUsed,
      newCount: newFeatures.length,
      updatedCount: updatedFeatures.length,
      llmIgnoredCount: ignoredFeatures.length,
      codeIgnoredCount,
    })
  );

  return {
    hasDocuments: true,
    docsCount,
    docIds,
    discoveredFeatures: Array.from(discoveredMap.values()),
    iterationResult: iterationEntry,
    nextDiverseOffset: iterationResult.nextDiverseOffset,
  };
}
