/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ModelProvider, ToolEventEmitter } from '@kbn/agent-builder-server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { validateEsqlQuery } from '@kbn/agent-builder-genai-utils';
import { buildServerESQLCallbacks } from '@kbn/esql-server-utils';
import { createVegaGraph } from './graph';

export interface BuildVegaConfigParams {
  nlQuery: string;
  index?: string;
  esql?: string;
  /** Existing serialized Vega spec to edit, if any. */
  existingSpec?: string;
  modelProvider: ModelProvider;
  logger: Logger;
  events: ToolEventEmitter;
  esClient: IScopedClusterClient;
}

export interface BuildVegaConfigResult {
  /** Serialized, render-ready Vega or Vega-Lite specification. */
  spec: string;
  /** Canonical ES|QL query bound into the spec's data source. */
  esqlQuery: string;
}

/**
 * Orchestrate Vega spec generation (Vega-Lite by default, raw Vega when the
 * request requires it): optionally reuse a caller-provided ES|QL query (dropped
 * if it fails validation so the graph regenerates one), run the generation
 * graph, and surface a clear error if no spec is produced.
 */
export const buildVegaConfig = async ({
  nlQuery,
  index,
  esql,
  existingSpec,
  modelProvider,
  logger,
  events,
  esClient,
}: BuildVegaConfigParams): Promise<BuildVegaConfigResult> => {
  // If the caller provides ES|QL, keep it only when validation says it is safe.
  // If validation cannot run, keep it and let the graph handle it.
  let providedEsql = esql;
  if (providedEsql) {
    let validationError: string | undefined;
    try {
      validationError = await validateEsqlQuery(
        providedEsql,
        buildServerESQLCallbacks({ client: esClient.asCurrentUser })
      );
    } catch {
      // Couldn't validate, keep it.
    }
    if (validationError) {
      logger.warn(
        `Provided ES|QL failed validation; regenerating from the natural-language query. Error: ${validationError}`
      );
      providedEsql = undefined;
    }
  }

  const graph = await createVegaGraph(modelProvider, logger, events, esClient);

  const finalState = await graph.invoke({
    nlQuery,
    index,
    existingSpec,
    esqlQuery: providedEsql || '',
    currentAttempt: 0,
    actions: [],
    spec: null,
    error: null,
  });

  const { spec, error, esqlQuery } = finalState;

  if (!spec) {
    throw new Error(
      `Failed to generate a valid Vega specification. Last error: ${error || 'Unknown error'}`
    );
  }

  return { spec, esqlQuery };
};
