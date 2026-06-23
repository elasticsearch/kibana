/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { useAutoplayHelper } from './use_autoplay_helper';
import type { WorkpadRoutingContextType } from '../workpad_routing_context';
import { WorkpadRoutingContext } from '../workpad_routing_context';

const getMockedContext = (context: any) =>
  ({
    nextPage: jest.fn(),
    isFullscreen: false,
    autoplayInterval: 0,
    isAutoplayPaused: false,
    ...context,
  } as WorkpadRoutingContextType);

const getContextWrapper: (context: WorkpadRoutingContextType) => FC<PropsWithChildren<unknown>> =
  (context) =>
  ({ children }) =>
    <WorkpadRoutingContext.Provider value={context}>{children}</WorkpadRoutingContext.Provider>;

describe('useAutoplayHelper', () => {
  beforeEach(() => jest.useFakeTimers({ legacyFakeTimers: true }));
  test('starts the timer when fullscreen and autoplay is on', () => {
    const context = getMockedContext({
      isFullscreen: true,
      autoplayInterval: 1,
    });

    renderHook(useAutoplayHelper, { wrapper: getContextWrapper(context) });

    jest.runAllTimers();

    expect(context.nextPage).toHaveBeenCalled();
  });

  test('stops the timer when autoplay pauses', () => {
    const context = getMockedContext({
      isFullscreen: true,
      autoplayInterval: 1000,
    });

    const { rerender } = renderHook(useAutoplayHelper, { wrapper: getContextWrapper(context) });

    jest.advanceTimersByTime(context.autoplayInterval - 1);

    context.isAutoplayPaused = true;

    rerender();

    jest.runAllTimers();

    expect(context.nextPage).not.toHaveBeenCalled();
  });

  test('starts the timer when autoplay unpauses', () => {
    const context = getMockedContext({
      isFullscreen: true,
      autoplayInterval: 1000,
      isAutoplayPaused: true,
    });

    const { rerender } = renderHook(useAutoplayHelper, { wrapper: getContextWrapper(context) });

    jest.runAllTimers();

    expect(context.nextPage).not.toHaveBeenCalled();

    context.isAutoplayPaused = false;

    rerender();

    jest.runAllTimers();

    expect(context.nextPage).toHaveBeenCalled();
  });

  test('continues cycling to subsequent pages after each navigation', () => {
    const firstNextPage = jest.fn();
    const context = getMockedContext({
      isFullscreen: true,
      autoplayInterval: 1000,
      nextPage: firstNextPage,
    });

    const { rerender } = renderHook(useAutoplayHelper, { wrapper: getContextWrapper(context) });

    // First cycle fires
    jest.advanceTimersByTime(1000);
    expect(firstNextPage).toHaveBeenCalledTimes(1);

    // Simulate navigation: pageNumber changes → nextPage is recreated with a new reference.
    // nextPage is in the effect deps, so the effect re-runs and schedules the next tick.
    const secondNextPage = jest.fn();
    context.nextPage = secondNextPage;
    rerender();

    // Second cycle fires — proves autoplay keeps going rather than stopping after one page
    jest.advanceTimersByTime(1000);
    expect(secondNextPage).toHaveBeenCalledTimes(1);
    expect(firstNextPage).toHaveBeenCalledTimes(1); // only ever called once
  });

  test('calls updated nextPage when page count increases before the timer fires', () => {
    const originalNextPage = jest.fn();
    const context = getMockedContext({
      isFullscreen: true,
      autoplayInterval: 1000,
      nextPage: originalNextPage,
    });

    const { rerender } = renderHook(useAutoplayHelper, { wrapper: getContextWrapper(context) });

    jest.advanceTimersByTime(600);

    // Simulate page addition: React re-renders with a new nextPage.
    // nextPage is in the effect deps, so the effect re-runs, cancelling the
    // in-progress timer and starting a fresh 1000 ms interval.
    const updatedNextPage = jest.fn();
    context.nextPage = updatedNextPage;
    rerender();

    // originalNextPage was never called (timer cancelled before it fired)
    expect(originalNextPage).not.toHaveBeenCalled();

    // 999 ms into the fresh interval — not yet fired
    jest.advanceTimersByTime(999);
    expect(updatedNextPage).not.toHaveBeenCalled();

    // 1000 ms — fires with the updated nextPage, not the stale original
    jest.advanceTimersByTime(1);
    expect(originalNextPage).not.toHaveBeenCalled();
    expect(updatedNextPage).toHaveBeenCalledTimes(1);
  });

  test('calls updated nextPage when page count decreases before the timer fires', () => {
    const originalNextPage = jest.fn();
    const context = getMockedContext({
      isFullscreen: true,
      autoplayInterval: 1000,
      nextPage: originalNextPage,
    });

    const { rerender } = renderHook(useAutoplayHelper, { wrapper: getContextWrapper(context) });

    jest.advanceTimersByTime(600);

    // Simulate page removal: React re-renders with a new nextPage.
    // nextPage is in the effect deps, so the effect re-runs, cancelling the
    // in-progress timer and starting a fresh 1000 ms interval.
    const updatedNextPage = jest.fn();
    context.nextPage = updatedNextPage;
    rerender();

    // originalNextPage was never called (timer cancelled before it fired)
    expect(originalNextPage).not.toHaveBeenCalled();

    // 999 ms into the fresh interval — not yet fired
    jest.advanceTimersByTime(999);
    expect(updatedNextPage).not.toHaveBeenCalled();

    // 1000 ms — fires with the updated nextPage, not the stale original
    jest.advanceTimersByTime(1);
    expect(originalNextPage).not.toHaveBeenCalled();
    expect(updatedNextPage).toHaveBeenCalledTimes(1);
  });

  test('does not call nextPage after page count changes when not in fullscreen', () => {
    const context = getMockedContext({
      isFullscreen: false,
      autoplayInterval: 1000,
    });

    const { rerender } = renderHook(useAutoplayHelper, { wrapper: getContextWrapper(context) });

    // Simulate page added: nextPage is recreated
    const updatedNextPage = jest.fn();
    context.nextPage = updatedNextPage;
    rerender();

    jest.runAllTimers();

    expect(updatedNextPage).not.toHaveBeenCalled();
  });

  test('starts timer with correct nextPage after entering fullscreen following page addition', () => {
    const context = getMockedContext({
      isFullscreen: false,
      autoplayInterval: 1000,
    });

    const { rerender } = renderHook(useAutoplayHelper, { wrapper: getContextWrapper(context) });

    // Simulate page added while not in fullscreen
    const updatedNextPage = jest.fn();
    context.nextPage = updatedNextPage;
    rerender();

    jest.runAllTimers();
    expect(updatedNextPage).not.toHaveBeenCalled();

    // User enters fullscreen — timer should now start with the post-addition nextPage
    context.isFullscreen = true;
    rerender();

    jest.runAllTimers();

    expect(updatedNextPage).toHaveBeenCalledTimes(1);
  });
});
