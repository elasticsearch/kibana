/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useContext, useEffect, useRef } from 'react';
import { WorkpadRoutingContext } from '../workpad_routing_context';

export const useAutoplayHelper = () => {
  const { nextPage, isFullscreen, autoplayInterval, isAutoplayPaused } =
    useContext(WorkpadRoutingContext);
  const timer = useRef<number | undefined>(undefined);
  // Assign during the render phase so the callback always holds the latest
  // nextPage even if the timer fires inside the post-paint window before the
  // effect cleanup has had a chance to cancel the previous setTimeout.
  const nextPageRef = useRef(nextPage);
  nextPageRef.current = nextPage;

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = undefined;

    if (isFullscreen && !isAutoplayPaused && autoplayInterval > 0) {
      timer.current = window.setTimeout(() => {
        nextPageRef.current();
      }, autoplayInterval);
    }

    return () => {
      clearTimeout(timer.current);
      timer.current = undefined;
    };
    // nextPage is included so the effect re-runs after each navigation,
    // scheduling the next tick and keeping the cycle going.
  }, [isFullscreen, nextPage, autoplayInterval, isAutoplayPaused]);
};
