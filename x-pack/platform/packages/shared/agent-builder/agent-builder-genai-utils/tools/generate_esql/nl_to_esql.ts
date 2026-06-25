/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { withActiveInferenceSpan, ElasticGenAIAttributes } from '@kbn/inference-tracing';
import type { TimeRange } from '@kbn/agent-builder-common';
import { EffortLevels } from '@kbn/agent-builder-common';
import type { ModelProvider, ScopedModel } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/logging';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import { EsqlDocumentBase } from '@kbn/inference-plugin/server/tasks/nl_to_esql/doc_base';
import type { ToolEventEmitter } from '@kbn/agent-builder-server';
import { buildServerESQLCallbacks } from '@kbn/esql-server-utils';
import type { EsqlResponse } from '../utils/esql';
import { createNlToEsqlGraph } from './graph';
import { indexExplorer } from '../index_explorer';
import { loadDocumentation } from './documentation';

export interface GenerateEsqlResponse {
  /**
   * The ES|QL query which was generated
   */
  query: string;
  /**
   * The full text answer which was provided by the LLM when generating the query.
   */
  answer: string;
  /**
   * Results from executing the query.
   * Available if `executeQuery` was true and if a successful query was executed.
   */
  results?: EsqlResponse;
  /**
   * Error message if the query could not be executed
   */
  error?: string;
}

/**
 * Model input for {@link generateEsql}.
 * Either a `modelProvider` (allowing model selection) or an already-resolved `model` (legacy path).
 */
export type GenerateEsqlModelDeps =
  | { modelProvider: ModelProvider; model?: never }
  | { model: ScopedModel; modelProvider?: never };

export type GenerateEsqlDeps = GenerateEsqlModelDeps & {
  esClient: ElasticsearchClient;
  logger: Logger;
  events?: ToolEventEmitter;
};

export interface GenerateEsqlOptions {
  /**
   * The natural language query to generate ES|QL from
   */
  nlQuery: string;
  /**
   * The resource (index/datastream/alias) to target
   */
  index?: string;
  /**
   * Additional context to provide to the model (user prompt)
   */
  additionalContext?: string;
  /**
   * Additional instructions to provide to the model (system prompt)
   */
  additionalInstructions?: string;
  /**
   * If true, will attempt to execute the query and will return the results.
   * Defaults to `true`
   */
  executeQuery?: boolean;
  /**
   * Maximum number of retries if the query fails (execute or AST validation).
   * When `executeQuery` is true: retries after execution errors; when false: retries after AST validation errors.
   * Defaults to `3`
   * */
  maxRetries?: number;
  /**
   * Maximum row limit to use in generated ES|QL queries.
   */
  rowLimit?: number;
  /**
   * Time range used to supply named parameters (?_tstart, ?_tend)
   * when executing the generated query for validation.
   * Defaults to last 24 hours if not provided.
   */
  timeRange?: TimeRange;
  /**
   * If true, omits the instruction to use named parameters (?_tstart, ?_tend)
   * for time range filtering in generated queries.
   */
  disableNamedParams?: boolean;
}

export type GenerateEsqlParams = GenerateEsqlOptions & GenerateEsqlDeps;

export const generateEsql = async ({
  nlQuery,
  index,
  executeQuery = true,
  additionalInstructions,
  additionalContext,
  maxRetries = 3,
  rowLimit,
  timeRange: inputTimeRange,
  disableNamedParams,
  model: inputModel,
  modelProvider,
  esClient,
  logger,
}: GenerateEsqlParams): Promise<GenerateEsqlResponse> => {
  // Resolve a single ScopedModel once. When a modelProvider is given, use the low-effort model
  const model = modelProvider
    ? await modelProvider.selectModel({ effortLevel: EffortLevels.low })
    : inputModel!;
  const timeRange = inputTimeRange ?? { from: 'now-24h', to: 'now' };
  const docBase = await EsqlDocumentBase.load();
  const documentation = await loadDocumentation();
  const esqlCallbacks = buildServerESQLCallbacks({ client: esClient });

  const graph = createNlToEsqlGraph({
    model,
    esClient,
    docBase,
    documentation,
    esqlCallbacks,
  });

  return withActiveInferenceSpan(
    'generate_esql',
    {
      attributes: {
        [ElasticGenAIAttributes.InferenceSpanKind]: 'CHAIN',
      },
    },
    async () => {
      try {
        // Discover index if not provided (`indexExplorer` takes one string; append `additionalContext`
        // when set so resource selection can use editor notes or any other hints, not only `nlQuery`.)
        const nlQueryWithContext = additionalContext?.trim()
          ? `${nlQuery.trim()}\n\n${additionalContext.trim()}`
          : nlQuery.trim();

        let selectedTarget = index;
        if (!selectedTarget) {
          logger?.debug('No index provided, discovering target index using indexExplorer');
          const {
            resources: [selectedResource],
          } = await indexExplorer({
            nlQuery: nlQueryWithContext,
            esClient,
            limit: 1,
            model,
            logger,
          });
          if (!selectedResource) {
            throw new Error(
              'Could not discover a suitable index for the query. Please specify an index explicitly.'
            );
          }
          selectedTarget = selectedResource.name;
          logger?.debug(`Discovered target index: ${selectedTarget}`);
        }

        const outState = await graph.invoke(
          {
            nlQuery,
            target: selectedTarget,
            executeQuery,
            maxRetries,
            additionalInstructions,
            additionalContext,
            rowLimit,
            disableNamedParams,
            timeRange,
          },
          {
            recursionLimit: 25,
            tags: ['generate_esql'],
            metadata: { graphName: 'generate_esql' },
          }
        );

        return {
          error: outState.error,
          answer: outState.answer,
          query: outState.query,
          results: outState.results,
        };
      } catch (e) {
        throw new Error(`Could not generate ESQL query: ${e.message}`);
      }
    }
  );
};
