/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import type { ModelProvider, ToolEventEmitter } from '@kbn/agent-builder-server';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { validateEsqlQuery } from '@kbn/agent-builder-genai-utils';
import { buildServerESQLCallbacks } from '@kbn/esql-server-utils';
import { createVisualizationGraph } from './graph_lens';
import { guessChartType } from './guess_chart_type';
import { getSchemaForChartType } from './schemas';
import type { VisualizationConfig } from './types';

export interface BuildVisualizationConfigParams {
  nlQuery: string;
  index?: string;
  chartType?: SupportedChartType;
  esql?: string;
  existingConfig?: string;
  parsedExistingConfig?: VisualizationConfig | null;
  includeTimeRange?: boolean;
  additionalChartConfigInstructions?: string;
  modelProvider: ModelProvider;
  logger: Logger;
  events: ToolEventEmitter;
  esClient: IScopedClusterClient;
}

interface BuildVisualizationConfigResult {
  selectedChartType: SupportedChartType;
  validatedConfig: VisualizationConfig;
  esqlQuery: string;
  timeRange?: { from: string; to: string };
}

export const buildVisualizationConfig = async ({
  nlQuery,
  index,
  chartType,
  esql,
  existingConfig,
  parsedExistingConfig = null,
  includeTimeRange = true,
  additionalChartConfigInstructions,
  modelProvider,
  logger,
  events,
  esClient,
}: BuildVisualizationConfigParams): Promise<BuildVisualizationConfigResult> => {
  let selectedChartType: SupportedChartType = chartType || SupportedChartType.Metric;

  if (!chartType) {
    logger.debug('Chart type not provided, using LLM to suggest one');
    const existingType =
      parsedExistingConfig && 'type' in parsedExistingConfig
        ? String(parsedExistingConfig.type)
        : undefined;
    selectedChartType = await guessChartType(modelProvider, nlQuery, existingType);
  }

  const schema = getSchemaForChartType(selectedChartType);
  const graph = await createVisualizationGraph(
    modelProvider,
    logger,
    events,
    esClient,
    includeTimeRange,
    additionalChartConfigInstructions
  );

  // If the user provides ES|QL, use it only when validation says it is safe.
  // If validation cannot run, keep the query and let the next step handle it.
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

  const finalState = await graph.invoke({
    nlQuery,
    index,
    chartType: selectedChartType,
    schema,
    existingConfig,
    parsedExistingConfig,
    esqlQuery: providedEsql || '',
    currentAttempt: 0,
    actions: [],
    validatedConfig: null,
    error: null,
  });

  const { validatedConfig, error, currentAttempt, esqlQuery, timeRange } = finalState;

  if (!validatedConfig) {
    throw new Error(
      `Failed to generate valid configuration after ${currentAttempt} attempts. Last error: ${
        error || 'Unknown error'
      }`
    );
  }

  return {
    selectedChartType,
    validatedConfig,
    esqlQuery,
    ...(timeRange && { timeRange }),
  };
};
