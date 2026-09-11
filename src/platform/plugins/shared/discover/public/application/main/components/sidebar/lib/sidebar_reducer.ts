/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type DataView, type DataViewField } from '@kbn/data-views-plugin/common';
import type { DataSource } from '@kbn/data-source';
import { getDataViewFieldList, getEsqlQueryFieldList } from './get_field_list';

export enum DiscoverSidebarReducerActionType {
  RESET = 'RESET',
  DATA_VIEW_SWITCHED = 'DATA_VIEW_SWITCHED',
  DOCUMENTS_LOADED = 'DOCUMENTS_LOADED',
  DOCUMENTS_LOADING = 'DOCUMENTS_LOADING',
}

type DiscoverSidebarReducerAction =
  | {
      type: DiscoverSidebarReducerActionType.RESET;
      payload: {
        dataView: DataView | null | undefined;
      };
    }
  | {
      type: DiscoverSidebarReducerActionType.DATA_VIEW_SWITCHED;
      payload: {
        dataView: DataView | null | undefined;
      };
    }
  | {
      type: DiscoverSidebarReducerActionType.DOCUMENTS_LOADING;
      payload: {
        isEsqlMode: boolean;
      };
    }
  | {
      type: DiscoverSidebarReducerActionType.DOCUMENTS_LOADED;
      payload: {
        dataSource: DataSource | undefined;
        fieldCounts: DiscoverSidebarReducerState['fieldCounts'];
      };
    };

export enum DiscoverSidebarReducerStatus {
  INITIAL = 'INITIAL',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
}

export interface DiscoverSidebarReducerState {
  dataView: DataView | null | undefined;
  allFields: DataViewField[] | null;
  fieldCounts: Record<string, number> | null;
  status: DiscoverSidebarReducerStatus;
}

export function getInitialState(dataView?: DataView | null): DiscoverSidebarReducerState {
  return {
    dataView,
    allFields: null,
    fieldCounts: null,
    status: DiscoverSidebarReducerStatus.INITIAL,
  };
}

export function discoverSidebarReducer(
  state: DiscoverSidebarReducerState,
  action: DiscoverSidebarReducerAction
): DiscoverSidebarReducerState {
  switch (action.type) {
    case DiscoverSidebarReducerActionType.RESET:
      return getInitialState(action.payload.dataView);
    case DiscoverSidebarReducerActionType.DATA_VIEW_SWITCHED:
      return state.dataView === action.payload.dataView
        ? state // already updated in `DOCUMENTS_LOADED`
        : {
            ...state,
            dataView: action.payload.dataView,
            fieldCounts: null,
            allFields: null,
            status:
              state.status === DiscoverSidebarReducerStatus.COMPLETED
                ? DiscoverSidebarReducerStatus.INITIAL
                : state.status,
          };
    case DiscoverSidebarReducerActionType.DOCUMENTS_LOADING:
      return {
        ...state,
        fieldCounts: null,
        allFields: action.payload.isEsqlMode ? null : state.allFields,
        status: DiscoverSidebarReducerStatus.PROCESSING,
      };
    case DiscoverSidebarReducerActionType.DOCUMENTS_LOADED: {
      const { dataSource, fieldCounts } = action.payload;
      const mappedAndUnmappedFields =
        dataSource?.kind === 'esql'
          ? getEsqlQueryFieldList(dataSource.resultColumns)
          : getDataViewFieldList(
              dataSource?.getDataView() ?? state.dataView ?? undefined,
              fieldCounts
            );
      const nextDataView =
        dataSource?.kind === 'index-pattern' ? dataSource.getDataView() : state.dataView;
      return {
        ...state,
        dataView: nextDataView,
        fieldCounts,
        allFields: mappedAndUnmappedFields,
        status:
          mappedAndUnmappedFields === null
            ? DiscoverSidebarReducerStatus.PROCESSING
            : DiscoverSidebarReducerStatus.COMPLETED,
      };
    }
  }

  return state;
}
