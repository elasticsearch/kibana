/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { APMEventClient } from '@kbn/apm-data-access-plugin/server';
import { accessKnownApmEventFields } from '@kbn/apm-data-access-plugin/server/utils';
import type { EventOutcome, StatusCode, Transaction } from '@kbn/apm-types';
import { ProcessorEvent } from '@kbn/observability-plugin/common';
import {
  AGENT_NAME,
  AT_TIMESTAMP,
  ATTRIBUTE_HTTP_SCHEME,
  ATTRIBUTE_HTTP_STATUS_CODE,
  DURATION,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  EVENT_OUTCOME,
  FAAS_COLDSTART,
  KIND,
  OTEL_SPAN_LINKS_TRACE_ID,
  PARENT_ID,
  PROCESSOR_EVENT,
  SERVICE_ENVIRONMENT,
  SERVICE_NAME,
  SPAN_COMPOSITE_COMPRESSION_STRATEGY,
  SPAN_COMPOSITE_COUNT,
  SPAN_COMPOSITE_SUM,
  SPAN_DURATION,
  SPAN_ID,
  SPAN_LINKS_TRACE_ID,
  SPAN_NAME,
  SPAN_DESTINATION_SERVICE_RESOURCE,
  SPAN_SUBTYPE,
  SPAN_SYNC,
  SPAN_TYPE,
  STATUS_CODE,
  TIMESTAMP_US,
  TRACE_ID,
  TRANSACTION_DURATION,
  TRANSACTION_ID,
  TRANSACTION_NAME,
  TRANSACTION_RESULT,
} from '../../../common/es_fields/apm';
import { isOpenTelemetryAgentName, isRumAgentName } from '../../../common/agent_name';
import type {
  CompressionStrategy,
  TraceItem,
  TraceItemComposite,
} from '../../../common/waterfall/unified_trace_item';
import type { LogsClient } from '../../lib/helpers/create_es_client/create_logs_client';
import { parseOtelDuration } from '../../lib/helpers/parse_otel_duration';
import { compactMap } from '../../utils/compact_map';
import { getSpanLinksCountById } from '../span_links/get_linked_children';
import { getUnifiedTraceErrors, type UnifiedTraceErrors } from './get_unified_trace_errors';
import { fields, getUnifiedTraceItemsPaginated } from './get_unified_trace_items_page';

export function getErrorsByDocId(unifiedTraceErrors: UnifiedTraceErrors) {
  const groupedErrorsByDocId: Record<
    string,
    Array<{ errorDocId: string; errorDocIndex?: string }>
  > = {};

  unifiedTraceErrors.apmErrors.forEach((errorDoc) => {
    if (errorDoc.span?.id) {
      const errorDocIndex = errorDoc.index;
      (groupedErrorsByDocId[errorDoc.span.id] ??= []).push({
        errorDocId: errorDoc.id,
        ...(errorDocIndex ? { errorDocIndex } : {}),
      });
    }
  });
  unifiedTraceErrors.unprocessedOtelErrors.forEach((errorDoc) => {
    if (errorDoc.span?.id) {
      const errorDocIndex = errorDoc.index;
      (groupedErrorsByDocId[errorDoc.span.id] ??= []).push({
        errorDocId: errorDoc.id,
        ...(errorDocIndex ? { errorDocIndex } : {}),
      });
    }
  });

  return groupedErrorsByDocId;
}

/**
 * Returns both APM documents and unprocessed OTEL spans
 */
export async function getUnifiedTraceItems({
  apmEventClient,
  logsClient,
  maxTraceItems,
  traceId,
  start,
  end,
  serviceName,
  ecsOnly = false,
  focusedDocId,
}: {
  apmEventClient: APMEventClient;
  logsClient: LogsClient;
  maxTraceItems: number;
  traceId: string;
  start: number;
  end: number;
  serviceName?: string;
  ecsOnly?: boolean;
  focusedDocId?: string;
}): Promise<{
  traceItems: TraceItem[];
  unifiedTraceErrors: UnifiedTraceErrors;
  agentMarks: Record<string, number>;
  traceDocsTotal: number;
}> {
  const [unifiedTraceErrors, unifiedTraceItems, incomingSpanLinksCountById] = await Promise.all([
    getUnifiedTraceErrors({
      apmEventClient,
      logsClient,
      traceId,
      start,
      end,
    }),
    getUnifiedTraceItemsPaginated({
      apmEventClient,
      maxTraceItems,
      traceId,
      start,
      end,
      serviceName,
      ecsOnly,
      focusedDocId,
    }),
    getSpanLinksCountById({
      traceId,
      apmEventClient,
      start,
      end,
    }),
  ]);

  const errorsByDocId = getErrorsByDocId(unifiedTraceErrors);
  const agentMarks: Record<string, number> = {};
  const noDestinationTraceItems = new Set<TraceItem>();
  const traceItems = compactMap(unifiedTraceItems.hits, (hit) => {
    const event = accessKnownApmEventFields(hit.fields).requireFields(fields);
    const isTransactionDocument = event[PROCESSOR_EVENT] === ProcessorEvent.transaction;
    if (isTransactionDocument) {
      const source = hit._source as {
        transaction?: Pick<Required<Transaction>['transaction'], 'marks'>;
      };

      if (source.transaction?.marks?.agent) {
        Object.assign(agentMarks, source.transaction.marks.agent);
      }
    }

    const apmDuration = event[SPAN_DURATION] ?? event[TRANSACTION_DURATION];
    const id = event[SPAN_ID] ?? event[TRANSACTION_ID];
    const name = event[SPAN_NAME] ?? event[TRANSACTION_NAME];

    if (!id || !name) {
      return undefined;
    }

    const item = {
      id,
      name,
      timestampUs: event[TIMESTAMP_US] ?? toMicroseconds(event[AT_TIMESTAMP]),
      traceId: event[TRACE_ID],
      duration: resolveDuration(apmDuration, event[DURATION]),
      result: isTransactionDocument
        ? event[TRANSACTION_RESULT]
        : resolveOtelResult(event[ATTRIBUTE_HTTP_SCHEME], event[ATTRIBUTE_HTTP_STATUS_CODE]),
      status: resolveStatus(event[EVENT_OUTCOME], event[STATUS_CODE]),
      errors: errorsByDocId[id] ?? [],
      parentId: event[PARENT_ID],
      serviceName: event[SERVICE_NAME],
      serviceEnvironment: event[SERVICE_ENVIRONMENT],
      type: event[SPAN_SUBTYPE] || event[SPAN_TYPE] || event[KIND],
      sync: event[SPAN_SYNC],
      agentName: event[AGENT_NAME],
      spanLinksCount: {
        incoming: incomingSpanLinksCountById[id] ?? 0,
        outgoing:
          event[SPAN_LINKS_TRACE_ID]?.length || event[OTEL_SPAN_LINKS_TRACE_ID]?.length || 0,
      },
      icon: getTraceItemIcon({
        spanType: event[SPAN_TYPE],
        agentName: event[AGENT_NAME],
        processorEvent: event[PROCESSOR_EVENT],
        kind: event[KIND],
      }),
      coldstart: event[FAAS_COLDSTART],
      composite: resolveComposite(
        event[SPAN_COMPOSITE_COUNT],
        event[SPAN_COMPOSITE_SUM],
        event[SPAN_COMPOSITE_COMPRESSION_STRATEGY]
      ),
      docType: event[PROCESSOR_EVENT] === ProcessorEvent.transaction ? 'transaction' : 'span',
      inputTokens: event[GEN_AI_USAGE_INPUT_TOKENS],
      outputTokens: event[GEN_AI_USAGE_OUTPUT_TOKENS],
    } satisfies TraceItem;
    if (!event[SPAN_DESTINATION_SERVICE_RESOURCE]) {
      noDestinationTraceItems.add(item);
    }
    return item;
  });

  const traceItemById = new Map<string, TraceItem>(traceItems.map((item) => [item.id, item]));
  for (const item of traceItems) {
    if (item.docType === 'transaction' && item.parentId) {
      const parent = traceItemById.get(item.parentId);
      if (
        parent &&
        parent.docType === 'span' &&
        isOpenTelemetryAgentName(parent.agentName ?? '') &&
        noDestinationTraceItems.has(parent)
      ) {
        parent.missingDestination = true;
      }
    }
  }

  return {
    traceItems,
    unifiedTraceErrors,
    agentMarks,
    traceDocsTotal: unifiedTraceItems.total,
  };
}

export function getTraceItemIcon({
  spanType,
  agentName,
  processorEvent,
  kind,
}: {
  spanType?: string;
  agentName?: string;
  processorEvent?: ProcessorEvent;
  kind?: string;
}) {
  if (spanType?.startsWith('db')) {
    return 'database';
  }

  if (processorEvent !== ProcessorEvent.transaction && kind !== 'Server') {
    return undefined;
  }

  return isRumAgentName(agentName) ? 'globe' : 'merge';
}

/**
 * Resolve either an APM or OTEL duration and if OTEL, format the duration from nanoseconds to microseconds.
 */
const resolveDuration = (apmDuration?: number, otelDuration?: number[] | string): number =>
  apmDuration ?? parseOtelDuration(otelDuration);

const toMicroseconds = (ts: string) => new Date(ts).getTime() * 1000; // Convert ms to us

const resolveOtelResult = (
  attributesHttpScheme?: string,
  attributesHttpStatusCode?: string
): string | undefined => {
  return attributesHttpScheme && attributesHttpStatusCode
    ? `${attributesHttpScheme.toUpperCase()} ${attributesHttpStatusCode}`
    : undefined;
};

type EventStatus =
  | { fieldName: 'event.outcome'; value: EventOutcome }
  | { fieldName: 'status.code'; value: StatusCode }
  | undefined;

const resolveStatus = (eventOutcome?: EventOutcome, statusCode?: StatusCode): EventStatus => {
  if (eventOutcome) {
    return { fieldName: EVENT_OUTCOME, value: eventOutcome };
  }

  if (statusCode) {
    return { fieldName: STATUS_CODE, value: statusCode };
  }
};

const isCompressionStrategy = (value?: string): value is CompressionStrategy =>
  value === 'exact_match' || value === 'same_kind';

const resolveComposite = (
  count?: number,
  sum?: number,
  compressionStrategy?: string
): TraceItemComposite | undefined => {
  if (!count || !sum || !isCompressionStrategy(compressionStrategy)) {
    return undefined;
  }

  return { count, sum, compressionStrategy };
};
