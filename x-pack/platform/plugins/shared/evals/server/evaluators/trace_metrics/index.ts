/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ESQLSearchResponse } from '@kbn/es-types';
import pRetry from 'p-retry';
import type { EvaluatorDefinition, EvaluatorResult } from '../types';
import { createTraceAccessor } from '../groundedness/trace_accessor';

const rowsFromEsqlResponse = (response: ESQLSearchResponse): Array<Record<string, unknown>> => {
  const columns = response.columns ?? [];
  const values = response.values ?? [];

  return values.map((row) => {
    return columns.reduce<Record<string, unknown>>((acc, column, columnIndex) => {
      acc[column.name] = row[columnIndex];
      return acc;
    }, {});
  });
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsedNumber = Number(value);
    return Number.isFinite(parsedNumber) ? parsedNumber : undefined;
  }

  return undefined;
};

const getTraceMetricResult = async ({
  evaluatorName,
  traceId,
  runEsql,
  query,
  columnName,
  log,
}: {
  evaluatorName: string;
  traceId: string;
  runEsql: (esqlQuery: string) => Promise<ESQLSearchResponse>;
  query: string;
  columnName: string;
  log: Parameters<EvaluatorDefinition['evaluate']>[0]['log'];
}): Promise<EvaluatorResult> => {
  try {
    const score = await pRetry(
      async () => {
        const response = await runEsql(query);
        const rows = rowsFromEsqlResponse(response);
        const firstRow = rows[0];
        if (!firstRow) {
          throw new Error(
            `No trace metric rows returned for evaluator "${evaluatorName}" and trace "${traceId}"`
          );
        }

        const metricValue = asNumber(firstRow[columnName]);
        if (metricValue === undefined) {
          throw new Error(
            `Metric "${columnName}" is not numeric for evaluator "${evaluatorName}" and trace "${traceId}"`
          );
        }

        return metricValue;
      },
      {
        retries: 5,
        factor: 2,
      }
    );

    return {
      scores: [
        {
          name: evaluatorName,
          score,
        },
      ],
    };
  } catch (error) {
    log.warn(
      `Returning unavailable for evaluator "${evaluatorName}" on trace "${traceId}" due to missing/incomplete trace metrics`
    );
    log.debug(error);
    return {
      scores: [
        {
          name: evaluatorName,
          label: 'unavailable',
        },
      ],
    };
  }
};

export const latencyEvaluatorDef: EvaluatorDefinition = {
  name: 'latency',
  version: '1.0.0',
  kind: 'code',
  description: 'Returns total trace latency in seconds.',
  supportedInputs: ['trace'],
  async evaluate({ trace, log }) {
    const accessor = createTraceAccessor(trace);
    const query = `FROM traces-*
| STATS total_duration_ns = MAX(duration)
| EVAL latency_seconds = TO_DOUBLE(total_duration_ns) / 1000000000
| KEEP latency_seconds`;

    return getTraceMetricResult({
      evaluatorName: 'latency',
      traceId: accessor.traceId,
      runEsql: accessor.runEsql,
      query,
      columnName: 'latency_seconds',
      log,
    });
  },
};

export const inputTokensEvaluatorDef: EvaluatorDefinition = {
  name: 'input_tokens',
  version: '1.0.0',
  kind: 'code',
  description: 'Returns summed prompt/input token usage across the trace.',
  supportedInputs: ['trace'],
  async evaluate({ trace, log }) {
    const accessor = createTraceAccessor(trace);
    const query = `FROM traces-*
| STATS input_tokens = SUM(attributes.gen_ai.usage.input_tokens)
| KEEP input_tokens`;

    return getTraceMetricResult({
      evaluatorName: 'input_tokens',
      traceId: accessor.traceId,
      runEsql: accessor.runEsql,
      query,
      columnName: 'input_tokens',
      log,
    });
  },
};

export const outputTokensEvaluatorDef: EvaluatorDefinition = {
  name: 'output_tokens',
  version: '1.0.0',
  kind: 'code',
  description: 'Returns summed completion/output token usage across the trace.',
  supportedInputs: ['trace'],
  async evaluate({ trace, log }) {
    const accessor = createTraceAccessor(trace);
    const query = `FROM traces-*
| STATS output_tokens = SUM(attributes.gen_ai.usage.output_tokens)
| KEEP output_tokens`;

    return getTraceMetricResult({
      evaluatorName: 'output_tokens',
      traceId: accessor.traceId,
      runEsql: accessor.runEsql,
      query,
      columnName: 'output_tokens',
      log,
    });
  },
};

export const toolCallsEvaluatorDef: EvaluatorDefinition = {
  name: 'tool_calls',
  version: '1.0.0',
  kind: 'code',
  description: 'Returns count of TOOL spans associated with the trace.',
  supportedInputs: ['trace'],
  async evaluate({ trace, log }) {
    const accessor = createTraceAccessor(trace);
    const query = `FROM traces-*
| WHERE attributes.elastic.inference.span.kind == "TOOL"
| STATS tool_call_count = COUNT(*)
| KEEP tool_call_count`;

    return getTraceMetricResult({
      evaluatorName: 'tool_calls',
      traceId: accessor.traceId,
      runEsql: accessor.runEsql,
      query,
      columnName: 'tool_call_count',
      log,
    });
  },
};
