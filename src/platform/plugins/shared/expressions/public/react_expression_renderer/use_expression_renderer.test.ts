/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RefObject } from 'react';
import type { RenderHookResult } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { Subject } from 'rxjs';
import type { IInterpreterRenderHandlers } from '../../common';
import type { ExpressionRendererParams } from './use_expression_renderer';
import { useExpressionRenderer } from './use_expression_renderer';
import * as loader from '../loader';

describe('useExpressionRenderer', () => {
  const expressionLoaderSpy = jest.spyOn(loader, 'ExpressionLoader');
  let nodeRef: RefObject<HTMLElement>;
  let expressionLoader: jest.Mocked<loader.ExpressionLoader> & {
    data$: Subject<unknown>;
    events$: Subject<unknown>;
    loading$: Subject<void>;
    render$: Subject<number>;
  };
  let hook: RenderHookResult<ReturnType<typeof useExpressionRenderer>, ExpressionRendererParams>;

  beforeEach(() => {
    nodeRef = { current: document.createElement('div') };
    expressionLoader = {
      data$: new Subject(),
      events$: new Subject(),
      loading$: new Subject(),
      render$: new Subject(),
      cancel: jest.fn(),
      destroy: jest.fn(),
      inspect: jest.fn(),
      update: jest.fn(),
    } as unknown as typeof expressionLoader;

    expressionLoaderSpy.mockImplementation(() => expressionLoader);
    // @ts-expect-error upgrade typescript v5.9.3
    hook = renderHook(
      (params: ExpressionRendererParams) => useExpressionRenderer(nodeRef, params),
      { initialProps: { expression: 'something' } }
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should return default state', () => {
    expect(hook.result.current).toEqual({
      isEmpty: true,
      isLoading: false,
      error: null,
    });
  });

  it('should update loader options on properties change', () => {
    expect(expressionLoader.update).not.toHaveBeenCalled();

    hook.rerender({ expression: 'something else', partial: true });

    expect(expressionLoader.update).toHaveBeenCalledWith('something else', { partial: true });
  });

  it('should debounce property changes', () => {
    jest.useFakeTimers();

    hook.rerender({ debounce: 1000, expression: 'something else' });
    expect(expressionLoader.update).not.toHaveBeenCalled();

    expect(hook.result.current).toEqual(expect.objectContaining({ isLoading: true }));

    act(() => void jest.advanceTimersByTime(1000));
    expect(hook.result.current).toEqual(expect.objectContaining({ isLoading: false }));
    expect(expressionLoader.update).toHaveBeenCalledWith('something else', {});

    jest.useRealTimers();
  });

  it('should not debounce if loader optaions are not changed', () => {
    jest.useFakeTimers();

    hook.rerender({ expression: 'something else', partial: true });
    hook.rerender({
      expression: 'something else',
      debounce: 1000,
      hasCustomErrorRenderer: true,
      partial: true,
    });

    expect(hook.result.current).toEqual(expect.objectContaining({ isLoading: false }));
    expect(expressionLoader.update).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('should handle rendering errors', () => {
    expressionLoaderSpy.mockClear();
    const onRenderError = jest.fn();
    const done = jest.fn();
    hook.rerender({ onRenderError, expression: 'something' });

    expect(expressionLoaderSpy).toHaveBeenCalledTimes(1);

    const [[, , loaderParams]] = expressionLoaderSpy.mock.calls;
    act(() =>
      loaderParams?.onRenderError?.(document.createElement('div'), new Error('something'), {
        done,
      } as unknown as IInterpreterRenderHandlers)
    );

    expect(hook.result.current).toEqual({
      isEmpty: false,
      isLoading: false,
      error: new Error('something'),
    });
    expect(onRenderError).toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
  });

  it('should notify loader handlers on custom error rendering', () => {
    const done = jest.fn();
    hook.rerender({ expression: 'something', hasCustomErrorRenderer: true });

    expect(expressionLoaderSpy).toHaveBeenCalledTimes(1);

    const [[, , loaderParams]] = expressionLoaderSpy.mock.calls;
    act(() =>
      loaderParams?.onRenderError?.(document.createElement('div'), new Error('something'), {
        done,
      } as unknown as IInterpreterRenderHandlers)
    );

    expect(done).toHaveBeenCalled();
  });

  it('should update loading state', () => {
    expect(hook.result.current).toHaveProperty('isLoading', false);
    act(() => expressionLoader.loading$.next());
    expect(hook.result.current).toHaveProperty('isLoading', true);
  });

  it('should call the event handler', () => {
    const onEvent = jest.fn();
    hook.rerender({ onEvent, expression: 'something' });
    act(() => expressionLoader.events$.next('event'));

    expect(onEvent).toHaveBeenCalledWith('event');
  });

  it('should call the data handler', () => {
    const adapters = {};
    const onData$ = jest.fn();
    hook.rerender({ onData$, expression: 'something' });
    expressionLoader.inspect.mockReturnValueOnce(adapters);
    act(() => expressionLoader.data$.next({ partial: true, result: 'something' }));

    expect(onData$).toHaveBeenCalledWith('something', adapters, true);
  });

  it('should update on loader options changes', () => {
    const adapters = {};
    const onData$ = jest.fn();
    hook.rerender({ onData$, expression: 'something' });
    expressionLoader.inspect.mockReturnValueOnce(adapters);
    act(() => expressionLoader.data$.next({ partial: true, result: 'something' }));

    expect(onData$).toHaveBeenCalledWith('something', adapters, true);
  });

  it('should call the render handler', () => {
    const onRender$ = jest.fn();
    hook.rerender({ onRender$, expression: 'something' });
    act(() => expressionLoader.render$.next(1));

    expect(hook.result.current).toEqual({
      isEmpty: false,
      isLoading: false,
      error: null,
    });
    expect(onRender$).toHaveBeenCalledWith(1);
  });

  it('should not call the render handler when there is a custom error renderer', () => {
    const onRender$ = jest.fn();
    hook.rerender({ onRender$, expression: 'something', hasCustomErrorRenderer: true });

    expect(expressionLoaderSpy).toHaveBeenCalledTimes(1);

    const [[, , loaderParams]] = expressionLoaderSpy.mock.calls;
    act(() =>
      loaderParams?.onRenderError?.(document.createElement('div'), new Error('something'), {
        done: jest.fn(),
      } as unknown as IInterpreterRenderHandlers)
    );
    act(() => expressionLoader.render$.next(1));

    expect(hook.result.current).toEqual({
      isEmpty: false,
      isLoading: false,
      error: new Error('something'),
    });
    expect(onRender$).not.toHaveBeenCalled();
  });

  it('should update on reload', () => {
    const reload$ = new Subject<void>();
    hook.rerender({ reload$, expression: 'something' });

    expect(expressionLoader.update).not.toHaveBeenCalled();
    reload$.next();
    expect(expressionLoader.update).toHaveBeenCalledWith('something', {});
  });

  it('should cancel the loader when abortController signal is aborted', () => {
    const abortController = new AbortController();
    hook.rerender({ expression: 'something', abortController });

    expect(expressionLoader.cancel).not.toHaveBeenCalled();

    abortController.abort('test reason');

    expect(expressionLoader.cancel).toHaveBeenCalledWith('test reason');
  });

  it('should immediately cancel the loader when abortController is already aborted', () => {
    const abortController = new AbortController();
    abortController.abort('pre-aborted');

    hook.rerender({ expression: 'something', abortController });

    expect(expressionLoader.cancel).toHaveBeenCalledWith('pre-aborted');
  });
});
