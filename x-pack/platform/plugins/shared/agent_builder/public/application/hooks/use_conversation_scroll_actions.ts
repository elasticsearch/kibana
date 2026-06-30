/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const AT_BOTTOM_THRESHOLD = 50;
const SMOOTH_SCROLL_TIMEOUT_MS = 2000;

const isAtBottom = (el: HTMLElement) =>
  el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_THRESHOLD;

export const useConversationScrollActions = ({
  conversationId,
  scrollContainer,
}: {
  conversationId: string;
  scrollContainer: HTMLDivElement | null;
}) => {
  const stuckToBottomRef = useRef(true);
  const smoothScrollingRef = useRef(false);
  const pendingSmoothScrollRef = useRef(false);
  const smoothScrollFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollGenRef = useRef(0);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const cancelSmoothScroll = useCallback(() => {
    scrollGenRef.current++;
    if (smoothScrollFallbackTimerRef.current !== null) {
      clearTimeout(smoothScrollFallbackTimerRef.current);
      smoothScrollFallbackTimerRef.current = null;
    }
    smoothScrollingRef.current = false;
  }, []);

  const stickToBottom = useCallback(() => {
    if (!scrollContainer) return;
    cancelSmoothScroll();
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    stuckToBottomRef.current = true;
    setShowScrollButton(false);
  }, [scrollContainer, cancelSmoothScroll]);

  const doSmoothScroll = useCallback(() => {
    if (!scrollContainer) return;

    if (smoothScrollFallbackTimerRef.current !== null) {
      clearTimeout(smoothScrollFallbackTimerRef.current);
    }

    smoothScrollingRef.current = true;
    const gen = ++scrollGenRef.current;
    const scrollTarget = scrollContainer.scrollHeight - scrollContainer.clientHeight;

    const onComplete = () => {
      smoothScrollingRef.current = false;
      const reachedTarget =
        Math.abs(scrollContainer.scrollTop - scrollTarget) <= AT_BOTTOM_THRESHOLD;
      if (isAtBottom(scrollContainer) || reachedTarget) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        stuckToBottomRef.current = true;
        setShowScrollButton(false);
      } else {
        stuckToBottomRef.current = false;
        setShowScrollButton(true);
      }
    };

    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });

    scrollContainer.addEventListener(
      'scrollend',
      () => {
        if (gen !== scrollGenRef.current) return;
        if (smoothScrollFallbackTimerRef.current !== null) {
          clearTimeout(smoothScrollFallbackTimerRef.current);
          smoothScrollFallbackTimerRef.current = null;
        }
        onComplete();
      },
      { once: true }
    );

    smoothScrollFallbackTimerRef.current = setTimeout(() => {
      smoothScrollFallbackTimerRef.current = null;
      if (gen !== scrollGenRef.current) return;
      onComplete();
    }, SMOOTH_SCROLL_TIMEOUT_MS);
  }, [scrollContainer]);

  useEffect(() => {
    cancelSmoothScroll();
    pendingSmoothScrollRef.current = false;
    stuckToBottomRef.current = true;
    if (!scrollContainer) return;
    const onScroll = () => {
      if (smoothScrollingRef.current) return;
      const atBottom = isAtBottom(scrollContainer);
      stuckToBottomRef.current = atBottom;
      setShowScrollButton(!atBottom);
    };
    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', onScroll);
  }, [scrollContainer, cancelSmoothScroll]);

  useEffect(() => {
    if (!scrollContainer) return;
    const observer = new ResizeObserver(() => {
      if (!stuckToBottomRef.current) return;
      if (smoothScrollingRef.current) {
        pendingSmoothScrollRef.current = false;
        return;
      }
      if (pendingSmoothScrollRef.current) {
        pendingSmoothScrollRef.current = false;
        if (!isAtBottom(scrollContainer)) {
          doSmoothScroll();
        }
      } else {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    });
    const inner = scrollContainer.firstElementChild;
    if (inner) observer.observe(inner);
    return () => observer.disconnect();
  }, [scrollContainer, doSmoothScroll]);

  useEffect(() => {
    if (!scrollContainer || !conversationId) return;
    stickToBottom();
  }, [conversationId, scrollContainer, stickToBottom]);

  const smoothScrollToBottom = useCallback(() => {
    if (!scrollContainer) return;
    if (smoothScrollingRef.current) return;
    if (isAtBottom(scrollContainer)) {
      stuckToBottomRef.current = true;
      setShowScrollButton(false);
      return;
    }
    setShowScrollButton(false);
    doSmoothScroll();
  }, [scrollContainer, doSmoothScroll]);

  const onMessageSent = useCallback(() => {
    if (!scrollContainer) return;
    stuckToBottomRef.current = true;
    pendingSmoothScrollRef.current = true;
    setShowScrollButton(false);
  }, [scrollContainer]);

  return {
    showScrollButton,
    onMessageSent,
    smoothScrollToBottom,
    stickToBottom,
  };
};
