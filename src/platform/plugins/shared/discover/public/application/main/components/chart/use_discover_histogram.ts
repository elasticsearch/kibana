/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  UnifiedHistogramApi,
  UnifiedHistogramState,
  UnifiedHistogramVisContext,
  UseUnifiedHistogramProps,
} from '@kbn/unified-histogram';
import {
  canImportVisContext,
  UnifiedHistogramExternalVisContextStatus,
  UnifiedHistogramFetchStatus,
  type UnifiedHistogramFetchParamsExternal,
} from '@kbn/unified-histogram';
import { intersection } from 'lodash';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Observable } from 'rxjs';
import { distinctUntilChanged, filter, map, pairwise, startWith } from 'rxjs';
import useLatest from 'react-use/lib/useLatest';
import type { RequestAdapter } from '@kbn/inspector-plugin/common';
import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import { ESQL_TABLE_TYPE } from '@kbn/data-plugin/common';
import type { DataSource, EsqlSource } from '@kbn/data-source';
import { useProfileAccessor } from '../../../../context_awareness';
import { useDiscoverCustomization } from '../../../../customizations';
import { useDiscoverServices } from '../../../../hooks/use_discover_services';
import { FetchStatus } from '../../../types';
import { checkHitCount, sendErrorTo } from '../../hooks/use_saved_search_messages';
import {
  type DiscoverAppState,
  selectTabCombinedFilters,
  useAppStateSelector,
} from '../../state_management/redux';
import type {
  DataDocumentsMsg,
  DiscoverLatestFetchDetails,
} from '../../state_management/discover_data_state_container';
import { useIsEsqlMode } from '../../hooks/use_is_esql_mode';
import {
  type InitialUnifiedHistogramLayoutProps,
  internalStateActions,
  useCurrentDataSource,
  useCurrentDataView,
  useCurrentTabAction,
  useCurrentTabSelector,
  useCurrentTabDataStateContainer,
  useInternalStateDispatch,
} from '../../state_management/redux';
import { useDataState } from '../../hooks/use_data_state';
import { getDefinedControlGroupState } from '../../state_management/utils/get_defined_control_group_state';

const EMPTY_ESQL_COLUMNS: DatatableColumn[] = [];
const TAB_ATTRIBUTE_TO_TRIGGER_CHART_FETCH: Array<keyof UnifiedHistogramFetchParamsExternal> = [
  'externalVisContext',
  'breakdownField',
  'timeInterval',
];

export interface UseUnifiedHistogramOptions {
  initialLayoutProps?: InitialUnifiedHistogramLayoutProps;
}

export const useDiscoverHistogram = (
  options?: UseUnifiedHistogramOptions
): UseUnifiedHistogramProps & { setUnifiedHistogramApi: (api: UnifiedHistogramApi) => void } => {
  const services = useDiscoverServices();
  const dataStateContainer = useCurrentTabDataStateContainer();
  const {
    data$: { main$, documents$, totalHits$ },
    inspectorAdapters,
    getAbortController,
  } = dataStateContainer;
  const isEsqlMode = useIsEsqlMode();
  const dispatch = useInternalStateDispatch();
  const updateAppState = useCurrentTabAction(internalStateActions.updateAppState);
  const documentsState = useDataState(documents$);
  const isChartLoading = useMemo(() => {
    return isEsqlMode && documentsState?.fetchStatus === FetchStatus.LOADING;
  }, [isEsqlMode, documentsState?.fetchStatus]);

  /**
   * API initialization
   */

  const [unifiedHistogramApi, setUnifiedHistogramApi] = useState<UnifiedHistogramApi>();
  const chartHidden = useAppStateSelector((state) => state.hideChart);

  /**
   * Sync Unified Histogram state with Discover state
   */

  useEffect(() => {
    const subscription = createUnifiedHistogramStateObservable(
      unifiedHistogramApi?.state$
    )?.subscribe((changes) => {
      const { lensRequestAdapter, hideChart } = changes;

      if ('lensRequestAdapter' in changes) {
        inspectorAdapters.lensRequests = lensRequestAdapter;
      }

      if (typeof hideChart === 'boolean') {
        // `updateAppState`checks internally for value changes before dispatching any action
        dispatch(
          updateAppState({
            appState: {
              hideChart,
            },
          })
        );
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [dispatch, inspectorAdapters, unifiedHistogramApi?.state$, updateAppState]);

  /**
   * Sync URL query params with Unified Histogram
   */

  useEffect(() => {
    if (unifiedHistogramApi && typeof chartHidden === 'boolean') {
      unifiedHistogramApi.setChartHidden(chartHidden);
    }
  }, [chartHidden, unifiedHistogramApi]);

  /**
   * Total hits
   */

  const setTotalHitsError = useMemo(() => sendErrorTo(totalHits$), [totalHits$]);

  useEffect(() => {
    const subscription = createTotalHitsObservable(unifiedHistogramApi?.state$)?.subscribe(
      ({ status, result }) => {
        if (isEsqlMode) {
          // ignore histogram's total hits updates for ES|QL as Discover manages them during docs fetching
          return;
        }

        if (result instanceof Error) {
          // Set totalHits$ to an error state
          setTotalHitsError(result);
          return;
        }

        const { result: totalHitsResult } = totalHits$.getValue();

        if (
          (status === UnifiedHistogramFetchStatus.loading ||
            status === UnifiedHistogramFetchStatus.uninitialized) &&
          totalHitsResult &&
          typeof result !== 'number'
        ) {
          // ignore the histogram initial loading state if discover state already has a total hits value
          return;
        }

        const fetchStatus = status.toString() as FetchStatus;

        // Do not sync the loading state since it's already handled by fetchAll
        if (fetchStatus !== FetchStatus.LOADING) {
          totalHits$.next({
            fetchStatus,
            result,
          });
        }

        if (status !== UnifiedHistogramFetchStatus.complete || typeof result !== 'number') {
          return;
        }

        // Check the hits count to set a partial or no results state
        checkHitCount(main$, result);
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, [isEsqlMode, main$, totalHits$, setTotalHitsError, unifiedHistogramApi?.state$]);

  /**
   * Request params
   */
  const requestParams = useCurrentTabSelector((state) => state.dataRequestParams);
  const currentTabControlState = useCurrentTabSelector((tab) => tab.attributes.controlGroupState);
  const {
    timeRangeRelative: relativeTimeRange,
    timeRangeAbsolute: timeRange,
    searchSessionId,
  } = requestParams;

  const dataView = useCurrentDataView();
  const currentDataSource = useCurrentDataSource();

  const histogramCustomization = useDiscoverCustomization('unified_histogram');

  const query = useAppStateSelector((state) => state.query);
  const filters = useCurrentTabSelector(selectTabCombinedFilters);
  const timeInterval = useAppStateSelector((state) => state.interval);
  const breakdownField = useAppStateSelector((state) => state.breakdownField);
  const esqlVariables = useCurrentTabSelector((tab) => tab.esqlVariables);
  const esqlApproximation = useAppStateSelector((state) => state.esqlApproximation);
  const visContext = useCurrentTabSelector((tab) => tab.attributes.visContext);

  const getModifiedVisAttributesAccessor = useProfileAccessor('getModifiedVisAttributes');
  const getModifiedVisAttributes = useCallback<
    NonNullable<UnifiedHistogramFetchParamsExternal['getModifiedVisAttributes']>
  >(
    (attributes) => getModifiedVisAttributesAccessor((params) => params.attributes)({ attributes }),
    [getModifiedVisAttributesAccessor]
  );

  const collectedFetchParams: UnifiedHistogramFetchParamsExternal | undefined = useMemo(() => {
    return {
      searchSessionId,
      requestAdapter: inspectorAdapters.requests,
      dataView,
      query,
      filters,
      timeRange,
      relativeTimeRange,
      breakdownField,
      timeInterval,
      esqlVariables,
      isApproximate: esqlApproximation,
      controlsState: getDefinedControlGroupState(currentTabControlState),
      // visContext should be in sync with current query
      externalVisContext: isEsqlMode && canImportVisContext(visContext) ? visContext : undefined,
      getModifiedVisAttributes,
    } satisfies UnifiedHistogramFetchParamsExternal;
  }, [
    breakdownField,
    timeInterval,
    currentTabControlState,
    dataView,
    esqlVariables,
    esqlApproximation,
    filters,
    inspectorAdapters.requests,
    isEsqlMode,
    timeRange,
    relativeTimeRange,
    searchSessionId,
    query,
    visContext,
    getModifiedVisAttributes,
  ]);

  const previousFetchParamsRef = useRef<UnifiedHistogramFetchParamsExternal | null>(null);

  const triggerUnifiedHistogramFetch = useLatest(
    (latestFetchDetails: DiscoverLatestFetchDetails | undefined) => {
      const { table, esqlQueryColumns } = getUnifiedHistogramTableForEsql({
        documentsValue: documents$.getValue(),
        currentDataSource,
        isEsqlMode,
      });

      const nextFetchParams = {
        ...collectedFetchParams,
        abortController: latestFetchDetails?.abortController ?? getAbortController(),
        columns: isEsqlMode ? esqlQueryColumns : undefined,
        table: isEsqlMode ? table : undefined,
      };
      previousFetchParamsRef.current = nextFetchParams;
      unifiedHistogramApi?.fetch(nextFetchParams);
    }
  );

  /**
   * Data fetching
   */
  useEffect(() => {
    if (!unifiedHistogramApi) {
      return;
    }

    const subscription = dataStateContainer.fetchChart$.subscribe((latestFetchDetails) => {
      if (latestFetchDetails) {
        triggerUnifiedHistogramFetch.current(latestFetchDetails);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [dataStateContainer.fetchChart$, triggerUnifiedHistogramFetch, unifiedHistogramApi]);

  useEffect(() => {
    const previousFetchParams = previousFetchParamsRef.current;
    if (!collectedFetchParams || !previousFetchParams) {
      return;
    }
    const changedParams = Object.keys(collectedFetchParams).filter((key) => {
      return (
        collectedFetchParams[key as keyof UnifiedHistogramFetchParamsExternal] !==
        previousFetchParams[key as keyof UnifiedHistogramFetchParamsExternal]
      );
    });

    if (
      changedParams.length > 0 &&
      intersection(changedParams, TAB_ATTRIBUTE_TO_TRIGGER_CHART_FETCH).length ===
        changedParams.length
    ) {
      // if changes happen only in the TAB_ATTRIBUTE_TO_TRIGGER_CHART_FETCH attributes, then trigger a separate chart refetch
      // as we know that for these attributes we don't refetch documents (hence no fetchChart$ emission will happen)
      triggerUnifiedHistogramFetch.current(undefined);
    }
  }, [collectedFetchParams, triggerUnifiedHistogramFetch]);

  const updateAttributes = useCurrentTabAction(internalStateActions.updateAttributes);
  const setOverriddenVisContextAfterInvalidation = useCurrentTabAction(
    internalStateActions.setOverriddenVisContextAfterInvalidation
  );

  const onVisContextChanged = useCallback(
    (
      nextVisContext: UnifiedHistogramVisContext | undefined,
      externalVisContextStatus: UnifiedHistogramExternalVisContextStatus
    ) => {
      switch (externalVisContextStatus) {
        case UnifiedHistogramExternalVisContextStatus.manuallyCustomized:
          // if user customized the visualization manually
          // (only this action should trigger Unsaved changes badge)
          dispatch(
            updateAttributes({
              attributes: { visContext: nextVisContext },
            })
          );
          dispatch(
            setOverriddenVisContextAfterInvalidation({
              overriddenVisContextAfterInvalidation: undefined,
            })
          );
          break;
        case UnifiedHistogramExternalVisContextStatus.automaticallyOverridden:
          // if the visualization was invalidated as incompatible and rebuilt
          // (it will be used later for saving the visualization via Save button)
          dispatch(
            setOverriddenVisContextAfterInvalidation({
              overriddenVisContextAfterInvalidation: nextVisContext,
            })
          );
          break;
        case UnifiedHistogramExternalVisContextStatus.automaticallyCreated:
        case UnifiedHistogramExternalVisContextStatus.applied:
          // clearing the value in the internal state so we don't use it during saved search saving
          dispatch(
            setOverriddenVisContextAfterInvalidation({
              overriddenVisContextAfterInvalidation: undefined,
            })
          );
          break;
        case UnifiedHistogramExternalVisContextStatus.unknown:
          // using `{}` to overwrite the value inside the saved search SO during saving
          dispatch(
            setOverriddenVisContextAfterInvalidation({
              overriddenVisContextAfterInvalidation: {},
            })
          );
          break;
      }
    },
    [dispatch, setOverriddenVisContextAfterInvalidation, updateAttributes]
  );

  const onBreakdownFieldChange = useCallback<
    NonNullable<UseUnifiedHistogramProps['onBreakdownFieldChange']>
  >(
    (nextBreakdownField) => {
      if (nextBreakdownField !== breakdownField) {
        dispatch(updateAppState({ appState: { breakdownField: nextBreakdownField } }));
      }
    },
    [breakdownField, dispatch, updateAppState]
  );

  const onTimeIntervalChange = useCallback<
    NonNullable<UseUnifiedHistogramProps['onTimeIntervalChange']>
  >(
    (nextTimeInterval) => {
      if (nextTimeInterval !== timeInterval) {
        dispatch(updateAppState({ appState: { interval: nextTimeInterval } }));
      }
    },
    [timeInterval, dispatch, updateAppState]
  );

  return useMemo(
    () => ({
      setUnifiedHistogramApi,
      enableLensVisService: true,
      services,
      localStorageKeyPrefix: 'discover',
      initialState: {
        chartHidden,
        topPanelHeight: options?.initialLayoutProps?.topPanelHeight,
        totalHitsStatus: UnifiedHistogramFetchStatus.loading,
        totalHitsResult: undefined,
      },
      onFilter: histogramCustomization?.onFilter,
      onBrushEnd: histogramCustomization?.onBrushEnd,
      withDefaultActions: histogramCustomization?.withDefaultActions,
      disabledActions: histogramCustomization?.disabledActions,
      isChartLoading,
      onVisContextChanged: isEsqlMode ? onVisContextChanged : undefined,
      onBreakdownFieldChange,
      onTimeIntervalChange,
    }),
    [
      chartHidden,
      histogramCustomization?.disabledActions,
      histogramCustomization?.onBrushEnd,
      histogramCustomization?.onFilter,
      histogramCustomization?.withDefaultActions,
      isEsqlMode,
      isChartLoading,
      onBreakdownFieldChange,
      onTimeIntervalChange,
      onVisContextChanged,
      options?.initialLayoutProps?.topPanelHeight,
      services,
    ]
  );
};

// Use pairwise to diff the previous and current state (starting with undefined to ensure
// pairwise triggers after a single emission), and return an object containing only the
// changed properties. By only including the changed properties, we avoid accidentally
// overwriting other state properties that may have been updated between the time this
// obersverable was triggered and the time the state changes are applied.
const createUnifiedHistogramStateObservable = (state$?: Observable<UnifiedHistogramState>) => {
  return state$?.pipe(
    startWith(undefined),
    pairwise(),
    map(([prev, curr]) => {
      const changes: Partial<DiscoverAppState> & { lensRequestAdapter?: RequestAdapter } = {};

      if (!curr) {
        return changes;
      }

      if (!prev || prev.lensRequestAdapter !== curr.lensRequestAdapter) {
        changes.lensRequestAdapter = curr.lensRequestAdapter;
      }

      if (!prev || prev.chartHidden !== curr.chartHidden) {
        changes.hideChart = curr.chartHidden;
      }

      return changes;
    }),
    filter((changes) => Object.keys(changes).length > 0)
  );
};

const createTotalHitsObservable = (state$?: Observable<UnifiedHistogramState>) => {
  return state$?.pipe(
    map((state) => ({ status: state.totalHitsStatus, result: state.totalHitsResult })),
    distinctUntilChanged((prev, curr) => prev.status === curr.status && prev.result === curr.result)
  );
};

function getUnifiedHistogramTableForEsql({
  documentsValue,
  currentDataSource,
  isEsqlMode,
}: {
  documentsValue: DataDocumentsMsg | undefined;
  currentDataSource: DataSource;
  isEsqlMode: boolean;
}) {
  if (
    !isEsqlMode ||
    !documentsValue?.result ||
    ![FetchStatus.COMPLETE, FetchStatus.ERROR].includes(documentsValue.fetchStatus)
  ) {
    return {
      table: undefined,
      esqlQueryColumns: EMPTY_ESQL_COLUMNS,
    };
  }

  const esqlQueryColumns =
    currentDataSource.kind === 'esql'
      ? [...(currentDataSource as EsqlSource).resultColumns]
      : EMPTY_ESQL_COLUMNS;
  return {
    table: {
      type: 'datatable' as const,
      rows: documentsValue.result.map((r) => r.raw),
      columns: esqlQueryColumns,
      meta: { type: ESQL_TABLE_TYPE },
    },
    esqlQueryColumns,
  };
}
