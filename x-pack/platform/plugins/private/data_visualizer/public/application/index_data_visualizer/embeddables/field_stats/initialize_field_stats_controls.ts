/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import { ENABLE_ESQL } from '@kbn/esql-utils';
import type { StateComparators } from '@kbn/presentation-publishing';
import { BehaviorSubject, map, merge, skip } from 'rxjs';
import type { FieldStatsInitialState } from '../../../../../common/embeddables/types';
import { FieldStatsInitializerViewType } from '../../../../../common/embeddables/types';
import type { FieldStatsControlsApi } from './types';

type FieldStatsViewType = NonNullable<FieldStatsInitialState['view_type']>;

export const fieldStatsControlsComparators: StateComparators<FieldStatsInitialState> = {
  view_type: 'referenceEquality',
  data_view_id: 'referenceEquality',
  query: 'deepEquality',
  show_distributions: 'referenceEquality',
};

export const initializeFieldStatsControls = (
  initialState: FieldStatsInitialState,
  uiSettings: IUiSettingsClient
) => {
  const isEsqlEnabled = uiSettings.get(ENABLE_ESQL);
  const defaultViewType = isEsqlEnabled
    ? FieldStatsInitializerViewType.ESQL
    : FieldStatsInitializerViewType.DATA_VIEW;

  const viewType$ = new BehaviorSubject<FieldStatsViewType>(
    initialState.view_type ?? defaultViewType
  );
  const dataViewId$ = new BehaviorSubject<string | undefined>(
    initialState.view_type === FieldStatsInitializerViewType.DATA_VIEW
      ? initialState.data_view_id
      : undefined
  );
  const query$ = new BehaviorSubject<{ esql: string } | undefined>(
    initialState.view_type === FieldStatsInitializerViewType.ESQL ? initialState.query : undefined
  );
  const showDistributions$ = new BehaviorSubject<boolean>(initialState.show_distributions ?? false);

  const resetData$ = new BehaviorSubject<number>(Date.now());
  const dataLoading$ = new BehaviorSubject<boolean | undefined>(true);
  const blockingError$ = new BehaviorSubject<Error | undefined>(undefined);

  const updateUserInput = (update: FieldStatsInitialState, shouldResetData = false) => {
    if (shouldResetData) {
      resetData$.next(Date.now());
    }
    const viewType = update.view_type ?? viewType$.value;
    viewType$.next(viewType);
    dataViewId$.next(update.data_view_id);
    query$.next(viewType === FieldStatsInitializerViewType.ESQL ? update.query : undefined);
    if (update.show_distributions !== undefined) {
      showDistributions$.next(update.show_distributions);
    }
  };

  const getLatestState = (): FieldStatsInitialState => {
    const viewType = viewType$.value;
    return {
      view_type: viewType,
      data_view_id:
        viewType === FieldStatsInitializerViewType.DATA_VIEW ? dataViewId$.value : undefined,
      query: viewType === FieldStatsInitializerViewType.ESQL ? query$.value : undefined,
      show_distributions: showDistributions$.value,
    };
  };

  const reinitializeState = (nextState: FieldStatsInitialState) => {
    const viewType = nextState.view_type ?? defaultViewType;
    viewType$.next(viewType);
    dataViewId$.next(
      viewType === FieldStatsInitializerViewType.DATA_VIEW ? nextState.data_view_id : undefined
    );
    query$.next(viewType === FieldStatsInitializerViewType.ESQL ? nextState.query : undefined);
    showDistributions$.next(nextState.show_distributions ?? false);
  };

  const onRenderComplete = () => dataLoading$.next(false);
  const onLoading = (v: boolean) => dataLoading$.next(v);
  const onError = (error?: Error) => blockingError$.next(error);

  return {
    fieldStatsControlsApi: {
      updateUserInput,
      query$,
      viewType$,
      dataViewId$,
      showDistributions$,
    } satisfies FieldStatsControlsApi,
    dataLoadingApi: {
      dataLoading$,
      blockingError$,
      onRenderComplete,
      onLoading,
      onError,
    },
    fieldStatsStateManager: {
      anyStateChange$: merge(
        viewType$.pipe(
          skip(1),
          map(() => undefined)
        ),
        dataViewId$.pipe(
          skip(1),
          map(() => undefined)
        ),
        query$.pipe(
          skip(1),
          map(() => undefined)
        ),
        showDistributions$.pipe(
          skip(1),
          map(() => undefined)
        )
      ),
      reinitializeState,
    },
    // Reset data is internal state management, so no need to expose this in api
    resetData$,
    serializeFieldStatsChartState: getLatestState,
    fieldStatsControlsComparators,
    onFieldStatsTableDestroy: () => {
      viewType$.complete();
      dataViewId$.complete();
      query$.complete();
      showDistributions$.complete();
      resetData$.complete();
    },
  };
};
