/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { XYBrushEvent } from '@elastic/charts';
import { EuiSpacer } from '@elastic/eui';
import React, { useCallback, useMemo } from 'react';
import { useHistory } from 'react-router-dom';

import { ProcessorEvent } from '@kbn/observability-plugin/common';
import type { SavedSearchTableConfig } from '@kbn/saved-search-component';
import { AT_TIMESTAMP } from '@kbn/apm-types';
import { useLegacyUrlParams } from '../../../../context/url_params_context/use_url_params';

import { useUnifiedWaterfallFetcher } from '../use_unified_waterfall_fetcher';
import { WaterfallWithSummary } from '../waterfall_with_summary';

import { useApmServiceContext } from '../../../../context/apm_service/use_apm_service_context';
import { useAnyOfApmParams } from '../../../../hooks/use_apm_params';
import { useTimeRange } from '../../../../hooks/use_time_range';
import { DurationDistributionChartWithScrubber } from '../../../shared/charts/duration_distribution_chart_with_scrubber';
import { ResettingHeightRetainer } from '../../../shared/height_retainer/resetting_height_container';
import { fromQuery, push, toQuery } from '../../../shared/links/url_helpers';
import type { TransactionTab } from '../waterfall_with_summary/transaction_tabs';
import { useTransactionDistributionChartData } from './use_transaction_distribution_chart_data';
import type { TraceSamplesFetchResult } from '../../../../hooks/use_transaction_trace_samples_fetcher';
import { isDiscoverDefaultLogColumns } from './get_trace_logs_columns';

interface TransactionDistributionProps {
  onChartSelection: (event: XYBrushEvent) => void;
  onClearSelection: () => void;
  selection?: [number, number];
  traceSamplesFetchResult: TraceSamplesFetchResult;
}

export function TransactionDistribution({
  onChartSelection,
  onClearSelection,
  selection,
  traceSamplesFetchResult,
}: TransactionDistributionProps) {
  const { urlParams } = useLegacyUrlParams();
  const { traceId, transactionId } = urlParams;

  const {
    query: { rangeFrom, rangeTo, showCriticalPath },
  } = useAnyOfApmParams(
    '/services/{serviceName}/transactions/view',
    '/mobile-services/{serviceName}/transactions/view'
  );

  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  const history = useHistory();

  const { waterfallItemId, detailTab } = urlParams;

  const { serviceName } = useApmServiceContext();

  const unifiedWaterfallFetchResult = useUnifiedWaterfallFetcher({
    start,
    end,
    traceId,
    entryTransactionId: transactionId,
  });

  const markerCurrentEvent =
    unifiedWaterfallFetchResult.entryTransaction?.transaction?.duration?.us;

  const { chartData, hasData, percentileThresholdValue, status, totalDocCount } =
    useTransactionDistributionChartData();

  const onShowCriticalPathChange = useCallback(
    (nextShowCriticalPath: boolean) => {
      push(history, {
        query: {
          showCriticalPath: nextShowCriticalPath ? 'true' : 'false',
        },
      });
    },
    [history]
  );

  const onTabClick = useCallback(
    (tab: TransactionTab) => {
      history.replace({
        ...history.location,
        search: fromQuery({
          ...toQuery(history.location.search),
          detailTab: tab,
        }),
      });
    },
    [history]
  );

  const onSampleClick = useCallback(
    (sample: { transactionId: string; traceId: string }) => {
      history.push({
        ...history.location,
        search: fromQuery({
          ...toQuery(history.location.search),
          transactionId: sample.transactionId,
          traceId: sample.traceId,
        }),
      });
    },
    [history]
  );

  // Parse logs state from URL params
  const { logsColumns, logsSort, logsGrid, logsRowHeight, logsRowsPerPage, logsDensity } =
    urlParams;

  const logsTableConfig = useMemo(
    () => ({
      columns: logsColumns ? JSON.parse(logsColumns) : undefined,
      sort: logsSort ? JSON.parse(logsSort) : undefined,
      grid: logsGrid ? JSON.parse(logsGrid) : undefined,
      rowHeight: logsRowHeight,
      rowsPerPage: logsRowsPerPage,
      density: logsDensity as SavedSearchTableConfig['density'],
    }),
    [logsColumns, logsSort, logsGrid, logsRowHeight, logsRowsPerPage, logsDensity]
  );

  // Handle logs table config changes and sync to URL
  const onLogsTableConfigChange = useCallback(
    (config: SavedSearchTableConfig) => {
      const currentQuery = toQuery(history.location.search);

      const isFieldIncludedInColumns = (fieldName: string) =>
        fieldName === AT_TIMESTAMP || (config.columns && config.columns.includes(fieldName));

      // Clean up sort configuration to only include columns that exist
      const cleanedSort = config.sort?.filter((sortEntry) => {
        const [fieldName] = sortEntry;
        return isFieldIncludedInColumns(fieldName);
      });

      // Clean up grid configuration to only include columns that exist
      const cleanedGrid = config.grid?.columns
        ? {
            ...config.grid,
            columns: Object.fromEntries(
              Object.entries(config.grid.columns).filter(([fieldName]) =>
                isFieldIncludedInColumns(fieldName)
              )
            ),
          }
        : config.grid;

      // Only include logs params with actual values to keep URLs clean
      const hasColumns = config.columns && !isDiscoverDefaultLogColumns(config.columns);
      const hasSort = cleanedSort && cleanedSort.length > 0;
      const hasGrid = cleanedGrid && Object.keys(cleanedGrid).length > 0;

      const nextSearch = fromQuery({
        ...currentQuery,
        logsColumns: hasColumns ? JSON.stringify(config.columns) : undefined,
        logsSort: hasSort ? JSON.stringify(cleanedSort) : undefined,
        logsGrid: hasGrid ? JSON.stringify(cleanedGrid) : undefined,
        logsRowHeight: config.rowHeight,
        logsRowsPerPage: config.rowsPerPage,
        logsDensity: config.density,
      });

      if (nextSearch !== history.location.search.slice(1)) {
        history.replace({
          ...history.location,
          search: nextSearch,
        });
      }
    },
    [history]
  );

  return (
    <ResettingHeightRetainer reset={!traceId}>
      <div data-test-subj="apmTransactionDistributionTabContent">
        <DurationDistributionChartWithScrubber
          onChartSelection={onChartSelection}
          onClearSelection={onClearSelection}
          selection={selection}
          status={status}
          markerCurrentEvent={markerCurrentEvent}
          chartData={chartData}
          totalDocCount={totalDocCount}
          hasData={hasData}
          percentileThresholdValue={percentileThresholdValue}
          eventType={ProcessorEvent.transaction}
        />

        <EuiSpacer size="s" />
        <WaterfallWithSummary
          onSampleClick={onSampleClick}
          onTabClick={onTabClick}
          serviceName={serviceName}
          waterfallItemId={waterfallItemId}
          detailTab={detailTab as TransactionTab | undefined}
          traceSamplesFetchStatus={traceSamplesFetchResult.status}
          traceSamples={traceSamplesFetchResult.data?.traceSamples}
          showCriticalPath={showCriticalPath}
          onShowCriticalPathChange={onShowCriticalPathChange}
          logsTableConfig={logsTableConfig}
          onLogsTableConfigChange={onLogsTableConfigChange}
          unifiedWaterfallFetchResult={unifiedWaterfallFetchResult}
          entryTransactionId={transactionId}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          traceId={traceId}
        />
      </div>
    </ResettingHeightRetainer>
  );
}
