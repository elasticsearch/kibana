/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiEmptyPrompt, EuiFlexGroup, EuiLoadingChart, EuiText } from '@elastic/eui';
import { isChartSizeEvent } from '@kbn/chart-expressions-common';
import type { DataView } from '@kbn/data-views-plugin/public';
import type { EmbeddablePublicDefinition } from '@kbn/embeddable-plugin/public';
import type { AggregateQuery } from '@kbn/es-query';
import type { ExpressionRendererParams } from '@kbn/expressions-plugin/public';
import { useExpressionRenderer } from '@kbn/expressions-plugin/public';
import { i18n } from '@kbn/i18n';
import { apiPublishesSettings, initializeStateApi } from '@kbn/presentation-publishing';
import {
  apiHasDisableTriggers,
  apiHasExecutionContext,
  apiIsOfType,
  apiPublishesProjectRouting,
  apiPublishesTimeRange,
  apiPublishesTimeslice,
  apiPublishesUnifiedSearch,
  fetch$,
  initializeTimeRangeManager,
  initializeTitleManager,
  timeRangeComparators,
  titleComparators,
  useStateFromPublishingSubject,
  type ProjectRoutingOverrides,
} from '@kbn/presentation-publishing';
import { apiPublishesSearchSession } from '@kbn/presentation-publishing/interfaces/fetch/publishes_search_session';
import { get, isEqual } from 'lodash';
import React, { useEffect, useRef } from 'react';
import { BehaviorSubject, map, merge, skip, switchMap } from 'rxjs';
import { useErrorTextStyle } from '@kbn/react-hooks';
import { VISUALIZE_APP_NAME, VISUALIZE_EMBEDDABLE_TYPE } from '@kbn/visualizations-common';
import {
  ON_APPLY_FILTER,
  ON_OPEN_PANEL_MENU,
  ON_SELECT_RANGE,
} from '@kbn/ui-actions-plugin/common/trigger_ids';
import type { VisualizeEmbeddableState } from '../../common/embeddable/types';
import { VIS_EVENT_TO_TRIGGER } from './events';
import { getInspector, getUiActions, getUsageCollection } from '../services';
import { ACTION_CONVERT_TO_LENS } from '../triggers';
import type { SerializedVis, Vis } from '../vis';
import { createVisInstance } from './create_vis_instance';
import { getExpressionRendererProps } from './get_expression_renderer_props';
import { saveToLibrary } from './save_to_library';
import { deserializeState, serializeState } from './state';
import type { VisualizeApi } from './types';
import { initializeEditApi } from './initialize_edit_api';
import { hasLibraryItemWithTitle } from '../utils/saved_objects_utils';

export const visualizeEmbeddableFactory: EmbeddablePublicDefinition<
  VisualizeEmbeddableState,
  VisualizeApi
> = {
  type: VISUALIZE_EMBEDDABLE_TYPE,
  buildEmbeddable: async ({
    initializeDrilldownsManager,
    initialState,
    finalizeApi,
    parentApi,
    uuid,
  }) => {
    // Runtime state may contain title loaded from saved object
    // Initialize titleManager with serialized state
    // to avoid tracking runtime state title as serialized state title
    const titleManager = initializeTitleManager(initialState);

    // Initialize dynamic actions
    const drilldownsManager = initializeDrilldownsManager(uuid, initialState);

    const runtimeState = await deserializeState(initialState);

    // Count renders; mostly used for testing.
    const renderCount$ = new BehaviorSubject<number>(0);
    const hasRendered$ = new BehaviorSubject<boolean>(false);

    // Track vis data and initialize it into a vis instance
    const serializedVis$ = new BehaviorSubject<SerializedVis>(runtimeState.serializedVis);
    const initialVisInstance = await createVisInstance(runtimeState.serializedVis);
    const vis$ = new BehaviorSubject<Vis>(initialVisInstance);

    let initialProjectRoutingOverrides: ProjectRoutingOverrides;
    if (initialVisInstance.type.getProjectRoutingOverrides) {
      initialProjectRoutingOverrides = await initialVisInstance.type.getProjectRoutingOverrides(
        initialVisInstance.params
      );
    }
    const projectRoutingOverrides$ = new BehaviorSubject<ProjectRoutingOverrides>(
      initialProjectRoutingOverrides
    );

    const initialEsqlQuery = initialVisInstance.type.getEsqlQuery?.(initialVisInstance.params);
    const esql$ = new BehaviorSubject<AggregateQuery[]>(initialEsqlQuery ? [initialEsqlQuery] : []);
    const approximationApplied$ = new BehaviorSubject<boolean | undefined>(undefined);

    const getUsedDataViews = async (visInstance: Vis) => {
      if (visInstance.type.getUsedIndexPattern) {
        return visInstance.type.getUsedIndexPattern(visInstance.params);
      }
      return visInstance.data.indexPattern ? [visInstance.data.indexPattern] : [];
    };
    const dataViews$ = new BehaviorSubject<DataView[] | undefined>(
      await getUsedDataViews(initialVisInstance)
    );

    // Track UI state
    const onUiStateChange = () => serializedVis$.next(vis$.getValue().serialize());

    // When the serialized vis changes, update the vis instance
    const serializedVisSubscription = serializedVis$
      .pipe(
        switchMap(async (serializedVis) => {
          const currentVis = vis$.getValue();
          if (currentVis) currentVis.uiState.off('change', onUiStateChange);
          const vis = await createVisInstance(serializedVis);
          vis.uiState.on('change', onUiStateChange);
          vis$.next(vis);

          // Update project routing overrides when vis changes
          if (vis.type.getProjectRoutingOverrides) {
            const newOverrides = await vis.type.getProjectRoutingOverrides(vis.params);
            if (!isEqual(projectRoutingOverrides$.getValue(), newOverrides)) {
              projectRoutingOverrides$.next(newOverrides);
            }
          }

          const nextQuery = vis.type.getEsqlQuery?.(vis.params);
          const nextEsql = nextQuery ? [nextQuery] : [];
          if (!isEqual(esql$.getValue(), nextEsql)) {
            esql$.next(nextEsql);
          }

          try {
            const nextDataViews = await getUsedDataViews(vis);
            const currentDataViewIds = (dataViews$.getValue() ?? []).map(({ id }) => id);
            const nextDataViewIds = nextDataViews.map(({ id }) => id);
            if (!isEqual(currentDataViewIds, nextDataViewIds)) {
              dataViews$.next(nextDataViews);
            }
          } catch {
            // keep the previously resolved data views if resolution fails
          }

          const { params, abortController } = await getExpressionParams();
          return { params, abortController };
        })
      )
      .subscribe(({ params, abortController }) => {
        if (params) expressionParams$.next(params);
        expressionAbortController$.next(abortController);
      });

    // Track visualizations linked to a saved object in the library
    const savedObjectId$ = new BehaviorSubject<string | undefined>(
      runtimeState.savedObjectId ?? runtimeState.serializedVis.id
    );
    const linkedToLibrary = Boolean(runtimeState.savedObjectId);

    // Track the vis expression
    const expressionParams$ = new BehaviorSubject<ExpressionRendererParams>({
      expression: '',
    });

    const expressionAbortController$ = new BehaviorSubject<AbortController>(new AbortController());
    let getExpressionParams: () => ReturnType<typeof getExpressionRendererProps> = async () => ({
      params: expressionParams$.getValue(),
      abortController: expressionAbortController$.getValue(),
    });

    const timeRangeManager = initializeTimeRangeManager(runtimeState);

    const searchSessionId$ = new BehaviorSubject<string | undefined>('');

    const executionContext = apiHasExecutionContext(parentApi)
      ? parentApi.executionContext
      : undefined;

    const disableTriggers = apiHasDisableTriggers(parentApi)
      ? parentApi.disableTriggers
      : undefined;

    const inspectorAdapters$ = new BehaviorSubject<Record<string, unknown>>({});

    const dataLoading$ = new BehaviorSubject<boolean | undefined>(true);

    const defaultTitle$ = new BehaviorSubject<string | undefined>(initialVisInstance.title);

    const serializeVisualizeEmbeddable = (
      savedObjectId: string | undefined,
      linkedToLibraryArg: boolean
    ) => {
      return serializeState({
        serializedVis: vis$.getValue().serialize(),
        titles: titleManager.getLatestState(),
        id: savedObjectId,
        linkedToLibrary: linkedToLibraryArg,
        ...(runtimeState.savedObjectProperties
          ? { savedObjectProperties: runtimeState.savedObjectProperties }
          : {}),
        drilldowns: drilldownsManager.getLatestState(),
        ...timeRangeManager.getLatestState(),
      });
    };

    const stateApi = initializeStateApi<VisualizeEmbeddableState>({
      uuid,
      parentApi,
      serializeState: () => {
        return serializeVisualizeEmbeddable(savedObjectId$.getValue(), linkedToLibrary);
      },
      anyStateChange$: merge(
        drilldownsManager.anyStateChange$,
        serializedVis$.pipe(
          skip(1),
          map(() => undefined)
        ),
        titleManager.anyStateChange$,
        timeRangeManager.anyStateChange$
      ).pipe(map(() => undefined)),
      getComparators: () => {
        return {
          ...drilldownsManager.comparators,
          ...titleComparators,
          ...timeRangeComparators,
          savedObjectId: 'skip',
          uiState: linkedToLibrary ? 'deepEquality' : 'skip',
          savedVis: linkedToLibrary
            ? 'skip'
            : (a, b) => {
                function deepOmitBy(value: any) {
                  if (value && !Array.isArray(value) && typeof value === 'object') {
                    const keys = Object.keys(value);
                    if (!keys.length) return;

                    const cleanedValue: Record<string, unknown> = {};
                    keys.forEach((key) => {
                      const cleanedSubvalue = deepOmitBy(value[key]);
                      if (cleanedSubvalue) {
                        cleanedValue[key] = cleanedSubvalue;
                      }
                    });
                    return cleanedValue;
                  }

                  return value;
                }

                return isEqual(deepOmitBy(a), deepOmitBy(b));
              },
        };
      },
      applySerializedState: async (nextState) => {
        drilldownsManager.reinitializeState(nextState);
        timeRangeManager.reinitializeState(nextState);
        titleManager.reinitializeState(nextState);

        const nextRuntimeState = await deserializeState(nextState);
        serializedVis$.next(nextRuntimeState.serializedVis);
      },
    });

    const api = finalizeApi({
      ...timeRangeManager.api,
      ...titleManager.api,
      ...drilldownsManager.api,
      ...stateApi,
      defaultTitle$,
      dataLoading$,
      dataViews$,
      projectRoutingOverrides$,
      esql$,
      approximationApplied$,
      rendered$: hasRendered$,
      renderCount$,
      supportedTriggers: () => [
        ON_OPEN_PANEL_MENU,
        ACTION_CONVERT_TO_LENS,
        ON_APPLY_FILTER,
        ON_SELECT_RANGE,
      ],
      serializeState: () => {
        // In the visualize editor, linkedToLibrary should always be false to force the full state to be serialized,
        // instead of just passing a reference to the linked saved object. Other contexts like dashboards should
        // serialize the state with just the savedObjectId so that the current revision of the vis is always used
        const forcedLinkedToLibrary = apiIsOfType(parentApi, VISUALIZE_APP_NAME)
          ? false
          : linkedToLibrary;
        return serializeVisualizeEmbeddable(savedObjectId$.getValue(), forcedLinkedToLibrary);
      },
      getVis: () => vis$.getValue(),
      getInspectorAdapters: () => inspectorAdapters$.getValue(),
      ...initializeEditApi({
        customTimeRange$: timeRangeManager.api.timeRange$,
        description$: titleManager.api.description$,
        parentApi,
        savedObjectId$,
        searchSessionId$,
        title$: titleManager.api.title$,
        vis$,
        uuid,
      }),
      updateVis: async (visUpdates) => {
        const currentSerializedVis = vis$.getValue().serialize();
        serializedVis$.next({
          ...currentSerializedVis,
          ...visUpdates,
          params: {
            ...currentSerializedVis.params,
            ...visUpdates.params,
          },
          data: {
            ...currentSerializedVis.data,
            ...visUpdates.data,
          },
        } as SerializedVis);
        if (visUpdates.title) {
          titleManager.api.setTitle(visUpdates.title);
        }
      },
      cancelRequests: () => {
        const abortController = expressionAbortController$.getValue();
        if (abortController) {
          abortController.abort();
        }
      },
      openInspector: () => {
        const adapters = inspectorAdapters$.getValue();
        if (!adapters) return;
        const inspector = getInspector();
        if (!inspector.isAvailable(adapters)) return;
        return getInspector().open(adapters, {
          title:
            titleManager.api.title$?.getValue() ||
            i18n.translate('visualizations.embeddable.inspectorTitle', {
              defaultMessage: 'Inspector',
            }),
        });
      },
      // Library transforms
      saveToLibrary: (newTitle: string) => {
        titleManager.api.setTitle(newTitle);
        return saveToLibrary({
          description: titleManager.api.description$.value,
          serializedVis: vis$.getValue().serialize(),
          title: newTitle,
          uiState: vis$.getValue().uiState,
        });
      },
      canLinkToLibrary: () => Promise.resolve(!linkedToLibrary),
      canUnlinkFromLibrary: () => Promise.resolve(linkedToLibrary),
      hasLibraryItemWithTitle,
      getSerializedStateByValue: () => serializeVisualizeEmbeddable(undefined, false),
      getSerializedStateByReference: (libraryId) => serializeVisualizeEmbeddable(libraryId, true),
    });

    const fetchSubscription = fetch$(api)
      .pipe(
        switchMap(async (data) => {
          const unifiedSearch = apiPublishesUnifiedSearch(parentApi)
            ? {
                query: data.query,
                filters: data.filters,
              }
            : {};
          const projectRouting = apiPublishesProjectRouting(parentApi)
            ? data.projectRouting
            : undefined;
          const isApproximate = data.isApproximate;
          const searchSessionId = apiPublishesSearchSession(parentApi) ? data.searchSessionId : '';
          searchSessionId$.next(searchSessionId);
          const settings = apiPublishesSettings(parentApi)
            ? {
                syncColors: parentApi.settings.syncColors$.getValue(),
                syncCursor: parentApi.settings.syncCursor$.getValue(),
                syncTooltips: parentApi.settings.syncTooltips$.getValue(),
              }
            : {};

          dataLoading$.next(true);

          const timeslice = apiPublishesTimeslice(parentApi)
            ? parentApi.timeslice$.getValue()
            : undefined;

          const customTimeRange = timeRangeManager.api.timeRange$.getValue();
          const parentTimeRange = apiPublishesTimeRange(parentApi) ? data.timeRange : undefined;
          const timesliceTimeRange = timeslice
            ? {
                from: new Date(timeslice[0]).toISOString(),
                to: new Date(timeslice[1]).toISOString(),
                mode: 'absolute' as 'absolute',
              }
            : undefined;

          // Precedence should be:
          //  custom time range from state >
          //  timeslice time range >
          //  parent API time range from e.g. unified search
          const timeRangeToRender = customTimeRange ?? timesliceTimeRange ?? parentTimeRange;

          getExpressionParams = async () => {
            return await getExpressionRendererProps({
              unifiedSearch,
              projectRouting,
              isApproximate,
              esqlVariables: data.esqlVariables,
              vis: vis$.getValue(),
              settings,
              disableTriggers,
              searchSessionId,
              parentExecutionContext: executionContext,
              abortController: expressionAbortController$.getValue(),
              timeRange: timeRangeToRender,
              onRender: async (renderCount) => {
                if (renderCount === renderCount$.getValue()) return;
                renderCount$.next(renderCount);
                const visInstance = vis$.getValue();
                const visTypeName = visInstance.type.name;

                let telemetryVisTypeName = visTypeName;
                if (visTypeName === 'metrics') {
                  telemetryVisTypeName = 'legacy_metric';
                }
                if (visTypeName === 'pie' && visInstance.params.isDonut) {
                  telemetryVisTypeName = 'donut';
                }
                if (
                  visTypeName === 'area' &&
                  visInstance.params.seriesParams.some(
                    (seriesParams: { mode: string }) => seriesParams.mode === 'stacked'
                  )
                ) {
                  telemetryVisTypeName = 'area_stacked';
                }

                getUsageCollection().reportUiCounter(
                  executionContext?.type ?? '',
                  'count',
                  `render_agg_based_${telemetryVisTypeName}`
                );

                if (hasRendered$.getValue() === true) return;
                hasRendered$.next(true);
              },
              onEvent: async (event) => {
                // Visualize doesn't respond to sizing events, so ignore.
                if (isChartSizeEvent(event)) {
                  return;
                }
                const currentVis = vis$.getValue();
                if (!disableTriggers) {
                  const triggerId: string = get(
                    VIS_EVENT_TO_TRIGGER,
                    event.name,
                    VIS_EVENT_TO_TRIGGER.filter
                  );
                  let context;

                  if (triggerId === VIS_EVENT_TO_TRIGGER.applyFilter) {
                    context = {
                      embeddable: api,
                      timeFieldName: currentVis.data.indexPattern?.timeFieldName!,
                      ...event.data,
                    };
                  } else {
                    context = {
                      embeddable: api,
                      data: {
                        timeFieldName: currentVis.data.indexPattern?.timeFieldName!,
                        ...event.data,
                      },
                    };
                  }
                  await getUiActions().executeTriggerActions(triggerId, context);
                }
              },
              onData: (_, inspectorAdapters) => {
                inspectorAdapters$.next(
                  typeof inspectorAdapters === 'function' ? inspectorAdapters() : inspectorAdapters
                );
                dataLoading$.next(false);
              },
            });
          };
          return await getExpressionParams();
        })
      )
      .subscribe(({ params, abortController }) => {
        if (params) expressionParams$.next(params);
        expressionAbortController$.next(abortController);
      });

    return {
      api,
      Component: () => {
        const expressionParams = useStateFromPublishingSubject(expressionParams$);
        const domNode = useRef<HTMLDivElement>(null);
        const { error, isLoading } = useExpressionRenderer(domNode, expressionParams);
        const errorTextStyle = useErrorTextStyle();

        useEffect(() => {
          return () => {
            drilldownsManager.cleanup();
            fetchSubscription.unsubscribe();
            serializedVisSubscription.unsubscribe();
          };
        }, []);

        return (
          <div
            css={{ width: '100%', height: '100%' }}
            ref={domNode}
            data-test-subj="visualizationLoader"
          >
            {/* Replicate the loading state for the expression renderer to avoid FOUC  */}
            <EuiFlexGroup css={{ height: '100%' }} justifyContent="center" alignItems="center">
              {isLoading && <EuiLoadingChart size="l" />}
              {!isLoading && error && (
                <EuiEmptyPrompt
                  iconType="error"
                  color="danger"
                  data-test-subj="embeddableError"
                  title={
                    <h2>
                      {i18n.translate('visualizations.embeddable.errorTitle', {
                        defaultMessage: 'Unable to load visualization ',
                      })}
                    </h2>
                  }
                  body={
                    <EuiText css={errorTextStyle}>
                      {error.name}: {error.message}
                    </EuiText>
                  }
                />
              )}
            </EuiFlexGroup>
          </div>
        );
      },
    };
  },
};
