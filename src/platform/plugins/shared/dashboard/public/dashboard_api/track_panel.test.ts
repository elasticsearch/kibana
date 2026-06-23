/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';
import type { DefaultEmbeddableApi } from '@kbn/embeddable-plugin/public';
import { initializeTrackPanel } from './track_panel';
import type { DashboardChildren } from './layout_manager/types';
import type { ViewMode } from '@kbn/presentation-publishing';

const buildChild = (
  uuid: string,
  relatedPanels?: string[]
): DefaultEmbeddableApi & { relatedPanels$?: BehaviorSubject<string[]> } => {
  return {
    uuid,
    type: 'testPanelType',
    ...(relatedPanels ? { relatedPanels$: new BehaviorSubject<string[]>(relatedPanels) } : {}),
  } as unknown as DefaultEmbeddableApi & { relatedPanels$?: BehaviorSubject<string[]> };
};

describe('track panel', () => {
  const mockChildrenSubject = new BehaviorSubject<DashboardChildren>({});
  const mockViewMode = new BehaviorSubject<ViewMode>('edit');
  const { api, cleanup } = initializeTrackPanel(
    async (id: string) => undefined,
    mockChildrenSubject,
    mockViewMode
  );
  const {
    expandPanel,
    expandedPanelId$,
    focusedPanelId$,
    setFocusedPanelId,
    highlightPanelId$,
    highlightPanel,
    relatedPanelsIndicatorId$,
    setRelatedPanelsIndicatorId,
    scrollToPanel,
    scrollPosition$,
    scrollToPanelId$,
    setHighlightPanelId,
    setScrollToPanelId,
    scrollToTop,
    scrollToBottom,
  } = api;

  document.documentElement.scrollTop = 100;
  document.documentElement.scrollTo = jest.fn();
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    value: 600,
  });
  const scrollToSpy = jest.spyOn(document.documentElement, 'scrollTo');

  afterAll(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  describe('expand panel', () => {
    it('should expand the panel', () => {
      expandPanel('expanded-panel-id');
      expect(expandedPanelId$.value).toBe('expanded-panel-id');
      expect(scrollPosition$.value).toBe(100);
    });
  });

  describe('setFocusedPanelId', () => {
    it('should store the ID of the panel to focus', () => {
      setFocusedPanelId('focused-panel-id');
      expect(focusedPanelId$.value).toBe('focused-panel-id');
    });
  });

  describe('setScrollToPanelId', () => {
    it('should store the ID of the panel to scroll to', () => {
      setScrollToPanelId('scroll-to-panel-id');
      expect(scrollToPanelId$.value).toBe('scroll-to-panel-id');
    });
  });

  describe('setHighlightPanelId', () => {
    it('should store the ID of the panel to highlight', () => {
      setHighlightPanelId('highlight-panel-id');
      expect(highlightPanelId$.value).toBe('highlight-panel-id');
    });
  });

  describe('scrollToPanel', () => {
    it('should scroll to the current scrollPosition$ if defined', async () => {
      setScrollToPanelId('scroll-to-scroll-position-panel');

      expect(scrollToPanelId$.value).toBe('scroll-to-scroll-position-panel');
      expect(scrollPosition$.value).toBe(100);

      await scrollToPanel(document.createElement('div'));

      expect(scrollToSpy).toHaveBeenCalledWith({ top: 100, behavior: 'smooth' });
      expect(scrollToPanelId$.value).toBe(undefined);
      expect(scrollPosition$.value).toBe(undefined);
    });

    it('should scroll to panel when panel is below the viewport', async () => {
      setScrollToPanelId('scroll-to-panel-id');
      const mockPanelRef = document.createElement('div');
      mockPanelRef.getBoundingClientRect = jest.fn(
        () =>
          ({
            top: 200,
            bottom: 900,
          } as DOMRect)
      );
      mockPanelRef.scrollIntoView = jest.fn();
      expect(scrollPosition$.value).toBe(undefined);

      await scrollToPanel(mockPanelRef);
      expect(mockPanelRef.getBoundingClientRect).toHaveBeenCalled();
      expect(mockPanelRef.scrollIntoView).toHaveBeenCalledWith({
        block: 'start',
        behavior: 'smooth',
      });
      expect(scrollToPanelId$.value).toBe(undefined);
    });

    it('should scroll to panel when panel is above the viewport', async () => {
      setScrollToPanelId('scroll-to-panel-id');
      const mockPanelRef = document.createElement('div');
      mockPanelRef.getBoundingClientRect = jest.fn(
        () =>
          ({
            top: -100,
            bottom: 400,
          } as DOMRect)
      );
      mockPanelRef.scrollIntoView = jest.fn();
      expect(scrollPosition$.value).toBe(undefined);

      await scrollToPanel(mockPanelRef);
      expect(mockPanelRef.getBoundingClientRect).toHaveBeenCalled();
      expect(mockPanelRef.scrollIntoView).toHaveBeenCalledWith({
        block: 'start',
        behavior: 'smooth',
      });
      expect(scrollToPanelId$.value).toBe(undefined);
    });

    it('should skip the scroll if panel is already within the current viewport', async () => {
      setScrollToPanelId('skip-scroll-to-panel-id');

      const mockPanelRef = document.createElement('div');
      mockPanelRef.getBoundingClientRect = jest.fn(
        () =>
          ({
            top: 200,
            bottom: 500,
          } as DOMRect)
      );
      mockPanelRef.scrollIntoView = jest.fn();

      await scrollToPanel(mockPanelRef);
      expect(mockPanelRef.getBoundingClientRect).toHaveBeenCalled();
      expect(mockPanelRef.scrollIntoView).not.toHaveBeenCalled();
      expect(scrollToPanelId$.value).toBe(undefined);
    });
  });

  describe('highlightPanel', () => {
    it('should set the scroll position to the panel', () => {
      setHighlightPanelId('highlight-panel-id');
      const mockPanelRef = document.createElement('div');
      highlightPanel(mockPanelRef);
      setTimeout(() => {
        expect(mockPanelRef.classList.contains('dshDashboardGrid__item--highlighted')).toBe(true);
      });
      expect(highlightPanelId$.value).toBe(undefined);
    });
  });

  describe('scrollToTop', () => {
    it('should scroll to the top of the dashboard container', () => {
      scrollToTop();
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });
  });

  describe('scrollToBottom', () => {
    it('should scroll to the bottom of the dashboard container', () => {
      scrollToBottom();
      expect(scrollToSpy).toHaveBeenCalledWith({
        top: document.body.scrollHeight,
        behavior: 'smooth',
      });
    });
  });

  describe('setRelatedPanelsIndicatorId', () => {
    it('updates the subject', () => {
      setRelatedPanelsIndicatorId('control-id');
      expect(relatedPanelsIndicatorId$.value).toBe('control-id');

      setRelatedPanelsIndicatorId(undefined);
      expect(relatedPanelsIndicatorId$.value).toBeUndefined();
    });
  });

  describe('blurredPanelIds$', () => {
    // Use an isolated initializeTrackPanel for these tests so we can drive children$ + selection
    // without other state leaking in from prior cases.
    const setupBlurTest = () => {
      const children$ = new BehaviorSubject<DashboardChildren>({});
      const viewMode$ = new BehaviorSubject<ViewMode>('edit');
      const { api: blurApi, cleanup: blurCleanup } = initializeTrackPanel(
        async () => undefined,
        children$,
        viewMode$
      );
      return { children$, blurApi, blurCleanup, viewMode$ };
    };

    it('starts with no blurred panels', () => {
      const { blurApi, blurCleanup } = setupBlurTest();
      expect(blurApi.blurredPanelIds$.value).toEqual([]);
      blurCleanup();
    });

    it('blurs all unrelated siblings when the focused panel publishes relatedPanels$', () => {
      const { children$, blurApi, blurCleanup } = setupBlurTest();
      children$.next({
        snake: buildChild('snake', ['lizard']),
        lizard: buildChild('lizard'),
        sparrow: buildChild('sparrow'),
        salamander: buildChild('salamander'),
      });

      blurApi.setFocusedPanelId('snake');

      // siblings minus focusedChildId minus relatedPanels = ['sparrow', 'salamander']
      expect(blurApi.blurredPanelIds$.value.sort()).toEqual(['salamander', 'sparrow']);
      blurCleanup();
    });

    it('clears blurred panels when switching from edit to view mode', () => {
      const { children$, blurApi, blurCleanup, viewMode$ } = setupBlurTest();
      children$.next({
        snake: buildChild('snake', ['lizard']),
        lizard: buildChild('lizard'),
        sparrow: buildChild('sparrow'),
      });

      blurApi.setFocusedPanelId('snake');
      expect(blurApi.blurredPanelIds$.value).toEqual(['sparrow']);

      viewMode$.next('view');
      expect(blurApi.blurredPanelIds$.value).toEqual([]);
      blurCleanup();
    });

    it('clears blurred panels when focus is removed', () => {
      const { children$, blurApi, blurCleanup } = setupBlurTest();
      children$.next({
        snake: buildChild('snake', ['lizard']),
        lizard: buildChild('lizard'),
        sparrow: buildChild('sparrow'),
      });

      blurApi.setFocusedPanelId('snake');
      expect(blurApi.blurredPanelIds$.value).toEqual(['sparrow']);

      blurApi.setFocusedPanelId(undefined);
      expect(blurApi.blurredPanelIds$.value).toEqual([]);
      blurCleanup();
    });

    it('falls back to relatedPanelsIndicatorId when no panel is focused', () => {
      const { children$, blurApi, blurCleanup } = setupBlurTest();
      children$.next({
        otter: buildChild('otter', ['beaver']),
        beaver: buildChild('beaver'),
        crow: buildChild('crow'),
      });

      blurApi.setRelatedPanelsIndicatorId('otter');
      expect(blurApi.blurredPanelIds$.value).toEqual(['crow']);

      blurApi.setRelatedPanelsIndicatorId(undefined);
      expect(blurApi.blurredPanelIds$.value).toEqual([]);
      blurCleanup();
    });

    it('prefers focusedPanelId over relatedPanelsIndicatorId when both are set', () => {
      const { children$, blurApi, blurCleanup } = setupBlurTest();
      children$.next({
        fox: buildChild('fox', ['hare']),
        hare: buildChild('hare'),
        owl: buildChild('owl', ['mouse']),
        mouse: buildChild('mouse'),
      });

      blurApi.setRelatedPanelsIndicatorId('owl');
      expect(blurApi.blurredPanelIds$.value.sort()).toEqual(['fox', 'hare']);

      blurApi.setFocusedPanelId('fox');
      // now relatedPanels$ of 'fox' is the source of truth: ['hare']
      // siblings minus focused minus related = ['owl', 'mouse']
      expect(blurApi.blurredPanelIds$.value.sort()).toEqual(['mouse', 'owl']);
      blurCleanup();
    });

    it("derives related panels from siblings when the selected panel doesn't publish relatedPanels$", () => {
      const { children$, blurApi, blurCleanup } = setupBlurTest();
      // 'badger' doesn't publish relatedPanels$, but 'mole' and 'hedgehog' both list 'badger' as related.
      children$.next({
        badger: buildChild('badger'),
        mole: buildChild('mole', ['badger']),
        hedgehog: buildChild('hedgehog', ['badger']),
        squirrel: buildChild('squirrel', ['acorn']),
      });

      blurApi.setFocusedPanelId('badger');
      // siblings minus focused minus derivedRelated(['mole','hedgehog']) = ['squirrel']
      expect(blurApi.blurredPanelIds$.value).toEqual(['squirrel']);
      blurCleanup();
    });

    it("reacts to relatedPanels$ updates on the focused panel's API", () => {
      const { children$, blurApi, blurCleanup } = setupBlurTest();
      const wolfRelated$ = new BehaviorSubject<string[]>(['raven']);
      children$.next({
        wolf: {
          uuid: 'wolf',
          type: 'testPanelType',
          relatedPanels$: wolfRelated$,
        } as unknown as DefaultEmbeddableApi,
        raven: buildChild('raven'),
        moose: buildChild('moose'),
      });

      blurApi.setFocusedPanelId('wolf');
      expect(blurApi.blurredPanelIds$.value).toEqual(['moose']);

      wolfRelated$.next(['moose']);
      expect(blurApi.blurredPanelIds$.value).toEqual(['raven']);
      blurCleanup();
    });
  });
});
