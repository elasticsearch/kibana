/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { isValidTraceId } from '@opentelemetry/api';
import pRetry from 'p-retry';
import type { Direction } from '@kbn/evals-common';
import type { Evaluator } from '../../types';

interface EsqlResponse {
  columns: Array<{ name: string; type: string }>;
  values: any[][];
}

// Returned by `fetchStats` when the metric is not measurable for this trace, to keep the
// "no value" case distinct from a legitimate score.
const NOT_REPORTED = Symbol('notReported');

/**
 * Index pattern every trace-based evaluator reads spans from.
 *
 * `traces-*` alone is not enough. On a remote tracing cluster the API key is
 * granted on the datastream BACKING indices (`.ds-traces-generic*`,
 * `.ds-traces-agent_builder*`), which `traces-*` does not match -- so the
 * pattern resolves to zero authorized indices and ES|QL reports
 * `Unknown column [trace.id]`. That reads like "this model emitted no spans"
 * but means "this key may not see any index under that pattern", and it
 * silently nulled every trace metric (Tool Calls, Latency, tokens,
 * SkillInvoked) for runs pointed at the golden cluster.
 *
 * Both forms are listed so the evaluators work against a local Scout cluster
 * (plain datastream name) and a remote one (backing indices) without knowing
 * which they were handed.
 */
export const TRACE_INDEX_PATTERN = 'traces-*,.ds-traces-*';

export interface TraceBasedEvaluatorConfig {
  name: string;
  buildQuery: (traceId: string) => string;
  extractResult: (response: EsqlResponse) => number | null;
  // Optional validation for the extracted result. Return false to signal the trace data looks incomplete, which triggers a retry
  isResultValid?: (result: number | null) => boolean;
  // Trace is present but never emitted this metric, so retrying cannot help. Scored as unreported
  // rather than zero, which the provider never measured.
  isNotReported?: (response: EsqlResponse) => boolean;
  // An unmapped column makes ES|QL reject the query, leaving no row for `isNotReported`. Re-asks
  // without it: a complete trace means unreported rather than not yet indexed.
  notReportedProbe?: {
    matchesQueryError: (error: unknown) => boolean;
    buildQuery: (traceId: string) => string;
    isTraceComplete: (response: EsqlResponse) => boolean;
  };
  /**
   * Whether a higher score is an improvement (`maximize`), a lower score is
   * an improvement (`minimize`), or the score cannot be compared across arms
   * at all (`neutral`).
   */
  direction: Direction;
}

export function createTraceBasedEvaluator({
  traceEsClient,
  log,
  config,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
  config: TraceBasedEvaluatorConfig;
}): Evaluator {
  const {
    name,
    buildQuery,
    extractResult,
    isResultValid,
    isNotReported,
    notReportedProbe,
    direction,
  } = config;

  return {
    direction,
    evaluate: async ({ output }) => {
      const traceId = (output as any)?.traceId;

      if (!traceId) {
        return {
          score: null,
          label: 'unavailable',
          explanation: `No traceId available for ${name} evaluation`,
          metadata: undefined,
        };
      }

      const isTraceIdValid = typeof traceId === 'string' && isValidTraceId(traceId);
      if (!isTraceIdValid) {
        log.error(`Invalid traceId for ${name} (traceId: ${traceId})`);
        return {
          score: null,
          label: 'error',
          explanation: 'Invalid traceId',
          metadata: undefined,
        };
      }

      let lastResult: number | null | undefined;

      async function runQuery(query: string): Promise<EsqlResponse> {
        return (await traceEsClient.esql.query({ query })) as unknown as EsqlResponse;
      }

      // Anything the probe cannot vouch for stays a failure, so real query errors still surface.
      async function probeNotReported(error: unknown): Promise<typeof NOT_REPORTED> {
        if (!notReportedProbe?.matchesQueryError(error)) {
          throw error;
        }

        let probeResponse: EsqlResponse;
        try {
          probeResponse = await runQuery(notReportedProbe.buildQuery(traceId));
        } catch {
          // Probe failed too, so nothing can be concluded about the trace.
          throw error;
        }

        if (!probeResponse.values?.length || !notReportedProbe.isTraceComplete(probeResponse)) {
          throw error;
        }

        log.debug(
          `${name} is not reported by this provider (column missing from the mapping), trace ${traceId} is otherwise complete`
        );
        return NOT_REPORTED;
      }

      async function fetchStats(): Promise<number | typeof NOT_REPORTED> {
        const query = buildQuery(traceId);

        let response: EsqlResponse;
        try {
          response = await runQuery(query);
        } catch (error) {
          return probeNotReported(error);
        }

        const { values } = response;

        if (!values || values.length === 0) {
          throw new Error(`No data found for trace`);
        }

        if (isNotReported?.(response)) {
          return NOT_REPORTED;
        }

        const result = extractResult(response);

        const valid = isResultValid ? isResultValid(result) : result !== null;
        if (!valid) {
          // A value rejected by a custom `isResultValid` must not become the retry
          // fallback below, which republishes the last value seen. Remembering it would
          // resurrect exactly what validation rejected: a `Tool Calls: 0` produced by
          // unindexed TOOL spans is indistinguishable from a real zero, and 25 published
          // cells read `0` next to a trace that plainly shows tools running. An unscored
          // cell is honest; a fabricated zero is not. A plain `null` (no custom validator)
          // still records, so the existing `potentially_incomplete` path is unchanged.
          if (!isResultValid) {
            lastResult = result;
          }
          throw new Error(`${name} result looks incomplete (value: ${result}), retrying`);
        }

        lastResult = result;

        return result as number;
      }

      try {
        const score = await pRetry(fetchStats, {
          // The budget must exceed the OTel collector's flush lag (~3-7 min on
          // sweep VMs): `Unknown column [trace.id]` means no traces-* index
          // exists yet, and a 62s budget (5 x factor-2 retries) burns entirely
          // inside that empty window, erroring every trace evaluator on
          // otherwise healthy runs (observed on Azure shard 1/2, run 9).
          retries: 8,
          factor: 2,
          minTimeout: 5000,
          maxTimeout: 120000,
          onFailedAttempt: (error) => {
            log.debug(
              `${name} query failed on attempt ${error.attemptNumber}, ${error.retriesLeft} retries left (traceId: ${traceId}): ${error.message}`
            );
          },
        });

        if (score === NOT_REPORTED) {
          return {
            score: null,
            label: 'unavailable',
            explanation: `${name} was not reported for trace ${traceId}`,
          };
        }

        return {
          score,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Exhausting the retry budget is not a suite failure while a usable value is still
        // available, so this stays below `error` to keep genuine failures visible in CI output.
        if (lastResult !== undefined) {
          log.warning(
            `${name} returning potentially incomplete result for trace ${traceId}: ${lastResult} (${errorMessage})`
          );
          return {
            score: lastResult,
            label: 'potentially_incomplete',
            explanation: `${name} may be based on incomplete trace data`,
            metadata: { incomplete: true },
          };
        }

        log.error(`Failed to evaluate ${name} for trace ${traceId}: ${errorMessage}`);
        return {
          label: 'error',
          explanation: `Failed to retrieve ${name}: ${errorMessage}`,
        };
      }
    },
    kind: 'CODE',
    name,
  };
}
