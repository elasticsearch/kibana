/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { BehaviorSubject } from 'rxjs';
import { isOfAggregateQueryType } from '@kbn/es-query';
import { hasChangePointCommand, getChangePointOutputColumnNames } from '@kbn/esql-utils';
import { i18n } from '@kbn/i18n';
import type {
  DataGridCellValueElementProps,
  CustomGridColumnsConfiguration,
  CustomGridColumnProps,
} from '@kbn/unified-data-table';
import { DataSourceType, isDataSourceType } from '../../../../../common/data_sources';
import type { DataSourceProfileProvider } from '../../../profiles';
import { DataSourceCategory } from '../../../profiles';
import { ChangePointPvalueCell } from './change_point_pvalue_cell';
import { ChangePointPvalueColumnHeader } from './change_point_pvalue_column_header';
import {
  CHANGE_POINT_DATA_SOURCE_PROFILE_ID,
  type ChangePointChartSectionProps$,
  type ChangePointChartSectionSnapshot,
} from './change_point_context';
import type { ChangePointPvalueCellContext } from './change_point_pvalue_cell';
import { ChangePointChartSectionSync } from './change_point_chart_section_sync';
import { ChangePointDocViewerPanel } from './change_point_doc_viewer_panel';

const CHANGE_POINT_CHART_LOCAL_STORAGE_KEY = 'discover:changePointExperience';

/**
 * Extends the p-value cell context with the chart section props subject needed
 * by the flyout doc viewer tab.
 *
 * `DataSourceProfileProvider<TProviderContext>` merges this with the base
 * `DataSourceContext` (which already contributes `category`), so `category`
 * must NOT be included here.
 */
interface ChangePointDataSourceProfileContext extends ChangePointPvalueCellContext {
  chartSectionProps$: ChangePointChartSectionProps$;
}

export const createChangePointDataSourceProfileProvider =
  (): DataSourceProfileProvider<ChangePointDataSourceProfileContext> => ({
    profileId: CHANGE_POINT_DATA_SOURCE_PROFILE_ID,
    profile: {
      getChartSectionConfiguration:
        (prev, { context, toolkit }) =>
        () => ({
          ...prev(),
          renderChartSection: (props) =>
            React.createElement(ChangePointChartSectionSync, {
              gridProps: props,
              actions: toolkit.actions,
              chartSectionProps$: context.chartSectionProps$,
            }),
          replaceDefaultChart: true as const,
          localStorageKeyPrefix: CHANGE_POINT_CHART_LOCAL_STORAGE_KEY,
          defaultTopPanelHeight: 'max-content',
        }),
      getColumnsConfiguration:
        (prev, { context }) =>
        (): CustomGridColumnsConfiguration => {
          const base = prev ? prev() : {};
          const { pvalueColumnId } = context ?? {};
          if (!pvalueColumnId) return base;
          return {
            ...base,
            [pvalueColumnId]: ({ column, headerRowHeight }: CustomGridColumnProps) => ({
              ...column,
              // Prevents EUI from right-aligning the header as a numeric column.
              schema: undefined,
              display: React.createElement(ChangePointPvalueColumnHeader, {
                columnDisplayName: column.displayAsText,
                headerRowHeight,
              }),
            }),
          };
        },
      getCellRenderers:
        (prev, { context }) =>
        (params) => {
          const { pvalueColumnId } = context;
          if (!pvalueColumnId) {
            return prev(params);
          }
          const pvalueRenderer = (props: DataGridCellValueElementProps) =>
            React.createElement(ChangePointPvalueCell, { ...props, context });
          return {
            ...prev(params),
            [pvalueColumnId]: pvalueRenderer,
          };
        },
      getDocViewer:
        (prev, { context, toolkit }) =>
        (params) => {
          const prevDocViewer = prev(params);
          return {
            ...prevDocViewer,
            docViewsRegistry: (registry) => {
              registry.add({
                id: 'doc_view_change_point_chart',
                title: i18n.translate('discover.docViews.changePoint.title', {
                  defaultMessage: 'Overview',
                }),
                order: 0,
                render: () =>
                  // DocViewRenderProps.hit === params.record; use the closure value
                  // so the panel does not need to accept DocViewRenderProps itself.
                  React.createElement(ChangePointDocViewerPanel, {
                    record: params.record,
                    context,
                    actions: toolkit.actions,
                  }),
              });
              return prevDocViewer.docViewsRegistry(registry);
            },
          };
        },
    },
    resolve: (params) => {
      if (!isDataSourceType(params.dataSource, DataSourceType.Esql)) {
        return { isMatch: false };
      }

      const query = params.query;
      if (!isOfAggregateQueryType(query) || !query.esql) {
        return { isMatch: false };
      }

      if (!hasChangePointCommand(query.esql)) {
        return { isMatch: false };
      }

      const columnNames = getChangePointOutputColumnNames(query.esql);
      const pvalueColumnId = columnNames?.pvalueColumn ?? 'pvalue';

      const chartSectionProps$ = new BehaviorSubject<ChangePointChartSectionSnapshot | undefined>(
        undefined
      );

      return {
        isMatch: true,
        context: {
          category: DataSourceCategory.Default,
          pvalueColumnId,
          chartSectionProps$,
        },
      };
    },
  });
