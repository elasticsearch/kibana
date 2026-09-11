/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getSafe } from '@kbn/std';
import deepEqual from 'fast-deep-equal';
import { cloneDeep, filter, map as lodashMap, max, pick } from 'lodash';
import {
  BehaviorSubject,
  combineLatest,
  combineLatestWith,
  debounceTime,
  distinctUntilChanged,
  map,
  merge,
  mergeMap,
  skip,
  startWith,
  tap,
  type Observable,
} from 'rxjs';
import { v4 } from 'uuid';

import { METRIC_TYPE } from '@kbn/analytics';
import { DEFAULT_PINNED_CONTROL_STATE } from '@kbn/controls-constants';
import type {
  PinnedControlLayoutState,
  PinnedControlLayoutState as PinnedPanelLayoutState,
} from '@kbn/controls-schemas';
import type {
  DefaultEmbeddableApi,
  EmbeddablePackageState,
  LayoutConstraints,
} from '@kbn/embeddable-plugin/public';
import { PanelNotFoundError, PlacementStrategy } from '@kbn/embeddable-plugin/public';
import type { GridLayoutData, GridPanelData, GridSectionData } from '@kbn/grid-layout';
import { i18n } from '@kbn/i18n';
import type { PanelPackage, SerializedTitles } from '@kbn/presentation-publishing';
import {
  apiHasLibraryTransforms,
  apiHasSerializableState,
  apiPublishesTitle,
  childrenLatestState$,
  childrenUnsavedChanges$,
  getTitle,
  logStateDiff,
  shouldLogStateDiff,
  UNSAVED_CHANGES_DEBOUNCE,
} from '@kbn/presentation-publishing';
import { asyncForEach } from '@kbn/std';
import type { MaybePromise } from '@kbn/utility-types';

import type { DashboardPanel } from '@kbn/as-code-dashboard-schema';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { DEFAULT_PANEL_HEIGHT, DEFAULT_PANEL_WIDTH } from '../../../common/constants';
import { dashboardClonePanelActionStrings } from '../../dashboard_actions/_dashboard_actions_strings';
import { getPanelAddedSuccessString } from '../../dashboard_app/_dashboard_app_strings';
import { placeClonePanel, runPanelPlacementStrategy } from '../../panel_placement';
import { getPlacementHints } from '../../panel_placement/get_placement_hints';
import {
  coreServices,
  embeddableService,
  usageCollectionService,
} from '../../services/kibana_services';
import { DASHBOARD_UI_METRIC_ID } from '../../utils/telemetry_constants';
import type { initializeTrackPanel } from '../track_panel';
import type { initializeViewModeManager } from '../view_mode_manager';
import {
  areLayoutsEqual,
  arePanelLayoutsEqual,
  arePinnedPanelLayoutsEqual,
} from './are_layouts_equal';
import { deserializeLayout } from './deserialize_layout';
import { serializeLayout } from './serialize_layout';
import {
  isDashboardLayoutPanel,
  type DashboardChildren,
  type DashboardLayout,
  type DashboardLayoutPanel,
  type DashboardPinnablePanel,
} from './types';

export function initializeLayoutManager(
  viewModeManager: ReturnType<typeof initializeViewModeManager>,
  initialPanels: DashboardState['panels'],
  initialPinnedPanels: DashboardState['pinned_panels'],
  trackPanel: ReturnType<typeof initializeTrackPanel>['api']
) {
  // --------------------------------------------------------------------------------------
  // Set up panel state manager
  // --------------------------------------------------------------------------------------
  const childrenStateLoading$ = new BehaviorSubject<boolean>(false);
  const children$ = new BehaviorSubject<DashboardChildren>({});
  const { layout: initialLayout, childState: initialChildState } = deserializeLayout(
    initialPanels,
    initialPinnedPanels
  );
  let currentChildState = cloneDeep(initialChildState);

  const layout$ = new BehaviorSubject<DashboardLayout>(initialLayout); // layout is the source of truth for which panels are in the dashboard.
  const gridLayout$ = new BehaviorSubject(transformDashboardLayoutToGridLayout(initialLayout, {})); // source of truth for rendering
  const panelResizeSettings$: Observable<{ [panelType: string]: LayoutConstraints }> = layout$.pipe(
    map(({ panels }) => {
      return [...new Set(Object.values(panels).map((panel) => panel.type))];
    }),
    distinctUntilChanged(deepEqual),
    mergeMap(async (panelTypes: string[]) => {
      const resizeConstraints: { [panelType: string]: LayoutConstraints } = {};
      await asyncForEach(panelTypes, async (type) => {
        const embeddableDefinition = await embeddableService.getEmbeddableDefinition(type);
        if (embeddableDefinition && embeddableDefinition.layoutConstraints) {
          resizeConstraints[type] = embeddableDefinition.layoutConstraints;
        }
      });
      return resizeConstraints;
    }),
    startWith({}) // do not block rendering by waiting for these settings
  );

  /** Keep gridLayout$ in sync with layout$ + panelResizeSettings$ */
  const gridLayoutSubscription = combineLatest([layout$, panelResizeSettings$]).subscribe(
    ([layout, panelResizeSettings]) => {
      gridLayout$.next(transformDashboardLayoutToGridLayout(layout, panelResizeSettings));
    }
  );

  const latestChildrenState$ = childrenLatestState$(children$);
  const childrenChanges$ = childrenUnsavedChanges$(children$);
  const stateChangedSubscription = latestChildrenState$.subscribe((childrenState) => {
    for (const { uuid, latestState } of childrenState) {
      currentChildState[uuid] = latestState;
    }
  });

  /** Observable that publishes `true` when all children APIs are available */
  const childrenLoading$ = combineLatest([children$, layout$, viewModeManager.api.viewMode$]).pipe(
    map(([children, layout, viewMode]) => {
      const renderedPanelCount = Object.keys(layout.panels).filter((uuid) => {
        const sectionId = layout.panels[uuid].grid.sectionId;
        return !(sectionId && isSectionCollapsed(sectionId)); // if a panel is collapseed, it does not render
      }).length;
      const expectedChildCount = renderedPanelCount + Object.keys(layout.pinnedPanels).length;

      const currentChildCount = Object.keys(children).filter((uuid) => {
        const sectionId = layout.panels[uuid]?.grid.sectionId; // uuid might reference a pinned panel
        return !(sectionId && isSectionCollapsed(sectionId)); // if a panel is collapsed, it should never trigger loading, even if the API exists
      }).length;

      return expectedChildCount !== currentChildCount;
    }),
    distinctUntilChanged()
  );

  let lastSavedLayout = initialLayout;
  let lastSavedChildState = initialChildState;

  const resetLayout = async (state: DashboardState) => {
    try {
      childrenStateLoading$.next(true);

      const { layout: layoutToApply, childState: childStateToApply } = deserializeLayout(
        state.panels,
        state.pinned_panels
      );

      if (!areLayoutsEqual(layout$.getValue(), layoutToApply)) {
        layout$.next({ ...layoutToApply }); // triggers removeOrphanedChildrenSubscription to purge orphaned children
      }
      currentChildState = cloneDeep(childStateToApply);

      const setStatePromises: MaybePromise<void>[] = [];
      for (const [uuid, child] of Object.entries(children$.value)) {
        const nextChildState = cloneDeep(childStateToApply[uuid]); // prevent shallow copies from being mutated unexpectedly
        if (nextChildState && apiHasSerializableState(child)) {
          setStatePromises.push(child.applySerializedState(nextChildState));
        }
      }
      await Promise.all(setStatePromises);
    } finally {
      childrenStateLoading$.next(false);
    }
  };

  /**
   * When panels are removed from the layout (e.g. a section with panels is deleted, layout is reset),
   * remove their APIs from children$.
   */
  const removeOrphanedChildrenSubscription = layout$.subscribe((layout) => {
    const currentChildren = children$.value;
    const removedUuids = Object.keys(currentChildren).filter(
      (uuid) => !layout.panels[uuid] && !layout.pinnedPanels[uuid]
    );
    if (removedUuids.length === 0) return;

    const updatedChildren = { ...currentChildren };
    for (const uuid of removedUuids) {
      delete updatedChildren[uuid];
      delete currentChildState[uuid];
    }
    children$.next(updatedChildren);
  });

  // --------------------------------------------------------------------------------------
  // Panel placement functions
  // --------------------------------------------------------------------------------------
  const placeNewPanel = async (
    uuid: string,
    panelPackage: PanelPackage,
    grid?: DashboardPanel['grid'],
    beside?: string
  ): Promise<DashboardLayout> => {
    const { panelType: type, serializedState } = panelPackage;
    if (grid) {
      return {
        ...layout$.value,
        panels: {
          ...layout$.value.panels,
          [uuid]: { grid, type },
        },
      };
    }
    const placementHints = await getPlacementHints(type, serializedState);
    const updatedLayout = runPanelPlacementStrategy(placementHints.strategy, {
      currentLayout: layout$.value,
      newPanel: {
        type,
        uuid,
        grid: {
          w: placementHints.width,
          h: placementHints.height,
        },
      },
      beside,
    });

    return updatedLayout;
  };

  // --------------------------------------------------------------------------------------
  // Place incoming embeddables (used at init and for late arrivals on the same dashboard)
  // --------------------------------------------------------------------------------------
  const addIncomingEmbeddables = (embeddables?: EmbeddablePackageState[]) => {
    if (!embeddables?.length) return;
    const first = embeddables[0];
    if (!first.embeddableId) first.embeddableId = v4(); // give first panel an ID so we can place others around it

    for (const incomingEmbeddable of embeddables) {
      const { serializedState, size, type } = incomingEmbeddable;
      const uuid = incomingEmbeddable.embeddableId ?? v4();
      const existingPanel: DashboardLayoutPanel | undefined = layout$.value.panels[uuid];
      const sameType = existingPanel?.type === type;

      const updatedLayout = existingPanel
        ? {
            ...layout$.value,
            panels: {
              ...layout$.value.panels,
              [uuid]: { grid: existingPanel.grid, type },
            },
          }
        : runPanelPlacementStrategy(PlacementStrategy.findTopLeftMostOpenSpace, {
            currentLayout: layout$.value,
            newPanel: {
              uuid,
              type,
              grid: {
                w: size?.width ?? DEFAULT_PANEL_WIDTH,
                h: size?.height ?? DEFAULT_PANEL_HEIGHT,
              },
            },
            /**
             * We can assume that all panels being sent as a single package are related; so,
             * place them close together by grouping them around the first embeddable.
             */
            beside: uuid === first.embeddableId ? undefined : first.embeddableId,
          });
      currentChildState[uuid] = {
        ...(sameType && currentChildState[uuid] ? currentChildState[uuid] : {}),
        ...serializedState,
      };

      layout$.next(updatedLayout);
    }
    trackPanel.setScrollToPanelId(first.embeddableId);
    trackPanel.setHighlightPanelId(first.embeddableId);
  };

  // --------------------------------------------------------------------------------------
  // API definition
  // --------------------------------------------------------------------------------------
  function getDashboardPanelFromId(panelId: string) {
    const childLayout =
      getSafe(layout$.value.panels, panelId) ?? getSafe(layout$.value.pinnedPanels, panelId);
    const childApi = children$.value[panelId];
    if (!childApi || !childLayout) throw new PanelNotFoundError();
    const isPinned = !('grid' in childLayout);
    return {
      type: childLayout.type,
      grid: !isPinned ? childLayout.grid : null,
      serializedState: apiHasSerializableState(childApi) ? childApi.serializeState() : {},
    };
  }

  async function getPanelTitles(): Promise<string[]> {
    const titles: string[] = [];
    await asyncForEach(Object.keys(layout$.value.panels), async (id) => {
      const childApi = await getChildApi(id);
      const title = apiPublishesTitle(childApi) ? getTitle(childApi) : '';
      if (title) titles.push(title);
    });
    return titles;
  }

  const createPanel = (panelPackage: PanelPackage) => {
    const { serializedState, maybePanelId } = panelPackage;
    const uuid = maybePanelId ?? v4();

    if (serializedState) currentChildState[uuid] = serializedState;

    return uuid;
  };

  const addNewPanel = async <ApiType>(
    panelPackage: PanelPackage,
    options?: {
      displaySuccessMessage?: boolean;
      scrollToPanel?: boolean;
      beside?: string;
    },
    grid?: DashboardPanel['grid']
  ) => {
    const uuid = createPanel(panelPackage);
    const { serializedState, panelType } = panelPackage;
    usageCollectionService?.reportUiCounter(DASHBOARD_UI_METRIC_ID, METRIC_TYPE.CLICK, panelType);

    layout$.next(await placeNewPanel(uuid, panelPackage, grid, options?.beside));

    const { scrollToPanel, displaySuccessMessage } = {
      scrollToPanel: true,
      displaySuccessMessage: false,
      ...options,
    };
    if (displaySuccessMessage) {
      const title = (serializedState as SerializedTitles)?.title;
      coreServices.notifications.toasts.addSuccess({
        title: getPanelAddedSuccessString(title),
        'data-test-subj': 'addEmbeddableToDashboardSuccess',
      });
    }
    if (scrollToPanel) {
      trackPanel.setScrollToPanelId(uuid);
    }
    trackPanel.setHighlightPanelId(uuid);
    return (await getChildApi(uuid)) as ApiType;
  };

  const removePanel = (uuid: string) => {
    const currentLayout = layout$.value;
    const panels = { ...currentLayout.panels };
    const pinnedPanels = { ...currentLayout.pinnedPanels };
    if (panels[uuid]) {
      delete panels[uuid];
      layout$.next({ ...layout$.value, panels });
    } else if (pinnedPanels[uuid]) {
      delete pinnedPanels[uuid];
      // Recompute the order of the remaining pinned panels
      const newPinnedPanels: typeof pinnedPanels = Object.entries(pinnedPanels)
        .sort(([, a], [, b]) => a.order - b.order)
        .reduce(
          (result, [key, value], i) => ({ ...result, [key as string]: { ...value, order: i } }),
          {}
        );
      layout$.next({ ...layout$.value, pinnedPanels: newPinnedPanels });
    }

    const children = { ...children$.value };
    if (children[uuid]) {
      delete children[uuid];
      children$.next(children);
    }
    if (currentChildState[uuid]) {
      delete currentChildState[uuid];
    }
  };

  const replacePanel = async (idToRemove: string, panelPackage: PanelPackage) => {
    try {
      childrenStateLoading$.next(true);
      const existingGridData = layout$.value.panels[idToRemove]?.grid;
      const existingPinnedPanelData = layout$.value.pinnedPanels[idToRemove];
      if (!existingGridData && !existingPinnedPanelData) throw new PanelNotFoundError();

      removePanel(idToRemove);
      if (existingGridData) {
        const newPanel = await addNewPanel<DefaultEmbeddableApi>(
          panelPackage,
          { displaySuccessMessage: false },
          existingGridData
        );
        return newPanel.uuid;
      } else {
        const prevLayoutState = pick(existingPinnedPanelData, 'grow', 'width', 'order');
        const newPanel = await addPinnedPanel(panelPackage, prevLayoutState);
        return newPanel.uuid;
      }
    } finally {
      childrenStateLoading$.next(false);
    }
  };

  const duplicatePanel = async (uuidToDuplicate: string) => {
    const layoutItemToDuplicate = layout$.value.panels[uuidToDuplicate];
    const apiToDuplicate = children$.value[uuidToDuplicate];
    if (!apiToDuplicate || !layoutItemToDuplicate) throw new PanelNotFoundError();

    const allTitles = await getPanelTitles();
    const lastTitle = apiPublishesTitle(apiToDuplicate) ? getTitle(apiToDuplicate) ?? '' : '';
    const newTitle = getClonedPanelTitle(allTitles, lastTitle);

    const uuidOfDuplicate = v4();
    const serializedState = apiHasLibraryTransforms(apiToDuplicate)
      ? apiToDuplicate.getSerializedStateByValue()
      : apiToDuplicate.serializeState();
    (serializedState as SerializedTitles).title = newTitle;

    currentChildState[uuidOfDuplicate] = serializedState;

    const updatedLayout = placeClonePanel({
      currentLayout: layout$.value,
      newPanel: {
        uuid: uuidOfDuplicate,
        type: layoutItemToDuplicate.type,
        grid: {
          w: layoutItemToDuplicate.grid.w,
          h: layoutItemToDuplicate.grid.h,
          sectionId: layoutItemToDuplicate.grid.sectionId,
        },
      },
      placeBesideId: uuidToDuplicate,
    });
    layout$.next(updatedLayout);

    coreServices.notifications.toasts.addSuccess({
      title: dashboardClonePanelActionStrings.getSuccessMessage(),
      'data-test-subj': 'addObjectToContainerSuccess',
    });
    trackPanel.setScrollToPanelId(uuidOfDuplicate);
    trackPanel.setHighlightPanelId(uuidOfDuplicate);
  };

  const pinPanel = (uuid: string, panelToPin: DashboardPinnablePanel) => {
    // add control panel to the end of the pinned panels
    const newPinnedPanels = { ...layout$.getValue().pinnedPanels };

    newPinnedPanels[uuid] = {
      type: panelToPin.type as PinnedControlLayoutState['type'],
      order: panelToPin.order ?? Object.keys(newPinnedPanels).length,
      width: panelToPin.width ?? DEFAULT_PINNED_CONTROL_STATE.width,
      grow: panelToPin.grow ?? DEFAULT_PINNED_CONTROL_STATE.grow,
    };
    const newPanels = { ...layout$.getValue().panels };
    delete newPanels[uuid];

    // update the layout with the control panel removed and added as a pinned control
    layout$.next({ ...layout$.getValue(), panels: newPanels, pinnedPanels: newPinnedPanels });
  };

  const addPinnedPanel = async (
    panelPackage: PanelPackage,
    prevLayoutState?: Partial<PinnedControlLayoutState>
  ) => {
    const { serializedState } = panelPackage;
    const { grow, width, ...panelState } =
      (serializedState as PinnedControlLayoutState) ?? DEFAULT_PINNED_CONTROL_STATE;
    const newPanelUuid = createPanel({ ...panelPackage, serializedState: panelState });
    const layoutState = {
      ...(serializedState ? { grow, width } : {}),
      ...prevLayoutState,
    };
    const panelToPin = {
      type: panelPackage.panelType,
      ...layoutState,
    };
    pinPanel(newPanelUuid, panelToPin);
    return (await getChildApi(newPanelUuid)) ?? { uuid: newPanelUuid };
  };

  const getChildApi = async (uuid: string): Promise<DefaultEmbeddableApi | undefined> => {
    const { panels, pinnedPanels } = layout$.value;
    // Typescript erroneously believes panels[uuid] cannot be undefined, so we need to add these Object.hasOwn
    // checks to get the type signature of panelLayout to be correct
    const panelLayout = Object.hasOwn(panels, uuid)
      ? panels[uuid]
      : Object.hasOwn(pinnedPanels, uuid)
      ? pinnedPanels[uuid]
      : undefined;
    if (!panelLayout) throw new PanelNotFoundError();
    if (children$.value[uuid]) return children$.value[uuid];

    // if the panel is in a collapsed section and has never been built, then childApi will be undefined
    if (isDashboardLayoutPanel(panelLayout) && isSectionCollapsed(panelLayout.grid.sectionId)) {
      return undefined;
    }

    return new Promise((resolve) => {
      const subscription = merge(children$, layout$).subscribe(() => {
        if (children$.value[uuid]) {
          subscription.unsubscribe();
          resolve(children$.value[uuid]);
        }

        // If we hit this, the panel was removed before the embeddable finished loading.
        if (!Object.hasOwn(panels, uuid) && !Object.hasOwn(pinnedPanels, uuid)) {
          subscription.unsubscribe();
          resolve(undefined);
        }
      });
    });
  };

  function isSectionCollapsed(sectionId?: string): boolean {
    const { sections } = layout$.getValue();
    return Boolean(sectionId && sections[sectionId].collapsed);
  }

  return {
    internalApi: {
      anyStateChange$: merge(
        layout$.pipe(skip(1)),
        latestChildrenState$.pipe(debounceTime(UNSAVED_CHANGES_DEBOUNCE))
      ).pipe(
        debounceTime(0), // batch state + layout updates
        map(() => undefined)
      ),
      childrenStateLoading$,
      getSerializedStateForPanel: (panelId: string) => currentChildState[panelId],
      getLastSavedStateForPanel: (panelId: string) => lastSavedChildState[panelId],
      gridLayout$,
      childrenLoading$,
      reset: resetLayout,
      serializeLayout: () => serializeLayout(layout$.value, currentChildState),

      startComparing: (
        lastSavedState$: BehaviorSubject<DashboardState>
      ): Observable<{
        panels?: DashboardState['panels'];
        pinned_panels?: DashboardState['pinned_panels'];
      }> => {
        return combineLatest([layout$, childrenChanges$]).pipe(
          debounceTime(100),
          combineLatestWith(
            lastSavedState$.pipe(
              map((lastSaved) => deserializeLayout(lastSaved.panels, lastSaved.pinned_panels)),
              tap(({ layout, childState }) => {
                lastSavedChildState = childState;
                lastSavedLayout = layout;
              })
            )
          ),
          map(([[currentLayout, childrenChanges]]) => {
            const hasPanelChanges =
              childrenChanges.some(
                (childChanges) =>
                  childChanges.hasUnsavedChanges && childChanges.uuid in currentLayout.panels
              ) || !arePanelLayoutsEqual(lastSavedLayout, currentLayout);
            const hasPinnedPanelChanges =
              childrenChanges.some(
                (childChanges) =>
                  childChanges.hasUnsavedChanges && childChanges.uuid in currentLayout.pinnedPanels
              ) || !arePinnedPanelLayoutsEqual(lastSavedLayout, currentLayout);

            if (!hasPanelChanges && !hasPinnedPanelChanges) {
              return {};
            }

            const { pinned_panels, panels } = serializeLayout(currentLayout, currentChildState);
            if (shouldLogStateDiff()) {
              const { pinned_panels: oldPinnedPanels, panels: oldPanels } = serializeLayout(
                lastSavedLayout,
                lastSavedChildState
              );
              if (hasPanelChanges) {
                logStateDiff('dashboard panels', oldPanels, panels);
              }
              if (hasPinnedPanelChanges) {
                logStateDiff('dashboard pinned panels', oldPinnedPanels, pinned_panels);
              }
            }

            return {
              ...(hasPanelChanges ? { panels } : {}),
              ...(hasPinnedPanelChanges ? { pinned_panels } : {}),
            };
          })
        );
      },

      isSectionCollapsed,
    },
    api: {
      layout$,
      getLayout: (id: string) => {
        const layout = layout$.getValue();
        return layout.panels[id] ?? layout.pinnedPanels[id];
      },
      setLayout: (id: string, newLayout: DashboardLayoutPanel | PinnedPanelLayoutState) => {
        const layout = { ...layout$.getValue() };
        if (layout.panels[id] && 'grid' in newLayout) {
          layout.panels[id] = newLayout;
        } else if (layout.pinnedPanels[id] && 'width' in newLayout) {
          layout.pinnedPanels[id] = newLayout;
        }
        layout$.next(layout);
      },
      registerChildApi: (api: DefaultEmbeddableApi) => {
        children$.next({
          ...children$.value,
          [api.uuid]: api,
        });
      },

      /** Panels */
      children$,
      getChildApi,
      addNewPanel,
      addIncomingEmbeddables,
      removePanel,
      replacePanel,
      duplicatePanel,
      getDashboardPanelFromId,
      getPanelCount: () => Object.keys(layout$.value.panels).length,
      canRemovePanels: () => trackPanel.expandedPanelId$.value === undefined,

      /** Pinned panels (only controls can currently be pinned) */
      panelIsPinned: (uuid: string) => {
        return Object.keys(layout$.getValue().pinnedPanels).includes(uuid);
      },
      unpinPanel: (uuid: string) => {
        const panelToUnpin = layout$.getValue().pinnedPanels[uuid];
        if (!panelToUnpin) return;

        const newPinnedPanels = { ...layout$.getValue().pinnedPanels };
        const originalOrder = newPinnedPanels[uuid].order;
        delete newPinnedPanels[uuid];
        // adjust the order of the remaining pinned panels
        for (const panelId of Object.keys(newPinnedPanels)) {
          if (newPinnedPanels[panelId].order > originalOrder) newPinnedPanels[panelId].order--;
        }
        // place the new control panel in the top left corner, bumping other panels down as necessary
        const updatedLayout = runPanelPlacementStrategy(PlacementStrategy.placeAtTop, {
          currentLayout: layout$.value,
          newPanel: {
            uuid,
            type: panelToUnpin.type,
            grid: {
              w: 12,
              h: 2,
            },
          },
        });

        // update the layout with the pinned control removed and added as a panel
        layout$.next({
          ...updatedLayout,
          pinnedPanels: newPinnedPanels,
        });
      },
      pinPanel: (uuid: string) => {
        const controlToPin = layout$.getValue().panels[uuid];
        if (!controlToPin) return;

        pinPanel(uuid, controlToPin);
      },
      addPinnedPanel,

      /** Sections */
      addNewSection: () => {
        const currentLayout = layout$.getValue();

        // find the max y so we know where to add the section
        let maxY = 0;
        [...Object.values(currentLayout.panels), ...Object.values(currentLayout.sections)].forEach(
          (widget) => {
            const { y, h } = { h: 1, ...widget.grid };
            maxY = Math.max(maxY, y + h);
          }
        );

        // add the new section
        const sections = { ...currentLayout.sections };
        const newId = v4();
        sections[newId] = {
          grid: { y: maxY },
          title: i18n.translate('dashboard.defaultSectionTitle', {
            defaultMessage: 'New collapsible section',
          }),
          collapsed: false,
        };
        layout$.next({
          ...currentLayout,
          sections,
        });
        trackPanel.scrollToBottom$.next();
      },
      getPanelSection: (uuid: string) => {
        return layout$.getValue().panels[uuid]?.grid?.sectionId;
      },
      panelSection$: (uuid: string) => {
        return layout$.pipe(
          // pinned panels and panels in global section are treated identically; i.e. their section is `undefined`
          map((layout) => layout.panels[uuid]?.grid?.sectionId),
          distinctUntilChanged() // only trigger re-fetch when section changes
        );
      },
    },
    cleanup: () => {
      stateChangedSubscription.unsubscribe();
      gridLayoutSubscription.unsubscribe();
      removeOrphanedChildrenSubscription.unsubscribe();
    },
  };
}

function getClonedPanelTitle(panelTitles: string[], rawTitle: string) {
  if (rawTitle === '') return '';

  const clonedTag = dashboardClonePanelActionStrings.getClonedTag();
  const cloneRegex = new RegExp(`\\(${clonedTag}\\)`, 'g');
  const cloneNumberRegex = new RegExp(`\\(${clonedTag} [0-9]+\\)`, 'g');
  const baseTitle = rawTitle.replace(cloneNumberRegex, '').replace(cloneRegex, '').trim();
  const similarTitles = filter(panelTitles, (title: string) => {
    return title.startsWith(baseTitle);
  });

  const cloneNumbers = lodashMap(similarTitles, (title: string) => {
    if (title.match(cloneRegex)) return 0;
    const cloneTag = title.match(cloneNumberRegex);
    return cloneTag ? parseInt(cloneTag[0].replace(/[^0-9.]/g, ''), 10) : -1;
  });
  const similarBaseTitlesCount = max(cloneNumbers) || 0;

  return similarBaseTitlesCount < 0
    ? baseTitle + ` (${clonedTag})`
    : baseTitle + ` (${clonedTag} ${similarBaseTitlesCount + 1})`;
}

const transformDashboardLayoutToGridLayout = (
  layout: DashboardLayout,
  resizeSettings: { [panelType: string]: LayoutConstraints }
) => {
  const newLayout: GridLayoutData = {};
  Object.keys(layout.sections).forEach((sectionId) => {
    const section = layout.sections[sectionId];
    newLayout[sectionId] = {
      id: sectionId,
      type: 'section',
      row: section.grid.y,
      isCollapsed: Boolean(section.collapsed),
      title: section.title,
      panels: {},
    };
  });
  Object.keys(layout.panels).forEach((panelId) => {
    const grid = layout.panels[panelId].grid;
    const type = layout.panels[panelId].type;
    const basePanel = {
      id: panelId,
      row: grid.y,
      column: grid.x,
      width: grid.w,
      height: grid.h,
      resizeOptions: resizeSettings[type],
    } as GridPanelData;
    if (grid.sectionId) {
      (newLayout[grid.sectionId] as GridSectionData).panels[panelId] = basePanel;
    } else {
      newLayout[panelId] = {
        ...basePanel,
        type: 'panel',
      };
    }
  });
  return newLayout;
};
