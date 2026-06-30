/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Streams } from '@kbn/streams-schema';
import type { QueryType } from '@kbn/significant-events-schema';
import type { Feature, QueryFeature } from '@kbn/significant-events-schema';
import {
  deriveQueryType,
  ensureMetadata,
  getSourcesForStream,
  getStatsQueryHints,
  normalizeEsqlSafe,
  replaceFromSources,
} from '@kbn/streams-schema';
import { QUERY_TYPE_STATS } from '@kbn/significant-events-schema';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type {
  ChatCompletionTokenCount,
  BoundInferenceClient,
  ToolCallback,
  ToolDefinition,
} from '@kbn/inference-common';
import { executeAsReasoningAgent } from '@kbn/inference-prompt-utils';
import { withSpan } from '@kbn/apm-utils';
import { createGenerateSignificantEventsPrompt } from './prompt';
import type { SignificantEventType } from './types';
import { sumTokens } from '../helpers/sum_tokens';
import { getComputedFeatureInstructions } from '../features/computed';
import {
  SIGNIFICANT_EVENTS_FEATURE_TOOL_TYPES,
  getFeatureQueryFromToolArgs,
  resolveFeatureTypeFilters,
  toFeatureForLlmContext,
} from './tools/features_tool';
import {
  createDefaultSignificantEventsToolUsage,
  type SignificantEventsToolUsage,
} from './tools/tool_usage';

export const DEFAULT_MAX_EXISTING_QUERIES_FOR_CONTEXT = 50;

export interface ExistingQuerySummary {
  id: string;
  title: string;
  type: string;
  severity_score?: number;
  description: string;
  esql: string;
}

/**
 * Intermediate representation of a query as produced by the LLM tool output.
 * Uses a flat `esql` string (vs the wrapped `EsqlQuery` in the wire type)
 * and carries the `category` from the tool schema.
 */
interface ParsedToolQuery {
  type: QueryType;
  esql: string;
  title: string;
  description: string;
  category: SignificantEventType;
  severity_score: number;
  evidence?: string[];
  replaces?: string;
  features: QueryFeature[];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Generate KI queries using a reasoning agent that fetches
 * stream features (including computed dataset analysis) via tool calls.
 */
export async function identifyKIQueries({
  stream,
  esClient,
  getFeatures,
  inferenceClient,
  signal,
  systemPrompt,
  logger,
  additionalTools,
  additionalToolCallbacks,
  existingQueries,
  maxExistingQueriesForContext = DEFAULT_MAX_EXISTING_QUERIES_FOR_CONTEXT,
  maxSteps,
}: {
  stream: Streams.all.Definition;
  esClient: ElasticsearchClient;
  getFeatures(params?: {
    type?: string[];
    minConfidence?: number;
    limit?: number;
  }): Promise<Feature[]>;
  inferenceClient: BoundInferenceClient;
  signal: AbortSignal;
  logger: Logger;
  systemPrompt: string;
  additionalTools?: Record<string, ToolDefinition>;
  additionalToolCallbacks?: Record<string, ToolCallback>;
  existingQueries?: ExistingQuerySummary[];
  maxExistingQueriesForContext?: number;
  /**
   * Overrides the reasoning agent step budget. Defaults to 6 when extra tool
   * callbacks are provided, otherwise 4. Pass a higher value when additional
   * tools (e.g. code grounding) add round-trips.
   */
  maxSteps?: number;
}): Promise<{
  queries: ParsedToolQuery[];
  tokensUsed: ChatCompletionTokenCount;
  toolUsage: SignificantEventsToolUsage;
}> {
  logger.debug('Starting Significant Events KI query generation');

  const toolUsage = createDefaultSignificantEventsToolUsage();

  const prompt = createGenerateSignificantEventsPrompt({ systemPrompt, additionalTools });
  const targetSources = getSourcesForStream(stream);

  const existingQueriesList = existingQueries ?? [];

  const normalizedStoredEsqls = new Set(existingQueriesList.map((q) => normalizeEsqlSafe(q.esql)));

  const contextLimit = Math.max(0, Math.floor(maxExistingQueriesForContext));

  const existingQueriesContext = existingQueriesList.length
    ? JSON.stringify(
        [...existingQueriesList]
          .sort((a, b) => (b.severity_score ?? 0) - (a.severity_score ?? 0))
          .slice(0, contextLimit)
      )
    : '';

  const returnedFeatureMap = new Map<string, string | undefined>();
  const validatedQueries: ParsedToolQuery[] = [];

  logger.trace('Generating Significant Events KI queries via reasoning agent');
  const response = await withSpan('generate_significant_events', () =>
    executeAsReasoningAgent({
      input: {
        name: stream.name,
        description: stream.description,
        available_feature_types: SIGNIFICANT_EVENTS_FEATURE_TOOL_TYPES.join(', '),
        computed_feature_instructions: getComputedFeatureInstructions(),
        existing_queries: existingQueriesContext,
      },
      maxSteps: maxSteps ?? (additionalToolCallbacks ? 6 : 4),
      prompt,
      inferenceClient,
      toolCallbacks: {
        get_stream_features: async (toolCall) => {
          toolUsage.get_stream_features.calls += 1;
          const startTime = Date.now();
          try {
            // Keep this intentionally permissive: ignore unknown tool args instead of failing generation.
            const { featureTypes, minConfidence, limit } = getFeatureQueryFromToolArgs(
              toolCall.function.arguments
            );
            const typeFilters = resolveFeatureTypeFilters(featureTypes);
            const features = await withSpan('get_stream_features_for_significant_events', () =>
              getFeatures({
                type: typeFilters,
                minConfidence,
                limit,
              })
            );
            const llmFeatures = features.map(toFeatureForLlmContext);

            for (const feature of features) {
              returnedFeatureMap.set(feature.id, feature.run_id);
            }

            return {
              response: {
                features: llmFeatures,
                count: llmFeatures.length,
              },
            };
          } catch (error) {
            toolUsage.get_stream_features.failures += 1;
            const errorMessage = getErrorMessage(error);
            logger.warn(`Failed to fetch stream features: ${errorMessage}`);
            return {
              response: {
                features: [],
                count: 0,
                error: errorMessage,
              },
            };
          } finally {
            toolUsage.get_stream_features.latency_ms += Date.now() - startTime;
          }
        },
        add_queries: async (toolCall) => {
          toolUsage.add_queries.calls += 1;
          const startTime = Date.now();

          const queries = toolCall.function.arguments.queries;
          if (!Array.isArray(queries)) {
            toolUsage.add_queries.failures += 1;
            return {
              response: {
                queries: [],
                error: 'Invalid payload: "queries" must be an array.',
              },
            };
          }
          let hasFailures = false;

          const queryValidationResults = await Promise.all(
            queries.map(async (query) => {
              try {
                const derivedType: QueryType = deriveQueryType(query.esql);
                const warnings: string[] = [];

                if (query.type && query.type !== derivedType) {
                  warnings.push(
                    `Type mismatch: declared "${query.type}" but ES|QL content is "${derivedType}". Using derived type.`
                  );
                }

                const rawFeatureIds: string[] = query.feature_ids ?? [];
                const validFeatureIds: string[] = [];
                const invalidFeatureIds: string[] = [];
                for (const id of rawFeatureIds) {
                  (returnedFeatureMap.has(id) ? validFeatureIds : invalidFeatureIds).push(id);
                }

                if (validFeatureIds.length === 0) {
                  hasFailures = true;
                  return {
                    query,
                    valid: false,
                    status: 'Failed to add',
                    error: `feature_ids must reference at least one feature returned by get_stream_features. Unknown IDs: [${rawFeatureIds.join(
                      ', '
                    )}]`,
                  };
                }

                if (invalidFeatureIds.length > 0) {
                  warnings.push(`Stripped unknown feature_ids: [${invalidFeatureIds.join(', ')}]`);
                }

                const queryFeatures: QueryFeature[] = validFeatureIds.map((id) => ({
                  id,
                  run_id: returnedFeatureMap.get(id),
                }));

                const sourceRewritten = replaceFromSources(query.esql, targetSources);
                const rewritten =
                  derivedType === QUERY_TYPE_STATS
                    ? sourceRewritten
                    : ensureMetadata(sourceRewritten);

                if (normalizedStoredEsqls.has(normalizeEsqlSafe(rewritten))) {
                  return {
                    query: {
                      ...query,
                      type: derivedType,
                      esql: rewritten,
                    },
                    valid: false,
                    status: 'Duplicate',
                    error: 'This query already exists for this stream.',
                    hints: undefined,
                  };
                }

                const hints = getStatsQueryHints(rewritten);

                await esClient.esql.query(
                  {
                    query: `${rewritten}\n| LIMIT 0`,
                    format: 'json',
                  },
                  { signal, requestTimeout: '10s' }
                );

                validatedQueries.push({
                  type: derivedType,
                  esql: rewritten,
                  title: query.title,
                  description: query.description,
                  category: query.category,
                  severity_score: query.severity_score,
                  evidence: query.evidence,
                  replaces: query.replaces,
                  features: queryFeatures,
                });

                const allHints = [...warnings, ...hints];
                return {
                  query: {
                    ...query,
                    type: derivedType,
                    esql: rewritten,
                  },
                  valid: true,
                  status: 'Added',
                  error: undefined,
                  hints: allHints.length > 0 ? allHints : undefined,
                };
              } catch (error) {
                hasFailures = true;
                return {
                  query,
                  valid: false,
                  status: 'Failed to add',
                  error: getErrorMessage(error),
                };
              }
            })
          );
          if (hasFailures) {
            toolUsage.add_queries.failures += 1;
          }
          toolUsage.add_queries.latency_ms += Date.now() - startTime;

          return {
            response: {
              queries: queryValidationResults,
            },
          };
        },
        ...(additionalToolCallbacks ?? {}),
      },
      abortSignal: signal,
    })
  );

  logger.debug(`Generated ${validatedQueries.length} Significant Event KI queries`);

  return {
    queries: validatedQueries,
    tokensUsed: sumTokens({ added: response.tokens }),
    toolUsage,
  };
}
