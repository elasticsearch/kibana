/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apm } from '@elastic/apm-rum';
import { isAbortError, reportFetchError } from './report_fetch_error';
import { FETCHER_OPERATION_IDS } from '../../hooks/fetcher_operation_ids';

describe('report_fetch_error', () => {
  describe('isAbortError', () => {
    it('returns true for an Error whose name is AbortError', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';

      expect(isAbortError(error)).toBe(true);
    });

    it('returns false for a regular Error', () => {
      expect(isAbortError(new Error('boom'))).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(isAbortError('AbortError')).toBe(false);
      expect(isAbortError(undefined)).toBe(false);
      expect(isAbortError(null)).toBe(false);
    });
  });

  describe('reportFetchError', () => {
    let captureErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      captureErrorSpy = jest.spyOn(apm, 'captureError').mockImplementation(() => {});
    });

    afterEach(() => {
      captureErrorSpy.mockRestore();
    });

    it('captures the error with the operation id label', () => {
      const error = new Error('boom');

      reportFetchError({ error, operationId: FETCHER_OPERATION_IDS.FETCH_SPAN_LINKS });

      expect(captureErrorSpy).toHaveBeenCalledWith(error, {
        labels: {
          kibana_meta_operation_id: FETCHER_OPERATION_IDS.FETCH_SPAN_LINKS,
        },
      });
    });

    it('skips AbortError', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';

      reportFetchError({ error, operationId: FETCHER_OPERATION_IDS.FETCH_SPAN_LINKS });

      expect(captureErrorSpy).not.toHaveBeenCalled();
    });

    it('skips non-Error values', () => {
      reportFetchError({ error: 'boom', operationId: FETCHER_OPERATION_IDS.FETCH_SPAN_LINKS });

      expect(captureErrorSpy).not.toHaveBeenCalled();
    });
  });
});
