/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { omit } from 'lodash';
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  filter,
  merge,
  switchMap,
  tap,
} from 'rxjs';

import {
  ControlValuesSource,
  DEFAULT_CONTROL_VALUES_SOURCE,
  DEFAULT_DATA_CONTROL_STATE,
} from '@kbn/controls-constants';
import type { DataControlState } from '@kbn/controls-schemas';

import { type DataView, type DataViewField } from '@kbn/data-views-plugin/common';
import type { Filter } from '@kbn/es-query';
import type { ESQLControlVariable } from '@kbn/esql-types';
import { apiPublishesESQLVariables } from '@kbn/esql-types';
import { i18n } from '@kbn/i18n';
import { type StateComparators } from '@kbn/presentation-publishing';
import { initializeStateManager } from '@kbn/presentation-publishing/state_manager';
import type { StateManager, WithAllKeys } from '@kbn/presentation-publishing/state_manager/types';

import { dataService, dataViewsService } from '../../services/kibana_services';
import { openDataControlEditor } from './open_data_control_editor';
import type { DataControlApi, DataControlFieldFormatter } from './types';
import { initializeLabelManager, defaultControlLabelComparators } from '../control_labels';
import { getESQLSingleColumnValues } from '../../../common/options_list';
import { getControlsTimezone } from '../utils';
import { getDataViewIdFromESQLQuery } from '../utils/get_data_view_id_from_esql_query';

export const defaultDataControlComparators: StateComparators<DataControlState> = {
  ...defaultControlLabelComparators,
  data_view_id: 'referenceEquality',
  field_name: 'referenceEquality',
  values_source: 'referenceEquality',
  esql_query: 'referenceEquality',
  use_global_filters: (a: boolean | undefined, b: boolean | undefined) =>
    (a ?? DEFAULT_DATA_CONTROL_STATE.use_global_filters) ===
    (b ?? DEFAULT_DATA_CONTROL_STATE.use_global_filters),
  ignore_validations: (a: boolean | undefined, b: boolean | undefined) =>
    (a ?? DEFAULT_DATA_CONTROL_STATE.ignore_validations) ===
    (b ?? DEFAULT_DATA_CONTROL_STATE.ignore_validations),
};

export const defaultDataControlState: WithAllKeys<Omit<DataControlState, 'title'>> = {
  ...DEFAULT_DATA_CONTROL_STATE,
  data_view_id: '',
  field_name: '',
  values_source: DEFAULT_CONTROL_VALUES_SOURCE,
  esql_query: undefined,
};

export type DataControlStateManager = Omit<StateManager<DataControlState>, 'api'> & {
  api: DataControlApi;
  cleanup: () => void;
  internalApi: {
    onSelectionChange: () => void;
    setOutputFilter: (filter: Filter | undefined) => void;
  };
};

export const initializeDataControlManager = async <EditorState extends object = object>({
  controlId,
  controlType,
  typeDisplayName,
  state,
  parentApi,
  editorStateManager,
  willHaveInitialFilter,
  getInitialFilter,
}: {
  controlId: string;
  controlType: string;
  typeDisplayName: string;
  state: DataControlState;
  parentApi: unknown;
  editorStateManager: ReturnType<typeof initializeStateManager<EditorState>>;
  willHaveInitialFilter?: boolean;
  getInitialFilter?: (dataView: DataView) => Filter | undefined;
}): Promise<DataControlStateManager> => {
  const dataControlStateManager = initializeStateManager<Omit<DataControlState, 'title'>>(
    omit(state, 'title'), // this is handled via the label manager
    defaultDataControlState,
    defaultDataControlComparators
  );

  const blockingError$ = new BehaviorSubject<Error | undefined>(undefined);
  function setBlockingError(error: Error | undefined) {
    blockingError$.next(error);
    dataLoading$.next(false);
    filtersLoading$.next(false);
  }
  const dataLoading$ = new BehaviorSubject<boolean | undefined>(false);
  const filtersLoading$ = new BehaviorSubject<boolean>(Boolean(willHaveInitialFilter));
  function setDataLoading(loading: boolean | undefined) {
    dataLoading$.next(loading);
  }

  let resolveInitialDataViewReady: (dataView: DataView) => void;
  let rejectInitialDataViewReady: (error: Error) => void;
  const initialDataViewPromise = new Promise<DataView>((resolve, reject) => {
    resolveInitialDataViewReady = resolve;
    rejectInitialDataViewReady = reject;
  });

  const dataViews$ = new BehaviorSubject<DataView[] | undefined>(undefined);
  const field$ = new BehaviorSubject<DataViewField | undefined>(undefined);
  const fieldFormatter = new BehaviorSubject<DataControlFieldFormatter>((toFormat: any) =>
    String(toFormat)
  );
  const dataViewIdSubscription = combineLatest([
    dataControlStateManager.api.dataViewId$,
    dataControlStateManager.api.valuesSource$,
  ])
    .pipe(
      // Skip empty IDs only for ESQL controls so we don't fire a blocking "data view not found" error before the ID has been loaded
      filter(([id, valuesSource]) => valuesSource !== ControlValuesSource.ESQL || Boolean(id)),
      tap(() => {
        filtersLoading$.next(true);
        if (blockingError$.value) {
          setBlockingError(undefined);
        }
      }),
      switchMap(async ([currentDataViewId]) => {
        let dataView: DataView | undefined;
        try {
          dataView = await dataViewsService.get(currentDataViewId ?? '');
          return { dataView };
        } catch (error) {
          return { error };
        }
      })
    )
    .subscribe(({ dataView, error }) => {
      if (error || !dataView) {
        setBlockingError(error);
        if (willHaveInitialFilter && getInitialFilter) rejectInitialDataViewReady(error);
        return;
      }
      if (dataView) {
        resolveInitialDataViewReady(dataView);
      }
      dataViews$.next(dataView ? [dataView] : undefined);
    });

  const defaultFieldLabel$ = new BehaviorSubject<string>(state.field_name ?? '');
  const fieldNameSubscription = combineLatest([
    dataViews$,
    dataControlStateManager.api.fieldName$,
    dataControlStateManager.api.valuesSource$,
  ])
    .pipe(
      // Skip empty field names only for ESQL controls so we don't fire a blocking "could not locate field" error before field name has been loaded
      filter(
        ([_, fieldName, valuesSource]) =>
          valuesSource !== ControlValuesSource.ESQL || Boolean(fieldName)
      ),
      tap(() => {
        filtersLoading$.next(true);
      })
    )
    .subscribe(([nextDataViews, nextFieldName]) => {
      const dataView = nextDataViews
        ? nextDataViews.find(({ id }) => dataControlStateManager.api.dataViewId$.value === id)
        : undefined;
      if (!dataView) {
        return;
      }

      const field = dataView.getFieldByName(nextFieldName ?? '');
      if (!field) {
        setBlockingError(
          new Error(
            i18n.translate('controls.dataControl.fieldNotFound', {
              defaultMessage: 'Could not locate field: {fieldName}',
              values: { fieldName: nextFieldName },
            })
          )
        );
      } else if (blockingError$.value) {
        setBlockingError(undefined);
      }

      field$.next(field);
      if (field) defaultFieldLabel$.next(field.displayName);
      const spec = field?.toSpec();
      if (spec) {
        const formatter = dataView.getFormatterForField(spec);
        fieldFormatter.next((v: unknown) => formatter.convertToText(v));
      }
    });

  const labelManager = initializeLabelManager(
    { ...state, defaultFieldLabel: defaultFieldLabel$.getValue() },
    {
      ...dataControlStateManager.api,
      defaultFieldLabel$,
    },
    'defaultFieldLabel'
  );

  const onEdit = async () => {
    // open the editor to get the new state
    openDataControlEditor<DataControlState & EditorState>({
      initialState: {
        ...labelManager.getLatestState(),
        ...dataControlStateManager.getLatestState(),
        ...editorStateManager.getLatestState(),
      },
      controlType,
      controlId,
      initialDefaultPanelTitle: labelManager.api.defaultTitle$.getValue(),
      parentApi,
      onUpdate: (newState) => {
        labelManager.reinitializeState(newState);
        dataControlStateManager.reinitializeState(newState);
        editorStateManager.reinitializeState(newState);
      },
    });
  };

  // Pull variables from the parent (typically the dashboard) so queries that
  // reference ESQL controls in the same context resolve correctly
  const parentEsqlVariables$ = apiPublishesESQLVariables(parentApi)
    ? parentApi.esqlVariables$
    : new BehaviorSubject<ESQLControlVariable[]>([]);

  const esqlQueryDataSourceSubscription = combineLatest([
    dataControlStateManager.api.esqlQuery$,
    dataControlStateManager.api.valuesSource$,
    // Re-derive the column when the set of available variables changes
    parentEsqlVariables$.pipe(
      distinctUntilChanged((prev, next) => {
        if (prev.length !== next.length) return false;
        const prevKeys = new Set(prev.map((v) => v.key));
        return next.every((v) => prevKeys.has(v.key));
      })
    ),
  ]).subscribe(async ([query, valuesSource, esqlVariables]) => {
    if (valuesSource !== ControlValuesSource.ESQL) return;
    try {
      if (!query) {
        throw new Error(
          i18n.translate('controls.dataControl.esqlMissingQuery', {
            defaultMessage: 'Variable control is missing a query',
          })
        );
      }
      const dataViewId = await getDataViewIdFromESQLQuery(query);
      if (!dataViewId) {
        throw new Error(
          i18n.translate('controls.dataControl.esqlDataViewDeriveFailed', {
            defaultMessage: 'Could not derive a data view from the ES|QL query',
          })
        );
      }

      dataControlStateManager.api.setDataViewId(dataViewId);
      const result = await getESQLSingleColumnValues({
        query,
        search: dataService.search.search,
        esqlVariables,
        timeRange: dataService.query.timefilter.timefilter.getTime(),
        timezone: getControlsTimezone(),
      });
      if (!getESQLSingleColumnValues.isSuccess(result)) {
        throw result.errors[0];
      }

      dataControlStateManager.api.setFieldName(result.column.name);
      if (blockingError$.value) {
        setBlockingError(undefined);
      }
    } catch (e) {
      setBlockingError(e);
      if (willHaveInitialFilter && getInitialFilter) rejectInitialDataViewReady(e);
    }
  });

  // build initial filter
  let initialFilter: Filter | undefined;
  if (willHaveInitialFilter && getInitialFilter) {
    try {
      const initialDataView = await initialDataViewPromise;
      initialFilter = getInitialFilter(initialDataView);
    } catch (e) {
      setBlockingError(e);
    }
  }
  const appliedFilters$ = new BehaviorSubject<Filter[] | undefined>(
    initialFilter ? [initialFilter] : undefined
  );

  return {
    api: {
      ...dataControlStateManager.api,
      ...labelManager.api,
      dataLoading$,
      blockingError$,
      setBlockingError,
      setDataLoading,
      dataViews$,
      field$,
      fieldFormatter,
      onEdit,
      appliedFilters$,
      filtersLoading$,
      getTypeDisplayName: () => typeDisplayName,
      isEditingEnabled: () => true,
      isExpandable: false,
      isCustomizable: false,
      isDuplicable: true,
      isPinnable: true,
    },
    cleanup: () => {
      dataViewIdSubscription.unsubscribe();
      fieldNameSubscription.unsubscribe();
      esqlQueryDataSourceSubscription.unsubscribe();
      labelManager.cleanup();
    },
    internalApi: {
      onSelectionChange: () => {
        filtersLoading$.next(true);
      },
      setOutputFilter: (newFilter: Filter | undefined) => {
        appliedFilters$.next(newFilter ? [newFilter] : undefined);
        filtersLoading$.next(false);
      },
    },
    anyStateChange$: merge(dataControlStateManager.anyStateChange$, labelManager.anyStateChange$),
    getLatestState: () => {
      const { values_source, esql_query, field_name, data_view_id, ...rest } =
        dataControlStateManager.getLatestState();
      const dataControlState =
        values_source === ControlValuesSource.ESQL
          ? {
              values_source,
              esql_query,
              ...rest,
            }
          : { values_source, data_view_id, field_name, ...rest };
      return {
        ...labelManager.getLatestState(),
        ...dataControlState,
      } as WithAllKeys<DataControlState>;
    },
    reinitializeState: (newState) => {
      dataControlStateManager.reinitializeState(newState);
      labelManager.reinitializeState(newState);
    },
  };
};
