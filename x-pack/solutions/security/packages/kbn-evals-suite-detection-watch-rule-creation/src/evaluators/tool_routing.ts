/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { TRACE_INDEX_PATTERN, type Evaluator } from '@kbn/evals';
import { DRAFT_STEP_ID, RULE_CREATION_TOOL_ID } from '../constants';
import type { RuleCreationResult } from '../rule_creation_client';

const TOOL_KIND = 'attributes.elastic.inference.span.kind == "TOOL"';

interface EsqlResponse {
  columns: Array<{ name: string; type: string }>;
  values: Array<Array<number | string | null>>;
}

/**
 * Tool Routing (trace-based, direction: maximize).
 *
 * The workflow's draft_creation step is instructed to call the
 * `security.create_detection_rule` tool; a model that answers from parametric
 * knowledge instead produces plausible rule fields with no tool invocation
 * behind them. This evaluator scores 1 when at least one TOOL span invoking
 * that tool is found for the run.
 *
 * Span lookup is two-stage (#284725 not required):
 *  1. workflow trace id — direct join when agent spans share the workflow root span;
 *  2. the draft step's persisted `conversation_id` via `gen_ai.conversation.id`
 *     — Agent Builder conversations can fork their own root trace, which leaves
 *     stage 1 with zero TOOL spans (measured: every run of builds 455/457).
 *
 * Zero TOOL spans across BOTH stages is NOT a score: it means neither join
 * reached the agent's spans, so the run is scored N/A rather than a false 0
 * (STATS COUNT(*) always returns a row — an unmeasured trace otherwise reads
 * as a confident zero).
 */
/**
 * The draft step's Agent Builder conversation id, when the step persisted one. Exported so
 * the suite's setup probe joins spans exactly the way the evaluator does — a probe that
 * proves reachability on a different key would arm the evaluators dishonestly.
 */
export const extractConversationId = (
  output: RuleCreationResult | undefined
): string | undefined => {
  const draft = (output?.stepExecutions ?? []).find(
    (s) => s.stepId === DRAFT_STEP_ID && s.output != null
  );
  const id = (draft?.output as { conversation_id?: unknown } | null)?.conversation_id;
  return typeof id === 'string' ? id : undefined;
};

/** Join clauses tried, in order, to reach a run's agent tool spans. */
export const toolSpanJoinClauses = ({
  traceId,
  conversationId,
}: {
  traceId?: string;
  conversationId?: string;
}): Array<{ name: string; where: string }> => [
  ...(traceId ? [{ name: 'workflow trace id', where: `trace.id == "${traceId}"` }] : []),
  ...(conversationId
    ? [
        {
          name: 'gen_ai.conversation.id',
          where: `attributes.gen_ai.conversation.id == "${conversationId}"`,
        },
      ]
    : []),
];

export function createToolRoutingEvaluator({
  traceEsClient,
  log,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
}): Evaluator {
  const countToolSpans = async (where: string): Promise<number | undefined> => {
    const response = (await traceEsClient.esql.query({
      query: `FROM ${TRACE_INDEX_PATTERN}\n| WHERE ${where} AND ${TOOL_KIND}\n| STATS tool_calls = COUNT(*),\n  required_tool_calls = COUNT(CASE(attributes.gen_ai.tool.name == "${RULE_CREATION_TOOL_ID}", 1, NULL))`,
    })) as unknown as EsqlResponse;
    const row = response.values?.[0];
    if (!row) return undefined;
    const totalIdx = response.columns.findIndex((c) => c.name === 'tool_calls');
    const reqIdx = response.columns.findIndex((c) => c.name === 'required_tool_calls');
    if (totalIdx === -1 || reqIdx === -1) return undefined;
    const total = row[totalIdx] as number | null | undefined;
    const required = row[reqIdx] as number | null | undefined;
    if (total == null) return undefined;
    if (total === 0) return undefined; // not reported on this join key
    return (required ?? 0) > 0 ? 1 : 0;
  };

  return {
    direction: 'maximize',
    name: 'Tool Routing',
    kind: 'CODE',
    evaluate: async ({ output }) => {
      const result = output as RuleCreationResult | undefined;
      const traceId = result?.traceId;
      const conversationId = extractConversationId(result);
      if (!traceId && !conversationId) {
        return {
          score: null,
          label: 'unavailable',
          explanation: 'No traceId and no draft conversation_id to join tool spans on',
          metadata: undefined,
        };
      }

      // Stages, in order, using the shared join clauses.
      for (const clause of toolSpanJoinClauses({ traceId, conversationId })) {
        try {
          const score = await countToolSpans(clause.where);
          if (score !== undefined) {
            return {
              score,
              label: undefined,
              explanation: `joined on ${clause.name}`,
              metadata: undefined,
            };
          }
        } catch (error) {
          log.debug(
            `Tool Routing ${clause.name} join failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      // Neither key matched. Distinguish "this cluster holds no agent tool spans at all"
      // (export/config problem) from "spans exist but carry different join keys" (attribute
      // drift) — otherwise every future N/A costs another round of manual trace archaeology.
      let diagnosis = 'probe did not run';
      try {
        const probe = (await traceEsClient.esql.query({
          query: `FROM ${TRACE_INDEX_PATTERN}
| WHERE attributes.elastic.inference.span.kind == "TOOL"
| STATS tool_spans = COUNT(*)`,
        })) as unknown as EsqlResponse;
        const total = Number(probe.values?.[0]?.[0] ?? 0);
        diagnosis =
          total > 0
            ? `the cluster holds ${total} TOOL span(s) but none match this run's join keys — ` +
              'attribute drift, compare gen_ai.conversation.id / trace.id on a recent span'
            : 'the cluster holds NO TOOL spans at all — agent spans are not exported to the ' +
              'tracing ES this suite queries (check TRACING_ES_URL and EDOT export)';
      } catch (error) {
        diagnosis = `probe failed: ${error instanceof Error ? error.message : String(error)}`;
      }

      log.warning(`Tool Routing unavailable — ${diagnosis}`);
      return {
        score: null,
        label: 'unavailable',
        explanation: `No TOOL spans reachable via the workflow trace id or the draft conversation_id. ${diagnosis}`,
        metadata: undefined,
      };
    },
  };
}

/**
 * Setup-time assertion that a run's agent tool spans are actually reachable in the tracing
 * cluster, using the SAME join clauses the Tool Routing evaluator scores with.
 *
 * A traceId on the execution document only proves the workflow was traced; it says nothing
 * about whether Agent Builder exported the tool spans the evaluator counts. Asserting the
 * weaker property armed the evaluators on a run that had no agent output at all
 * (measured: build 459, where 6 of 25 runs produced no rule yet setup passed).
 */
export const assertToolSpansReachable = async ({
  traceEsClient,
  probe,
  log,
}: {
  traceEsClient: EsClient;
  probe: RuleCreationResult;
  log: ToolingLog;
}): Promise<void> => {
  if (probe.skipped) {
    log.info('Trace reachability probe was declined by the quality gate — skipping span check');
    return;
  }

  const clauses = toolSpanJoinClauses({
    traceId: probe.traceId,
    conversationId: extractConversationId(probe),
  });

  for (const clause of clauses) {
    try {
      const response = (await traceEsClient.esql.query({
        query: `FROM ${TRACE_INDEX_PATTERN}\n| WHERE ${clause.where} AND ${TOOL_KIND}\n| STATS tool_spans = COUNT(*)`,
      })) as unknown as EsqlResponse;
      if (Number(response.values?.[0]?.[0] ?? 0) > 0) {
        log.info(`Tool spans reachable via ${clause.name}`);
        return;
      }
    } catch (error) {
      log.debug(
        `Reachability probe on ${clause.name} failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  throw new Error(
    `No agent TOOL spans are reachable for the setup probe (tried: ${
      clauses.map((c) => c.name).join(', ') || 'no join keys at all'
    }). Trace-based evaluators would score N/A on every example and the suite would still ` +
      'report a pass. Check that Agent Builder spans are exported to TRACING_ES_URL.'
  );
};
