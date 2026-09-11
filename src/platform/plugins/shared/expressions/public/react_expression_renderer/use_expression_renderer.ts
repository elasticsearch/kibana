/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Reducer, RefObject } from 'react';
import { useRef, useEffect, useLayoutEffect, useReducer } from 'react';
import type { Observable } from 'rxjs';
import { filter } from 'rxjs';
import useUpdateEffect from 'react-use/lib/useUpdateEffect';
import type { ExpressionAstExpression, IInterpreterRenderHandlers } from '../../common';
import { isExpressionValueError } from '../../common';
import { ExpressionLoader } from '../loader';
import type {
  IExpressionLoaderParams,
  ExpressionRenderError,
  ExpressionRendererEvent,
} from '../types';
import { useDebouncedValue } from './use_debounced_value';
import { useShallowMemo } from './use_shallow_memo';

export interface ExpressionRendererParams extends IExpressionLoaderParams {
  debounce?: number;
  expression: string | ExpressionAstExpression;
  hasCustomErrorRenderer?: boolean;
  onData$?<TData, TInspectorAdapters extends unknown>(
    data: TData,
    adapters?: TInspectorAdapters,
    partial?: boolean
  ): void;
  onEvent?(event: ExpressionRendererEvent): void;
  onRender$?(item: number): void;
  /**
   * An observable which can be used to re-run the expression without destroying the component
   */
  reload$?: Observable<unknown>;
  abortController?: AbortController;
}

interface ExpressionRendererState {
  isEmpty: boolean;
  isLoading: boolean;
  error: null | ExpressionRenderError;
}

export function useExpressionRenderer(
  nodeRef: RefObject<HTMLElement>,
  {
    debounce,
    expression,
    hasCustomErrorRenderer,
    onData$,
    onEvent,
    onRender$,
    reload$,
    abortController,
    ...loaderParams
  }: ExpressionRendererParams
): ExpressionRendererState {
  const [{ error, isEmpty, isLoading }, setState] = useReducer<
    Reducer<ExpressionRendererState, Partial<ExpressionRendererState>>
  >((currentState, newState) => ({ ...currentState, ...newState }), {
    isEmpty: true,
    isLoading: false,
    error: null,
  });

  const memoizedOptions = useShallowMemo({ expression, params: useShallowMemo(loaderParams) });
  const [{ expression: debouncedExpression, params: debouncedLoaderParams }, isDebounced] =
    useDebouncedValue(memoizedOptions, debounce);

  const expressionLoaderRef = useRef<ExpressionLoader | null>(null);

  // flag to skip next render$ notification,
  // because of just handled error
  const hasHandledErrorRef = useRef(false);
  // will call done() in LayoutEffect when done with rendering custom error state
  const errorRenderHandlerRef = useRef<IInterpreterRenderHandlers | null>(null);

  useEffect(() => {
    if (abortController?.signal) {
      if (abortController.signal.aborted) {
        expressionLoaderRef.current?.cancel(abortController.signal.reason);
      } else {
        abortController.signal.onabort = () => {
          expressionLoaderRef.current?.cancel(abortController.signal.reason);
        };
      }
    }
  }, [abortController]);

  /* eslint-disable react-hooks/exhaustive-deps */
  // OK to ignore react-hooks/exhaustive-deps because options update is handled by calling .update()
  useEffect(() => {
    expressionLoaderRef.current =
      nodeRef.current &&
      new ExpressionLoader(nodeRef.current, debouncedExpression, {
        ...debouncedLoaderParams,
        // react component wrapper provides different
        // error handling api which is easier to work with from react
        // if custom renderError is not provided then we fallback to default error handling from ExpressionLoader
        onRenderError: (domNode, newError, handlers) => {
          errorRenderHandlerRef.current = handlers;
          setState({
            error: newError,
            isEmpty: false,
            isLoading: false,
          });

          return debouncedLoaderParams.onRenderError?.(domNode, newError, handlers);
        },
      });

    const subscription = expressionLoaderRef.current?.loading$.subscribe(() => {
      hasHandledErrorRef.current = false;
      setState({ isLoading: true });
    });

    return () => {
      subscription?.unsubscribe();
      expressionLoaderRef.current?.destroy();
      expressionLoaderRef.current = null;
      errorRenderHandlerRef.current = null;
    };
  }, [
    debouncedLoaderParams.onRenderError,
    debouncedLoaderParams.interactive,
    debouncedLoaderParams.renderMode,
    debouncedLoaderParams.syncColors,
    debouncedLoaderParams.syncTooltips,
    debouncedLoaderParams.syncCursor,
  ]);

  useEffect(() => {
    const subscription = onEvent && expressionLoaderRef.current?.events$.subscribe(onEvent);

    return () => subscription?.unsubscribe();
  }, [expressionLoaderRef.current, onEvent]);

  useEffect(() => {
    const subscription = expressionLoaderRef.current?.data$.subscribe(({ partial, result }) => {
      setState({
        isEmpty: false,
        ...(!isExpressionValueError(result) ? { error: null } : {}),
      });

      onData$?.(result, expressionLoaderRef.current?.inspect(), partial);
    });

    return () => subscription?.unsubscribe();
  }, [expressionLoaderRef.current, onData$]);

  useEffect(() => {
    const subscription = expressionLoaderRef.current?.render$
      .pipe(filter(() => !hasHandledErrorRef.current))
      .subscribe((item) => {
        setState({
          error: null,
          isEmpty: false,
          isLoading: false,
        });
        onRender$?.(item);
      });

    return () => {
      subscription?.unsubscribe();
    };
  }, [expressionLoaderRef.current, onRender$]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    const subscription = reload$?.subscribe(() => {
      expressionLoaderRef.current?.update(debouncedExpression, debouncedLoaderParams);
    });

    return () => subscription?.unsubscribe();
  }, [reload$, debouncedExpression, debouncedLoaderParams]);

  useUpdateEffect(() => {
    expressionLoaderRef.current?.update(debouncedExpression, debouncedLoaderParams);
  }, [debouncedExpression, debouncedLoaderParams]);

  // call expression loader's done() handler when finished rendering custom error state
  useLayoutEffect(() => {
    if (error && hasCustomErrorRenderer) {
      hasHandledErrorRef.current = true;
      errorRenderHandlerRef.current?.done();
    }

    errorRenderHandlerRef.current = null;
  }, [error, hasCustomErrorRenderer]);

  return {
    error,
    isEmpty,
    isLoading: isLoading || isDebounced,
  };
}
