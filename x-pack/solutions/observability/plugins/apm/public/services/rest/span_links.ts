/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProcessorEvent } from '@kbn/observability-plugin/common';
import { callApmApi } from './create_call_apm_api';
import { reportFetchError } from './report_fetch_error';
import { FETCHER_OPERATION_IDS } from '../../hooks/fetcher_operation_ids';

export const fetchSpanLinks = async (
  {
    traceId,
    docId,
    start,
    end,
    processorEvent,
  }: {
    traceId: string;
    docId: string;
    start: string;
    end: string;
    kuery?: string;
    processorEvent?: ProcessorEvent;
  },
  signal: AbortSignal
) => {
  try {
    return await callApmApi('GET /internal/apm/traces/{traceId}/span_links/{spanId}', {
      params: {
        path: { traceId, spanId: docId },
        query: { kuery: '', start, end, processorEvent },
      },
      signal,
    });
  } catch (error) {
    reportFetchError({ error, operationId: FETCHER_OPERATION_IDS.FETCH_SPAN_LINKS });
    throw error;
  }
};
