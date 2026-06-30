/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { BoundInferenceClient } from '@kbn/inference-common';
import { executeAsReasoningAgent } from '@kbn/inference-prompt-utils';
import type { Streams } from '@kbn/streams-schema';
import type { Feature } from '@kbn/significant-events-schema';
import { conditionSchema, type Condition } from '@kbn/streamlang';
import { DeepStrict } from '@kbn/zod-helpers/v4';
import { clusterLogs } from '../../src/cluster_logs/cluster_logs';
import { SuggestStreamPartitionsPrompt } from './prompt';
import { schema } from './schema';
import {
  getFeatureQueryFromToolArgs,
  resolveFeatureTypeFilters,
  toFeatureForLlmContext,
} from './features_tool';

const strictConditionSchema = DeepStrict(conditionSchema);
export type PartitionSuggestionsReason = 'no_clusters' | 'no_samples' | 'all_data_partitioned';

// Must be a `type` alias, not an `interface`. Interfaces lack implicit index
// signatures, so `Observable<ServerSentEventBase<..., PartitionStreamResponse>>`
// would not be assignable to `Observable<ServerSentEvent>` (which requires
// `Record<string, unknown>`), causing the route handler return type to collapse
// to `never`.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type PartitionStreamResponse = {
  partitions: Array<{ name: string; condition: Condition }>;
  reason?: PartitionSuggestionsReason;
};

export async function partitionStream({
  definition,
  inferenceClient,
  esClient,
  logger,
  start,
  end,
  maxSteps,
  signal,
  getFeatures,
  userPrompt,
  existingPartitions = [],
}: {
  definition: Streams.WiredStream.Definition;
  inferenceClient: BoundInferenceClient;
  esClient: ElasticsearchClient;
  logger: Logger;
  start: number;
  end: number;
  maxSteps?: number | undefined;
  signal: AbortSignal;
  getFeatures(params?: {
    type?: string[];
    minConfidence?: number;
    limit?: number;
  }): Promise<Feature[]>;
  userPrompt?: string;
  existingPartitions?: Array<{ name: string; condition: Condition }>;
}): Promise<PartitionStreamResponse> {
  const enabledChildConditions = definition.ingest.wired.routing
    .filter((route) => route.status !== 'disabled')
    .map((route) => route.where);

  const initialClusters = await clusterLogs({
    esClient,
    start,
    end,
    index: definition.name,
    logger,
    partitions: existingPartitions,
    excludeConditions: enabledChildConditions,
    size: 1000,
  });

  // No need to involve reasoning if there are no initial clusters
  if (initialClusters.length === 0) {
    return { partitions: [], reason: 'no_clusters' };
  }

  // No need to involve reasoning if there are no sample documents
  if (initialClusters.every((cluster) => cluster.clustering.sampled === 0)) {
    // If there are enabled child conditions, we need to determine whether:
    // - All data is already partitioned (all_data_partitioned), or
    // - There are simply no samples in the time range (no_samples)
    // We do this by checking if at least one doc exists without exclusions
    if (enabledChildConditions.length > 0) {
      const countResponse = await esClient.count({
        index: definition.name,
        query: {
          bool: {
            filter: [
              {
                range: {
                  '@timestamp': { gte: start, lte: end, format: 'epoch_millis' },
                },
              },
            ],
          },
        },
      });

      const hasAnyDocsWithoutExclusion = countResponse.count > 0;

      return {
        partitions: [],
        reason: hasAnyDocsWithoutExclusion ? 'all_data_partitioned' : 'no_samples',
      };
    }

    return {
      partitions: [],
      reason: 'no_samples',
    };
  }

  const response = await executeAsReasoningAgent({
    inferenceClient,
    prompt: SuggestStreamPartitionsPrompt,
    input: {
      stream: definition,
      initial_clustering: JSON.stringify(initialClusters),
      condition_schema: JSON.stringify(schema),
      ...(userPrompt ? { user_prompt: userPrompt } : {}),
      ...(existingPartitions.length > 0
        ? { existing_partitions: JSON.stringify(existingPartitions) }
        : {}),
    },
    maxSteps,
    toolCallbacks: {
      get_stream_features: async (toolCall) => {
        try {
          const { featureTypes, minConfidence, limit } = getFeatureQueryFromToolArgs(
            toolCall.function.arguments
          );
          const typeFilters = resolveFeatureTypeFilters(featureTypes);
          const features = await getFeatures({
            type: typeFilters,
            minConfidence,
            limit,
          });
          const llmFeatures = features.map(toFeatureForLlmContext);

          return {
            response: {
              features: llmFeatures,
              count: llmFeatures.length,
            },
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to fetch stream features: ${errorMessage}`);
          return {
            response: {
              features: [],
              count: 0,
              error: errorMessage,
            },
          };
        }
      },
      partition_logs: async (toolCall) => {
        const partitions = (toolCall.function.arguments.partitions ?? []) as Array<{
          name: string;
          condition: Condition;
        }>;

        const partitionsResponse = await clusterLogs({
          esClient,
          start,
          end,
          index: toolCall.function.arguments.index,
          partitions,
          excludeConditions: enabledChildConditions,
          logger,
        });

        return { response: { partitions: partitionsResponse } };
      },
    },
    finalToolChoice: {
      type: 'function',
      function: 'partition_logs',
    },
    abortSignal: signal,
  });

  const seenNames = new Set<string>();
  const proposedPartitions = (response?.toolCalls
    ?.flatMap((toolCall) => toolCall.function.arguments.partitions ?? [])
    .map(({ name, condition }) => {
      // Strip the parent stream prefix if the LLM echoed it back (e.g. "logs.otel.foo" → "foo")
      const baseName = name.startsWith(`${definition.name}.`)
        ? name.slice(definition.name.length + 1)
        : name;

      // Sanitize name to be alphanumeric with dashes only, lowercase
      const sanitizedName = baseName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

      if (!sanitizedName) {
        return null;
      }

      const fullName = `${definition.name}.${sanitizedName}`;

      if (seenNames.has(fullName)) {
        return null;
      }
      seenNames.add(fullName);

      return {
        name: fullName,
        condition: condition as Condition,
      };
    })
    .filter(Boolean) ?? []) as Array<{ name: string; condition: Condition }>;

  const partitions = proposedPartitions.filter(
    ({ condition }) => strictConditionSchema.safeParse(condition).success
  );
  return {
    partitions,
    reason: partitions.length === 0 ? 'no_clusters' : undefined,
  };
}
