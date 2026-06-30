/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { APIReturnType } from './create_call_apm_api';
import { callApmApi } from './create_call_apm_api';
import { reportFetchError } from './report_fetch_error';
import { FETCHER_OPERATION_IDS } from '../../hooks/fetcher_operation_ids';

type TraceRootSpan = APIReturnType<'GET /internal/apm/unified_traces/{traceId}/root_span'>;

export const fetchRootSpanByTraceId = async (
  {
    traceId,
    start,
    end,
  }: {
    traceId: string;
    start: string;
    end: string;
  },
  signal: AbortSignal
): Promise<TraceRootSpan | undefined> => {
  try {
    return await callApmApi('GET /internal/apm/unified_traces/{traceId}/root_span', {
      params: {
        path: { traceId },
        query: {
          start,
          end,
        },
      },
      signal,
    });
  } catch (error) {
    reportFetchError({ error, operationId: FETCHER_OPERATION_IDS.FETCH_TRACE_ROOT_SPAN });
    throw error;
  }
};
