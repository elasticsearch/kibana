/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apm } from '@elastic/apm-rum';
import { fetchRootSpanByTraceId } from './fetch_trace_root_span_by_trace_id';
import { FETCHER_OPERATION_IDS } from '../../hooks/fetcher_operation_ids';
import * as createCallApmApi from './create_call_apm_api';

const signal = new AbortController().signal;

describe('fetchRootSpanByTraceId', () => {
  const callApmApiSpy = jest.spyOn(createCallApmApi, 'callApmApi');
  let captureErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    captureErrorSpy = jest.spyOn(apm, 'captureError').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    captureErrorSpy.mockRestore();
  });

  it('captures APM error with kibana_meta_operation_id label and re-throws when callApmApi fails', async () => {
    const error = new Error('boom');
    callApmApiSpy.mockRejectedValueOnce(error);

    await expect(
      fetchRootSpanByTraceId({ traceId: 'trace-1', start: 'from', end: 'to' }, signal)
    ).rejects.toThrow('boom');

    expect(captureErrorSpy).toHaveBeenCalledWith(error, {
      labels: { kibana_meta_operation_id: FETCHER_OPERATION_IDS.FETCH_TRACE_ROOT_SPAN },
    });
  });

  it('does not capture AbortError as a RUM event but still re-throws it', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    callApmApiSpy.mockRejectedValueOnce(abortError);

    await expect(
      fetchRootSpanByTraceId({ traceId: 'trace-1', start: 'from', end: 'to' }, signal)
    ).rejects.toThrow('aborted');

    expect(captureErrorSpy).not.toHaveBeenCalled();
  });
});
