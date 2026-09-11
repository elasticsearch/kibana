/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isOfAggregateQueryType, type AggregateQuery, type TimeRange } from '@kbn/es-query';
import type { ESQLControlVariable } from '@kbn/esql-types';
import { createContext, useContext } from 'react';
import type { BehaviorSubject } from 'rxjs';
import type { UnifiedDataTableProps } from '@kbn/unified-data-table';
import type { DataTableColumnsMeta, DataTableRecord } from '@kbn/discover-utils';
import type { DataCascadeRestorableState } from '@kbn/shared-ux-document-data-cascade';
import type { UnifiedDataTableRestorableState } from '@kbn/unified-data-table';
import type {
  CascadedDocumentsState,
  DiscoverAppState,
  ExpandedDocCascadePath,
  internalStateActions,
} from '../../../state_management/redux';
import type { UpdateESQLQueryFn } from '../../../../../context_awareness';
import type { CascadedDocumentsFetcher } from '../../../data_fetching/cascaded_documents_fetcher';
import type { RenderViewModeToggle } from '../../../../../components/view_mode_toggle';

export type CascadedDocumentsDataGridUiStateMap = Record<
  string,
  Partial<UnifiedDataTableRestorableState>
>;

export interface CascadedDocumentsContext
  extends Pick<CascadedDocumentsState, 'availableCascadeGroups' | 'selectedCascadeGroups'> {
  cascadedDocumentsFetcher: CascadedDocumentsFetcher;
  cascadedColumnsMeta: DataTableColumnsMeta;
  esqlQuery: AggregateQuery;
  esqlVariables: ESQLControlVariable[] | undefined;
  timeRange: TimeRange | undefined;
  esqlApproximation: boolean;
  renderViewModeToggle: RenderViewModeToggle | undefined;
  expandedDoc$: BehaviorSubject<DataTableRecord | undefined>;
  expandedDocOwner$: BehaviorSubject<string | undefined>;
  getExpandedDocSetter: (
    owner: string,
    expandedDocCascadePath?: ExpandedDocCascadePath
  ) => NonNullable<UnifiedDataTableProps['setExpandedDoc']>;
  getRenderDocumentViewMetaSetter: (
    owner: string
  ) => UnifiedDataTableProps['setRenderDocumentViewMeta'] | undefined;
  getDataCascadeUiState: () => DataCascadeRestorableState | undefined;
  getDataGridUiStateMap: () => CascadedDocumentsDataGridUiStateMap | undefined;
  setDataCascadeUiState: (uiState: DataCascadeRestorableState | undefined) => void;
  setDataGridUiState: (nodeId: string, uiState: Partial<UnifiedDataTableRestorableState>) => void;
  cascadeGroupingChangeHandler: (cascadeGrouping: string[]) => void;
  onUpdateESQLQuery: UpdateESQLQueryFn;
  openInNewTab: (...args: Parameters<typeof internalStateActions.openInNewTab>) => Promise<void>;
}

const cascadedDocumentsContext = createContext<CascadedDocumentsContext | undefined>(undefined);

export const CascadedDocumentsProvider = cascadedDocumentsContext.Provider;

const SUPPORTED_CASCADE_GROUPING_COUNT = 1;

export const isCascadedDocumentsVisible = (
  availableCascadeGroups: CascadedDocumentsContext['availableCascadeGroups'],
  query: DiscoverAppState['query']
) => {
  const isEsqlQuery = isOfAggregateQueryType(query);
  const isValidState = Boolean(
    availableCascadeGroups.length > 0 &&
      availableCascadeGroups.length <= SUPPORTED_CASCADE_GROUPING_COUNT
  );

  return isEsqlQuery && isValidState;
};

export const useCascadedDocumentsContext = () => {
  const context = useContext(cascadedDocumentsContext);

  if (!context || !isCascadedDocumentsVisible(context.availableCascadeGroups, context.esqlQuery)) {
    throw new Error(
      'useCascadedDocumentsContext must be used with a valid CascadedDocumentsContext'
    );
  }

  return context;
};
