/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { withActiveInferenceSpan, ElasticGenAIAttributes } from '@kbn/inference-tracing';
import type { ScopedModel } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/logging';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { ToolEventEmitter, ToolHandlerResult } from '@kbn/agent-builder-server';
import type { TimeRange } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools';
import type { TopSnippetsConfig } from '../steps/extract_snippets';
import { createSearchToolGraph } from './graph';

export const runSearchTool = async ({
  nlQuery,
  index,
  rowLimit,
  customInstructions,
  allowPatternTarget = false,
  timeRange,
  model,
  esClient,
  logger,
  events,
  topSnippetsConfig,
}: {
  nlQuery: string;
  index?: string;
  rowLimit?: number;
  customInstructions?: string;
  /** When true, a pattern (e.g. logs-*) targets all matching indices via ESQL. When false, a single index is chosen via index explorer. */
  allowPatternTarget?: boolean;
  timeRange?: TimeRange;
  model: ScopedModel;
  esClient: ElasticsearchClient;
  logger: Logger;
  events: ToolEventEmitter;
  topSnippetsConfig?: TopSnippetsConfig;
}): Promise<ToolHandlerResult[]> => {
  const toolGraph = createSearchToolGraph({
    model,
    esClient,
    logger,
    events,
    topSnippetsConfig,
  });

  return withActiveInferenceSpan(
    'search_tool',
    {
      attributes: {
        [ElasticGenAIAttributes.InferenceSpanKind]: 'CHAIN',
      },
    },
    async () => {
      const resolvedTimeRange = timeRange ?? { from: 'now-24h', to: 'now' };
      const outState = await toolGraph.invoke(
        {
          nlQuery,
          targetPattern: index,
          rowLimit,
          customInstructions,
          allowPatternTarget,
          timeRange: resolvedTimeRange,
        },
        { tags: ['search_tool'], metadata: { graphName: 'search_tool' } }
      );

      if (outState.error) {
        return [
          {
            type: ToolResultType.error,
            data: { message: outState.error },
          },
        ];
      }

      return outState.results;
    }
  );
};
