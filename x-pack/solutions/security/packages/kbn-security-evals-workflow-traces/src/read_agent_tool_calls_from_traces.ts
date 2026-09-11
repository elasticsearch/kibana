/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import pRetry from 'p-retry';

const FILESTORE_READ = 'filestore.read';

interface EsqlResponse {
  columns: Array<{ name: string; type: string }>;
  values: unknown[][];
}

/**
 * Explicit because ES|QL otherwise applies an implicit 1000-row default and
 * truncates silently, which would score routing against a partial trajectory
 * rather than fail visibly.
 */
const TOOL_SPAN_LIMIT = 10_000;

const assertSafeEsqlString = (value: string): string => {
  // Values are interpolated into ES|QL string literals, so reject anything
  // that could break out of one.
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`Unsafe value for ES|QL string literal: ${value}`);
  }
  return value;
};

const buildOrderedToolQuery = ({
  conversationIds,
  indexPattern,
  excludeToolIds,
  includeFailures,
}: {
  conversationIds: string[];
  indexPattern: string;
  excludeToolIds: string[];
  includeFailures: boolean;
}): string => {
  const conversationClause =
    conversationIds.length === 1
      ? `attributes.gen_ai.conversation.id == "${assertSafeEsqlString(conversationIds[0])}"`
      : `attributes.gen_ai.conversation.id IN (${conversationIds
          .map((id) => `"${assertSafeEsqlString(id)}"`)
          .join(', ')})`;

  const excludeClause = excludeToolIds
    .map((id) => `AND tool_id != "${assertSafeEsqlString(id)}"`)
    .join('\n  ');

  return `
FROM ${indexPattern}
| WHERE ${conversationClause}
  AND attributes.elastic.inference.span.kind == "TOOL"
| SORT @timestamp ASC
| EVAL tool_id = COALESCE(attributes.gen_ai.tool.name, name)
| WHERE tool_id IS NOT NULL
  ${excludeClause}
| KEEP @timestamp, tool_id${includeFailures ? ', event.outcome' : ''}
| LIMIT ${TOOL_SPAN_LIMIT}
`.trim();
};

const buildSpanProbeQuery = ({
  conversationIds,
  indexPattern,
}: {
  conversationIds: string[];
  indexPattern: string;
}): string => {
  const conversationClause =
    conversationIds.length === 1
      ? `attributes.gen_ai.conversation.id == "${assertSafeEsqlString(conversationIds[0])}"`
      : `attributes.gen_ai.conversation.id IN (${conversationIds
          .map((id) => `"${assertSafeEsqlString(id)}"`)
          .join(', ')})`;

  return `
FROM ${indexPattern}
| WHERE ${conversationClause}
| STATS span_count = COUNT(*)
`.trim();
};

const parseToolIds = (response: EsqlResponse): string[] => {
  const toolCol = response.columns.findIndex((column) => column.name === 'tool_id');
  if (toolCol === -1) {
    return [];
  }

  return response.values
    .map((row) => row[toolCol])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
};

/**
 * Failures are read from `event.outcome`, which is part of the ECS baseline every
 * trace mapping carries. The original `attributes.gen_ai.tool.call.failed` column
 * only exists on stacks whose inference SDK exports it — on Scout mappings the
 * reference is a hard `verification_exception` (see #288266), which pRetry then
 * multiplied into six failing queries per evaluation.
 */
const parseFailedToolIds = (response: EsqlResponse): string[] => {
  const toolCol = response.columns.findIndex((column) => column.name === 'tool_id');
  const outcomeCol = response.columns.findIndex((column) => column.name === 'event.outcome');
  if (toolCol === -1 || outcomeCol === -1) {
    return [];
  }

  return response.values
    .filter((row) => row[outcomeCol] === 'failure')
    .map((row) => row[toolCol])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
};

const normalizeConversationIds = (conversationIds: string | string[] | undefined): string[] => {
  if (conversationIds === undefined) {
    return [];
  }
  const ids = (Array.isArray(conversationIds) ? conversationIds : [conversationIds]).filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  );
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
};

export interface ReadAgentToolCallsFromTracesParams {
  /** Golden/Scout ES client that holds OTEL traces. Optional → unavailable. */
  traceEsClient: EsClient | undefined;
  /**
   * One or more `ai.agent` conversation ids. Prefer an array when the workflow
   * has multiple agent steps — a single id silently drops later steps' spans.
   */
  conversationIds: string | string[] | undefined;
  log: ToolingLog;
  /** Defaults to `traces-*` (golden cluster / Scout EDOT export). */
  indexPattern?: string;
  /** Tool names to drop from the ordered sequence (default: filestore.read). */
  excludeToolIds?: string[];
  /** When true, also return tools whose ECS `event.outcome` is `failure`. */
  includeFailures?: boolean;
}

export interface ReadAgentToolCallsFromTracesResult {
  toolCallIds: string[];
  failedToolCallIds?: string[];
  /** True when the client/join key was missing, or traces could not be read. */
  unavailable: boolean;
}

/**
 * Reads ordered agent tool-call names from OTEL spans for Watch/Worker evals.
 *
 * This is Security-private eval infra (not `@kbn/evals`): the join key for
 * workflow → `ai.agent` is `conversation_id` ↔ `gen_ai.conversation.id`, which
 * is different from Agent Builder converse evaluators that join on `trace.id`.
 */
export const readAgentToolCallsFromTraces = async ({
  traceEsClient,
  conversationIds,
  log,
  indexPattern = 'traces-*',
  excludeToolIds = [FILESTORE_READ],
  includeFailures = false,
}: ReadAgentToolCallsFromTracesParams): Promise<ReadAgentToolCallsFromTracesResult> => {
  const ids = normalizeConversationIds(conversationIds);

  if (!traceEsClient || ids.length === 0) {
    return { toolCallIds: [], unavailable: true };
  }

  try {
    const response = await pRetry(
      async () => {
        const result = await traceEsClient.transport.request<EsqlResponse>({
          method: 'POST',
          path: '/_query',
          body: {
            query: buildOrderedToolQuery({
              conversationIds: ids,
              indexPattern,
              excludeToolIds,
              includeFailures,
            }),
          },
        });

        const toolCallIds = parseToolIds(result);
        if (toolCallIds.length > 0) {
          return result;
        }

        // Empty tool list may mean "agent called no tools" OR "spans not yet
        // searchable". Probe for any span on these conversation ids; if none
        // exist yet, retry. If spans exist but no TOOL spans, accept empty.
        const probe = await traceEsClient.transport.request<EsqlResponse>({
          method: 'POST',
          path: '/_query',
          body: { query: buildSpanProbeQuery({ conversationIds: ids, indexPattern }) },
        });
        const spanCount = (probe.values[0]?.[0] as number | undefined) ?? 0;
        if (spanCount === 0) {
          throw new Error(`No spans yet for conversation id(s) ${ids.join(', ')} — indexing lag`);
        }

        return result;
      },
      {
        retries: 5,
        minTimeout: 1000,
        maxTimeout: 4000,
        onFailedAttempt: (error) => {
          log.warning(
            `Could not resolve tool calls for conversation id(s) ${ids.join(', ')} ` +
              `(attempt ${error.attemptNumber}/${error.retriesLeft + error.attemptNumber}): ${
                error.message
              }`
          );
        },
      }
    );

    const toolCallIds = parseToolIds(response);
    if (!includeFailures) {
      return { toolCallIds, unavailable: false };
    }

    return {
      toolCallIds,
      failedToolCallIds: parseFailedToolIds(response),
      unavailable: false,
    };
  } catch (error) {
    log.warning(
      `Failed to read agent tool calls for conversation id(s) ${ids.join(', ')}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return { toolCallIds: [], unavailable: true };
  }
};
