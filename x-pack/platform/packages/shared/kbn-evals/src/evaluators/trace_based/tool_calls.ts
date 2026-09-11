/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Evaluator } from '../../types';
import { TRACE_INDEX_PATTERN, createTraceBasedEvaluator } from './factory';

export function createToolCallsEvaluator({
  traceEsClient,
  log,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
}): Evaluator {
  return createTraceBasedEvaluator({
    traceEsClient,
    log,
    config: {
      name: 'Tool Calls',
      direction: 'neutral',
      buildQuery: (traceId) => `FROM ${TRACE_INDEX_PATTERN}
| WHERE trace.id == "${traceId}" AND attributes.elastic.inference.span.kind == "TOOL"
| STATS 
  tool_calls = COUNT(*)`,
      extractResult: (response) => {
        return response.values[0][0] as number;
      },
      // A count of 0 is indistinguishable from "the TOOL spans are not indexed
      // yet": this evaluator reads OTel traces, not the agent's tool trail, so
      // it races span ingestion. Treating that race as a real zero published 19
      // cells for 4.5-sonnet reading `Tool Calls: 0` while their trace clearly
      // showed load_skill and platform.core.cases.manage having run. Retry
      // instead, and let the factory fall back to unreported if the count is
      // still 0 once the trace is complete.
      isResultValid: (result) => result !== null && result > 0,
    },
  });
}
