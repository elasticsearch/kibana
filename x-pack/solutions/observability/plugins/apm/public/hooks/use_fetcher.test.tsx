/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { waitFor, act, renderHook, type RenderHookResult } from '@testing-library/react';
import type { CoreStart } from '@kbn/core/public';
import { createKibanaReactContext } from '@kbn/kibana-react-plugin/public';
import { delay } from '../utils/test_helpers';
import { useFetcher, isPending, FETCH_STATUS } from './use_fetcher';
import { FETCHER_OPERATION_IDS } from './fetcher_operation_ids';
import * as reportFetchErrorModule from '../services/rest/report_fetch_error';

// Wrap the hook with a provider so it can useKibana
const KibanaReactContext = createKibanaReactContext({
  notifications: { toasts: { add: () => {}, danger: () => {} } },
} as unknown as Partial<CoreStart>);

function wrapper({ children }: React.PropsWithChildren) {
  return <KibanaReactContext.Provider>{children}</KibanaReactContext.Provider>;
}

describe('useFetcher', () => {
  describe('when resolving after 500ms', () => {
    let hook: RenderHookResult<ReturnType<typeof useFetcher>, Parameters<typeof useFetcher>>;

    beforeEach(() => {
      jest.useFakeTimers();

      async function fn() {
        await delay(500);
        return 'response from hook';
      }

      hook = renderHook(() => useFetcher(fn, []), { wrapper });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should have loading spinner initially', () => {
      expect(hook.result.current).toEqual({
        data: undefined,
        error: undefined,
        refetch: expect.any(Function),
        status: 'loading',
      });
    });

    it('should still show loading spinner after 100ms', () => {
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(hook.result.current).toEqual({
        data: undefined,
        error: undefined,
        refetch: expect.any(Function),
        status: 'loading',
      });
    });

    it('should show success after 1 second', async () => {
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => expect(hook.result.current.status).toBe('success'));

      expect(hook.result.current).toEqual({
        data: 'response from hook',
        error: undefined,
        refetch: expect.any(Function),
        status: 'success',
      });
    });
  });

  describe('when throwing after 500ms', () => {
    let hook: RenderHookResult<ReturnType<typeof useFetcher>, Parameters<typeof useFetcher>>;

    beforeEach(() => {
      jest.useFakeTimers();

      async function fn(): Promise<string> {
        await delay(500);
        throw new Error('Something went wrong');
      }
      hook = renderHook(() => useFetcher(fn, []), { wrapper });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should have loading spinner initially', () => {
      expect(hook.result.current).toEqual({
        data: undefined,
        error: undefined,
        refetch: expect.any(Function),
        status: 'loading',
      });
    });

    it('should still show loading spinner after 100ms', () => {
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(hook.result.current).toEqual({
        data: undefined,
        error: undefined,
        refetch: expect.any(Function),
        status: 'loading',
      });
    });

    it('should show error after 1 second', async () => {
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => expect(hook.result.current.status).toBe('failure'));

      expect(hook.result.current).toEqual({
        data: undefined,
        error: expect.any(Error),
        refetch: expect.any(Function),
        status: 'failure',
      });
    });
  });

  describe('APM error capture on failure', () => {
    let reportFetchErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.useFakeTimers();
      reportFetchErrorSpy = jest
        .spyOn(reportFetchErrorModule, 'reportFetchError')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      jest.useRealTimers();
      reportFetchErrorSpy.mockRestore();
    });

    async function failingFn(): Promise<string> {
      await delay(500);
      throw new Error('Something went wrong');
    }

    it('captures the error with the operationId label when operationId is provided', async () => {
      const hook = renderHook(
        () => useFetcher(failingFn, [], { operationId: FETCHER_OPERATION_IDS.FETCH_SPAN_LINKS }),
        {
          wrapper,
        }
      );

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => expect(hook.result.current.status).toBe('failure'));

      expect(reportFetchErrorSpy).toHaveBeenCalledTimes(1);
      expect(reportFetchErrorSpy).toHaveBeenCalledWith({
        error: expect.any(Error),
        operationId: FETCHER_OPERATION_IDS.FETCH_SPAN_LINKS,
      });
    });

    it('does not capture the error when no operationId is provided', async () => {
      const hook = renderHook(() => useFetcher(failingFn, []), { wrapper });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => expect(hook.result.current.status).toBe('failure'));

      expect(reportFetchErrorSpy).not.toHaveBeenCalled();
    });

    it('does not capture the error when the request is aborted before it fails', async () => {
      const hook = renderHook(
        () => useFetcher(failingFn, [], { operationId: FETCHER_OPERATION_IDS.FETCH_SPAN_LINKS }),
        {
          wrapper,
        }
      );

      // Unmount triggers cleanup → controller.abort() → signal.aborted = true
      hook.unmount();

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(reportFetchErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('when a hook already has data', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should show "first response" while loading "second response"', async () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const hook = renderHook(({ callback, args }) => useFetcher(callback, args), {
        initialProps: {
          callback: () => Promise.resolve('first response'),
          args: ['a'],
        },
        wrapper,
      });

      expect(hook.result.current).toEqual({
        data: undefined,
        error: undefined,
        refetch: expect.any(Function),
        status: 'loading',
      });

      // assert: first response has loaded and should be rendered
      await waitFor(() =>
        expect(hook.result.current).toEqual({
          data: 'first response',
          error: undefined,
          refetch: expect.any(Function),
          status: 'success',
        })
      );

      // act: re-render hook with async callback
      hook.rerender({
        callback: async () => {
          await delay(500);
          return 'second response';
        },
        args: ['b'],
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      // assert: while loading new data the previous data should still be rendered
      await waitFor(() =>
        expect(hook.result.current).toEqual({
          data: 'first response',
          error: undefined,
          refetch: expect.any(Function),
          status: 'loading',
        })
      );

      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() =>
        expect(hook.result.current).toEqual({
          data: 'second response',
          error: undefined,
          refetch: expect.any(Function),
          status: 'success',
        })
      );
    });

    it('should return the same object reference when data is unchanged between rerenders', async () => {
      const initialProps = {
        callback: () => Promise.resolve('data response'),
        args: ['a'],
      };

      // eslint-disable-next-line react-hooks/exhaustive-deps
      const hook = renderHook(({ callback, args }) => useFetcher(callback, args), {
        initialProps,
        wrapper,
      });

      act(() => {
        jest.runAllTimers();
      });

      // assert: initial data has loaded;
      await waitFor(() =>
        expect(hook.result.current).toEqual(
          expect.objectContaining({
            data: 'data response',
            status: 'success',
          })
        )
      );

      const firstResult = hook.result.current;
      hook.rerender(initialProps);

      expect(hook.result.current).toEqual(
        expect.objectContaining({
          data: 'data response',
          status: 'success',
        })
      );

      const secondResult = hook.result.current;

      // assert: subsequent rerender returns the same object reference
      expect(secondResult === firstResult).toEqual(true);

      hook.rerender({
        callback: () => Promise.resolve('second response'),
        args: ['b'],
      });

      await waitFor(() =>
        expect(hook.result.current).toEqual(
          expect.objectContaining({
            data: 'second response',
            status: 'success',
          })
        )
      );

      const thirdResult = hook.result.current;

      // assert: rerender with different data returns a new object
      expect(secondResult === thirdResult).toEqual(false);
    });
  });

  describe('isPending', () => {
    [FETCH_STATUS.NOT_INITIATED, FETCH_STATUS.LOADING].forEach((status) => {
      it(`returns true when ${status}`, () => {
        expect(isPending(status)).toBeTruthy();
      });
    });

    [FETCH_STATUS.FAILURE, FETCH_STATUS.SUCCESS].forEach((status) => {
      it(`returns false when ${status}`, () => {
        expect(isPending(status)).toBeFalsy();
      });
    });
  });
});
