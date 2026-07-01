/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiSpacer, EuiTab, EuiTabs, EuiSkeletonText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { apmTraceLogsDefaultColumns } from '@kbn/observability-plugin/common';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useAsync from 'react-use/lib/useAsync';
import { LazySavedSearchComponent, type SavedSearchTableConfig } from '@kbn/saved-search-component';
import { getTimestampUs } from '../../../../../common/utils/get_timestamp_us';
import { useKibana } from '../../../../context/kibana_context/use_kibana';
import type { Transaction } from '../../../../../typings/es_schemas/ui/transaction';
import { useAnyOfApmParams } from '../../../../hooks/use_apm_params';
import { useDiscoverHref } from '../../../shared/links/discover_links/use_discover_href';
import { TransactionMetadata } from '../../../shared/metadata_table/transaction_metadata';
import { UnifiedWaterfallContainer } from './waterfall_container/unified_waterfall_container';
import { type UnifiedWaterfallFetcherResult } from '../use_unified_waterfall_fetcher';
import {
  getTraceLogsColumns,
  isDiscoverDefaultLogColumns,
  shouldPersistTraceLogsColumnsToUrl,
} from '../distribution/get_trace_logs_columns';

const EMPTY_TRACE_LOGS_DEFAULT_COLUMNS: string[] = [];

export enum TransactionTab {
  timeline = 'timeline',
  metadata = 'metadata',
  logs = 'logs',
}

interface Props {
  transaction?: Transaction;
  isLoading: boolean;
  detailTab?: TransactionTab;
  serviceName?: string;
  waterfallItemId?: string;
  onTabClick: (tab: TransactionTab) => void;
  showCriticalPath: boolean;
  onShowCriticalPathChange: (showCriticalPath: boolean) => void;
  logsTableConfig?: SavedSearchTableConfig;
  onLogsTableConfigChange?: (config: SavedSearchTableConfig) => void;
  unifiedWaterfallFetchResult: UnifiedWaterfallFetcherResult;
  entryTransactionId?: string;
}

export function TransactionTabs({
  transaction,
  isLoading,
  detailTab = TransactionTab.timeline,
  waterfallItemId,
  serviceName,
  onTabClick,
  showCriticalPath,
  onShowCriticalPathChange,
  logsTableConfig,
  onLogsTableConfigChange,
  unifiedWaterfallFetchResult,
  entryTransactionId,
}: Props) {
  const tabs: Record<TransactionTab, { label: string; component: React.ReactNode }> = useMemo(
    () => ({
      [TransactionTab.timeline]: {
        label: i18n.translate('xpack.apm.propertiesTable.tabs.timelineLabel', {
          defaultMessage: 'Timeline',
        }),
        component: (
          <TimelineTabContent
            waterfallItemId={waterfallItemId}
            serviceName={serviceName}
            showCriticalPath={showCriticalPath}
            onShowCriticalPathChange={onShowCriticalPathChange}
            unifiedWaterfallFetchResult={unifiedWaterfallFetchResult}
            entryTransactionId={entryTransactionId}
          />
        ),
      },
      [TransactionTab.metadata]: {
        label: i18n.translate('xpack.apm.propertiesTable.tabs.metadataLabel', {
          defaultMessage: 'Metadata',
        }),
        component: <>{transaction && <MetadataTabContent transaction={transaction} />}</>,
      },
      [TransactionTab.logs]: {
        label: i18n.translate('xpack.apm.propertiesTable.tabs.logsLabel', {
          defaultMessage: 'Logs',
        }),
        component: (
          <>
            {transaction && (
              <LogsTabContent
                timestamp={getTimestampUs(transaction)}
                duration={transaction.transaction.duration.us}
                traceId={transaction.trace.id}
                logsTableConfig={logsTableConfig}
                onLogsTableConfigChange={onLogsTableConfigChange}
              />
            )}
          </>
        ),
      },
    }),
    [
      entryTransactionId,
      logsTableConfig,
      onLogsTableConfigChange,
      onShowCriticalPathChange,
      serviceName,
      showCriticalPath,
      transaction,
      unifiedWaterfallFetchResult,
      waterfallItemId,
    ]
  );

  const currentTab = tabs[detailTab];
  const TabContent = currentTab.component;

  return (
    <>
      <EuiTabs>
        {(Object.keys(TransactionTab) as TransactionTab[]).map((key) => {
          const { label } = tabs[key];
          return (
            <EuiTab
              onClick={() => {
                onTabClick(key);
              }}
              isSelected={detailTab === key}
              key={key}
            >
              {label}
            </EuiTab>
          );
        })}
      </EuiTabs>

      <EuiSpacer />
      {isLoading || !transaction ? (
        <EuiSkeletonText lines={3} data-test-sub="loading-content" />
      ) : (
        <> {TabContent}</>
      )}
    </>
  );
}

function TimelineTabContent({
  waterfallItemId,
  serviceName,
  showCriticalPath,
  onShowCriticalPathChange,
  unifiedWaterfallFetchResult,
  entryTransactionId,
}: {
  waterfallItemId?: string;
  serviceName?: string;
  showCriticalPath: boolean;
  onShowCriticalPathChange: (showCriticalPath: boolean) => void;
  unifiedWaterfallFetchResult: UnifiedWaterfallFetcherResult;
  entryTransactionId?: string;
}) {
  const {
    query: { rangeFrom, rangeTo },
  } = useAnyOfApmParams(
    '/services/{serviceName}/transactions/view',
    '/mobile-services/{serviceName}/transactions/view',
    '/dependencies/operation'
  );
  const traceId = unifiedWaterfallFetchResult.traceItems[0]?.traceId;
  const discoverHref = useDiscoverHref({
    indexType: 'traces',
    rangeFrom,
    rangeTo,
    queryParams: { traceId, sortDirection: 'ASC' },
  });

  return (
    <UnifiedWaterfallContainer
      traceItems={unifiedWaterfallFetchResult.traceItems}
      errors={unifiedWaterfallFetchResult.errors}
      agentMarks={unifiedWaterfallFetchResult.agentMarks}
      waterfallItemId={waterfallItemId}
      serviceName={serviceName}
      showCriticalPath={showCriticalPath}
      onShowCriticalPathChange={onShowCriticalPathChange}
      entryTransactionId={entryTransactionId}
      traceDocsTotal={unifiedWaterfallFetchResult.traceDocsTotal}
      maxTraceItems={unifiedWaterfallFetchResult.maxTraceItems}
      discoverHref={discoverHref}
    />
  );
}

function MetadataTabContent({ transaction }: { transaction: Transaction }) {
  return <TransactionMetadata transaction={transaction} />;
}

function LogsTabContent({
  timestamp,
  duration,
  traceId,
  logsTableConfig,
  onLogsTableConfigChange,
}: {
  timestamp: number;
  duration: number;
  traceId: string;
  logsTableConfig?: SavedSearchTableConfig;
  onLogsTableConfigChange?: (config: SavedSearchTableConfig) => void;
}) {
  const {
    services: {
      logsDataAccess: {
        services: { logSourcesService },
      },
      embeddable,
      dataViews,
      data: {
        search: { searchSource },
      },
      settings,
    },
  } = useKibana();

  const logSources = useAsync(logSourcesService.getFlattenedLogSources);

  const settingsClient = settings.client;

  const [defaultColumns, setDefaultColumns] = useState<string[]>(
    () =>
      settingsClient.get<string[]>(apmTraceLogsDefaultColumns, EMPTY_TRACE_LOGS_DEFAULT_COLUMNS) ??
      EMPTY_TRACE_LOGS_DEFAULT_COLUMNS
  );

  useEffect(() => {
    const subscription = settingsClient
      .get$(apmTraceLogsDefaultColumns, EMPTY_TRACE_LOGS_DEFAULT_COLUMNS)
      .subscribe((value) => {
        setDefaultColumns(Array.isArray(value) ? value : EMPTY_TRACE_LOGS_DEFAULT_COLUMNS);
      });

    return () => subscription.unsubscribe();
  }, [settingsClient]);

  const columns = useMemo(
    () =>
      getTraceLogsColumns({
        urlColumns: logsTableConfig?.columns,
        defaultColumns,
      }),
    [defaultColumns, logsTableConfig?.columns]
  );

  const resolveColumnsOnChange = useCallback(
    (emittedColumns: string[] | undefined) => {
      if (!isDiscoverDefaultLogColumns(emittedColumns)) {
        return undefined;
      }

      return getTraceLogsColumns({
        urlColumns: undefined,
        defaultColumns,
      });
    },
    [defaultColumns]
  );

  const handleLogsTableConfigChange = useCallback(
    (config: SavedSearchTableConfig) => {
      if (!onLogsTableConfigChange) {
        return;
      }

      const columnsForUrl = shouldPersistTraceLogsColumnsToUrl({
        emittedColumns: config.columns,
        defaultColumns,
      })
        ? config.columns
        : undefined;

      onLogsTableConfigChange({
        ...config,
        columns: columnsForUrl,
      });
    },
    [defaultColumns, onLogsTableConfigChange]
  );

  const startTimestamp = Math.floor(timestamp / 1000);
  const endTimestamp = Math.ceil(startTimestamp + duration / 1000);
  const framePaddingMs = 1000 * 60 * 60 * 24; // 24 hours

  const rangeFrom = new Date(startTimestamp - framePaddingMs).toISOString();
  const rangeTo = new Date(endTimestamp + framePaddingMs).toISOString();

  const timeRange = useMemo(() => {
    return {
      from: rangeFrom,
      to: rangeTo,
    };
  }, [rangeFrom, rangeTo]);

  const query = useMemo(
    () => ({
      language: 'kuery',
      query: `trace.id:"${traceId}" OR (not trace.id:* AND "${traceId}")`,
    }),
    [traceId]
  );

  return logSources.value ? (
    <LazySavedSearchComponent
      dependencies={{ embeddable, searchSource, dataViews }}
      index={logSources.value}
      timeRange={timeRange}
      query={query}
      columns={columns}
      sort={logsTableConfig?.sort}
      grid={logsTableConfig?.grid}
      rowHeight={logsTableConfig?.rowHeight}
      rowsPerPage={logsTableConfig?.rowsPerPage}
      density={logsTableConfig?.density}
      height="60vh"
      displayOptions={{
        solutionNavIdOverride: 'oblt',
        enableDocumentViewer: true,
        enableFilters: false,
      }}
      onTableConfigChange={handleLogsTableConfigChange}
      resolveColumnsOnChange={resolveColumnsOnChange}
    />
  ) : null;
}
