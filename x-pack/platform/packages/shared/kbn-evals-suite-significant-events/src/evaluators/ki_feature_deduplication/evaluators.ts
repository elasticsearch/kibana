/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { hasSameFingerprint, type BaseFeature } from '@kbn/significant-events-schema';
import { chunk, uniqBy, uniqWith } from 'lodash';
import type { BoundInferenceClient } from '@kbn/inference-common';
import { executeUntilValid } from '@kbn/inference-prompt-utils';
import { SemanticUniquenessPrompt } from './semantic_uniqueness/prompt';
import { MergeCorrectnessPrompt } from './merge_correctness/prompt';

interface MergeEvent {
  existing: BaseFeature;
  incoming: BaseFeature;
}

interface DedupLoopOutput {
  mergeEvents: MergeEvent[];
  fingerprintOnlyMergeEvents: MergeEvent[];
  finalFeatures: BaseFeature[];
  traceId?: string | null;
}

/**
 * Checks that all unique-by-id KIs in the final accumulated set are
 * semantically distinct. Score = K / N, where K = semantic clusters
 * and N = unique ids. A score < 1 means there are semantic duplicates.
 */
export const createSemanticUniquenessEvaluator = ({
  inferenceClient,
}: {
  inferenceClient: BoundInferenceClient;
}) => ({
  name: 'llm_semantic_uniqueness',
  kind: 'LLM' as const,
  evaluate: async ({
    input,
    output,
  }: {
    input: { stream_name: string };
    output: DedupLoopOutput;
  }) => {
    const { finalFeatures } = output;

    if (finalFeatures.length === 0) {
      return { score: null, explanation: 'Inconclusive: no features to evaluate' };
    }

    const kisUniqueById = uniqBy(finalFeatures, (ki) => ki.id.toLowerCase());
    const uniqueById = kisUniqueById.length;
    const uniqueByFingerprint = uniqWith(kisUniqueById, hasSameFingerprint).length;

    const compactUniqueKIs = kisUniqueById.map((ki) => ({
      id: ki.id.toLowerCase(),
      type: ki.type,
      subtype: ki.subtype,
      title: ki.title,
      properties: ki.properties,
      description: ki.description?.slice(0, 300),
    }));

    const response = await executeUntilValid({
      prompt: SemanticUniquenessPrompt,
      inferenceClient,
      input: {
        stream_name: input?.stream_name,
        totals: JSON.stringify({
          total_kis: finalFeatures.length,
          unique_by_id: uniqueById,
          unique_by_fingerprint: uniqueByFingerprint,
        }),
        unique_kis_by_id: JSON.stringify(compactUniqueKIs),
      },
      finalToolChoice: { function: 'analyze' as const },
      maxRetries: 3,
      toolCallbacks: {
        analyze: async (toolCall) => {
          const { k, duplicate_clusters } = toolCall.function.arguments;

          if (!Number.isFinite(k) || k < 0 || k > uniqueById) {
            throw new Error(
              `Expected k to be a number between 0 and ${uniqueById}, got ${JSON.stringify(k)}`
            );
          }

          const knownIds = new Set(compactUniqueKIs.map((ki) => ki.id.toLowerCase()));
          for (const cluster of duplicate_clusters) {
            for (const id of cluster.ids ?? []) {
              if (!knownIds.has(id.toLowerCase())) {
                throw new Error(`duplicate_clusters references unknown KI id "${id}"`);
              }
            }
          }

          return { response: toolCall.function.arguments };
        },
      },
    });

    const { k, explanation, duplicate_clusters } = response.toolCalls[0].function.arguments;
    const score = uniqueById > 0 ? k / uniqueById : 1;

    return {
      score,
      explanation,
      metadata: {
        n: uniqueById,
        k,
        duplicate_rate: uniqueById > 0 ? 1 - k / uniqueById : 0,
        duplicate_clusters,
        unique_by_id: uniqueById,
        unique_by_fingerprint: uniqueByFingerprint,
        features: compactUniqueKIs,
      },
    };
  },
});

const compactFeature = (feature: BaseFeature) => ({
  id: feature.id,
  type: feature.type,
  subtype: feature.subtype,
  title: feature.title,
  properties: feature.properties,
  description: feature.description?.slice(0, 300),
});

/**
 * Measures how often the model reused an existing feature id when it produced
 * a feature that duplicated one already in the accumulator. A fingerprint-only
 * match (same type, subtype and properties but a different id) is treated as
 * an id-reuse miss: the model had enough signal via `previouslyIdentifiedFeatures`
 * to reuse the existing id, but chose a new one.
 *
 * Score = id-based merges / (id-based merges + fingerprint-only merges).
 * 1 means perfect id reuse; <1 means the model produced new ids for features
 * it should have recognized as already identified.
 */
export const createIdReuseEvaluator = () => ({
  name: 'id_reuse',
  kind: 'CODE' as const,
  evaluate: async ({ output }: { output: DedupLoopOutput }) => {
    const { mergeEvents, fingerprintOnlyMergeEvents } = output;
    const totalDuplicates = mergeEvents.length + fingerprintOnlyMergeEvents.length;

    if (totalDuplicates === 0) {
      return { score: null, explanation: 'Inconclusive: no duplicate features were produced' };
    }

    const score = mergeEvents.length / totalDuplicates;

    return {
      score,
      explanation:
        fingerprintOnlyMergeEvents.length > 0
          ? `${fingerprintOnlyMergeEvents.length}/${totalDuplicates} duplicate feature(s) were produced with a new id instead of reusing the existing one`
          : `All ${totalDuplicates} duplicate feature(s) reused the existing id`,
      metadata: {
        total_duplicates: totalDuplicates,
        id_reused: mergeEvents.length,
        id_missed: fingerprintOnlyMergeEvents.length,
        missed_events: fingerprintOnlyMergeEvents.map((event) => ({
          existing: compactFeature(event.existing),
          incoming: compactFeature(event.incoming),
        })),
      },
    };
  },
});

const MERGE_CORRECTNESS_BATCH_SIZE = 20;

/**
 * Evaluates whether id-based feature merges are semantically correct.
 * Score = correct merges / total merges. A score < 1 means some merges
 * combined features that represent different real-world concepts.
 *
 * Large payloads are split into batches of MERGE_CORRECTNESS_BATCH_SIZE to
 * keep each LLM call small and avoid length-mismatch validation failures.
 */
export const createMergeCorrectnessEvaluator = ({
  inferenceClient,
}: {
  inferenceClient: BoundInferenceClient;
}) => ({
  name: 'llm_merge_correctness',
  kind: 'LLM' as const,
  evaluate: async ({
    input,
    output,
  }: {
    input: { stream_name: string };
    output: DedupLoopOutput;
  }) => {
    const { mergeEvents } = output;

    if (mergeEvents.length === 0) {
      return { score: null, explanation: 'Inconclusive: no merge events to evaluate' };
    }

    const compactEvents = mergeEvents.map((event, eventIndex) => ({
      event_index: eventIndex,
      existing: compactFeature(event.existing),
      incoming: compactFeature(event.incoming),
    }));

    const batches = chunk(compactEvents, MERGE_CORRECTNESS_BATCH_SIZE);

    const results: Array<{ event_index: number; correct: boolean; reason: string }> = [];
    const explanations: string[] = [];

    for (const batch of batches) {
      const expectedIndices = new Set(batch.map((event) => event.event_index));
      const response = await executeUntilValid({
        prompt: MergeCorrectnessPrompt,
        inferenceClient,
        input: {
          stream_name: input?.stream_name,
          merge_events: JSON.stringify(batch),
        },
        finalToolChoice: { function: 'evaluate_merges' as const },
        maxRetries: 3,
        toolCallbacks: {
          evaluate_merges: async (toolCall) => {
            const args = toolCall.function.arguments;
            if (args.results.length !== batch.length) {
              throw new Error(
                `Expected ${batch.length} results (one per merge event), got ${args.results.length}`
              );
            }

            const seenIndices = new Set<number>();
            for (const result of args.results) {
              if (!expectedIndices.has(result.event_index)) {
                throw new Error(
                  `Result references unknown event_index ${result.event_index}; expected one of [${[
                    ...expectedIndices,
                  ].join(', ')}]`
                );
              }
              if (seenIndices.has(result.event_index)) {
                throw new Error(`Duplicate event_index ${result.event_index} in results`);
              }
              seenIndices.add(result.event_index);
            }

            return { response: toolCall.function.arguments };
          },
        },
      });

      const toolCallArgs = response.toolCalls[0].function.arguments;
      results.push(...toolCallArgs.results);
      explanations.push(toolCallArgs.explanation);
    }

    const correctCount = results.filter(({ correct }) => correct).length;
    const score = correctCount / mergeEvents.length;
    const explanation = explanations.join(' | ');

    const incorrectMerges = results
      .filter(({ correct }) => !correct)
      .map(({ event_index: eventIndex, reason }) => ({
        existing: compactEvents[eventIndex].existing,
        incoming: compactEvents[eventIndex].incoming,
        reason,
      }));

    return {
      score,
      explanation,
      metadata: {
        total_merges: mergeEvents.length,
        correct_merges: correctCount,
        incorrect_merges: incorrectMerges,
      },
    };
  },
});
