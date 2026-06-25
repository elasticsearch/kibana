/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TimeRange } from '@kbn/agent-builder-common';
import type { Logger } from '@kbn/logging';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { ModelProvider, ToolEventEmitter } from '@kbn/agent-builder-server';
import type { EsqlResponse } from './utils/esql';
import { generateEsql } from './generate_esql';

export interface NaturalLanguageSearchResponse {
  /**
   * The ES|QL query which was generated based on the provided NL query, index and context
   */
  generatedQuery: string;
  /**
   * The ES|QL data which was returned by executing the query.
   */
  esqlData?: EsqlResponse;
  /**
   * Error message if the query could not be executed
   */
  error?: string;
}

export const naturalLanguageSearch = async ({
  nlQuery,
  target,
  modelProvider,
  esClient,
  logger,
  events,
  rowLimit,
  customInstructions,
  timeRange,
}: {
  nlQuery: string;
  target: string;
  modelProvider: ModelProvider;
  esClient: ElasticsearchClient;
  logger: Logger;
  events: ToolEventEmitter;
  rowLimit?: number;
  customInstructions?: string;
  timeRange?: TimeRange;
}): Promise<NaturalLanguageSearchResponse> => {
  const queryGenResponse = await generateEsql({
    nlQuery,
    index: target,
    executeQuery: true,
    modelProvider,
    esClient,
    logger,
    events,
    rowLimit,
    additionalInstructions: customInstructions,
    timeRange,
  });

  return {
    generatedQuery: queryGenResponse.query,
    esqlData: queryGenResponse.results,
    error: queryGenResponse.error,
  };
};
