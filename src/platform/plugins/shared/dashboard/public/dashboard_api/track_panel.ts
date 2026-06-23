/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import { BehaviorSubject, combineLatest, map, of, Subject, switchMap } from 'rxjs';
import {
  scrollToTop,
  scrollToBottom,
  scrollTo,
  getViewportBoundaries,
  getScrollPosition,
} from '@kbn/core-chrome-layout-utils';
import type { ViewMode } from '@kbn/presentation-publishing';
import { apiPublishesRelatedPanels } from '@kbn/presentation-publishing';
import type { DashboardChildren } from './layout_manager/types';

export const highlightAnimationDuration = 2000;

export function initializeTrackPanel(
  untilLoaded: (id: string) => Promise<undefined>,
  children$: Observable<DashboardChildren>,
  viewMode$: BehaviorSubject<ViewMode>
) {
  const expandedPanelId$ = new BehaviorSubject<string | undefined>(undefined);
  const focusedPanelId$ = new BehaviorSubject<string | undefined>(undefined);
  const highlightPanelId$ = new BehaviorSubject<string | undefined>(undefined);
  const scrollToPanelId$ = new BehaviorSubject<string | undefined>(undefined);
  const scrollToBottom$ = new Subject<void>();
  const scrollPosition$ = new BehaviorSubject<number | undefined>(undefined);
  const relatedPanelsIndicatorId$ = new BehaviorSubject<string | undefined>(undefined);

  function setScrollToPanelId(id: string | undefined) {
    if (scrollToPanelId$.value !== id) scrollToPanelId$.next(id);
  }

  function setExpandedPanelId(id: string | undefined) {
    if (expandedPanelId$.value !== id) expandedPanelId$.next(id);
  }

  const blurredPanelIds$ = new BehaviorSubject<string[]>([]);
  const blurredPanelIdsSubscription = combineLatest([
    children$,
    focusedPanelId$,
    relatedPanelsIndicatorId$,
    viewMode$,
  ])
    .pipe(
      // Get the relatedPanels$ subject of the focused panel and use it to determine blurred panels
      map(([children, focusedPanelId, relatedPanelsIndicatorId, viewMode]) => {
        // To decide whether to blur a panel, a panel in focus takes precedence over something indicating related panels
        const idToCompareForBlur = focusedPanelId ?? relatedPanelsIndicatorId;
        if (!idToCompareForBlur || viewMode !== 'edit') {
          return of({
            focusedChildId: '',
            relatedPanels: [],
            siblings: [],
          });
        }

        const siblings = Object.keys(children);
        const focusedChild = children[idToCompareForBlur];
        const relatedPanels$ = apiPublishesRelatedPanels(focusedChild)
          ? focusedChild.relatedPanels$
          : // If the focused child doesn't publish related panels, derive which panels it's related to from all other panels that do
            combineLatest(
              Object.entries(children)
                .map(([id, sibling]) =>
                  apiPublishesRelatedPanels(sibling)
                    ? sibling.relatedPanels$.pipe(
                        map((relatedPanels) => ({
                          id,
                          relatedPanels,
                        }))
                      )
                    : null
                )
                .filter((result) => result !== null)
            ).pipe(
              map((entries) =>
                entries
                  .map(({ id, relatedPanels }) =>
                    relatedPanels.includes(idToCompareForBlur) ? id : null
                  )
                  .filter((result) => result !== null)
              )
            );
        return relatedPanels$.pipe(
          map((relatedPanels) => ({ focusedChildId: idToCompareForBlur, relatedPanels, siblings }))
        );
      }),
      switchMap((result) => result)
    )
    .subscribe(({ relatedPanels, siblings, focusedChildId }) => {
      blurredPanelIds$.next(
        siblings.filter(
          (siblingId) => siblingId !== focusedChildId && !relatedPanels.includes(siblingId)
        )
      );
    });

  return {
    api: {
      expandedPanelId$,
      expandPanel: (panelId: string) => {
        const isPanelExpanded = panelId === expandedPanelId$.value;

        if (isPanelExpanded) {
          setExpandedPanelId(undefined);
          setScrollToPanelId(panelId);
          return;
        }

        setExpandedPanelId(panelId);
        scrollPosition$.next(getScrollPosition());
      },
      focusedPanelId$,
      highlightPanelId$,
      highlightPanel: (panelRef: HTMLDivElement) => {
        const id = highlightPanelId$.value;
        if (!id) return;

        untilLoaded(id).then(async () => {
          // Adds the highlight class in the next event loop to allow the DOM to update
          await new Promise((res) => setTimeout(res, 0));
          panelRef.classList.add('dshDashboardGrid__item--highlighted');
          // Removes the class after the highlight animation finishes
          await new Promise((res) => setTimeout(res, highlightAnimationDuration));
          panelRef.classList.remove('dshDashboardGrid__item--highlighted');
        });

        highlightPanelId$.next(undefined);
      },
      relatedPanelsIndicatorId$,
      setRelatedPanelsIndicatorId: (panelId: string | undefined) => {
        relatedPanelsIndicatorId$.next(panelId);
      },
      scrollToPanelId$,
      scrollToPanel: async (panelRef: HTMLDivElement) => {
        const id = scrollToPanelId$.value;
        if (!id) return;

        untilLoaded(id).then(() => {
          if (scrollPosition$.value !== undefined) {
            scrollTo({ top: scrollPosition$.value, behavior: 'smooth' });
            scrollPosition$.next(undefined);
          } else {
            const { top: viewportTop, bottom: viewportBottom } = getViewportBoundaries();
            const { top: panelTop, bottom: panelBottom } = panelRef.getBoundingClientRect();

            // only scroll if panel is not fully visible within the current viewport
            if (panelTop < viewportTop || panelBottom > viewportBottom) {
              panelRef.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }
          }

          setScrollToPanelId(undefined);
        });
      },
      scrollPosition$,
      scrollToTop: () => {
        scrollToTop({ behavior: 'smooth' });
      },
      scrollToBottom$,
      scrollToBottom: () => {
        scrollToBottom({ behavior: 'smooth' });
      },
      setFocusedPanelId: (id: string | undefined) => {
        if (focusedPanelId$.value !== id) focusedPanelId$.next(id);
        setScrollToPanelId(id);
      },
      setHighlightPanelId: (id: string | undefined) => {
        if (highlightPanelId$.value !== id) highlightPanelId$.next(id);
      },
      setScrollToPanelId,
      blurredPanelIds$,
    },
    cleanup: () => {
      blurredPanelIdsSubscription.unsubscribe();
    },
  };
}
