/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect, useMemo, useState } from 'react';
import type { HttpStart, IHttpFetchError, ResponseErrorBody } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core/public';
import type { LatencyAggregationType } from '@kbn/apm-types';
import { i18n } from '@kbn/i18n';
import { useAbortableAsync } from '@kbn/react-hooks';
import type { TransactionGroup } from '../../../transactions_table/types';
import { usePreferredTransactionDataSource } from './use_preferred_transaction_data_source';

// TODO: replace with typed callApmApi once it lives in a package outside of APM (https://github.com/elastic/kibana/issues/271155)
interface MainStatisticsResponse {
  transactionGroups: Array<{
    name: string;
    transactionType?: string;
    latency?: number | null;
    throughput?: number;
    errorRate?: number;
    alertsCount: number;
    impact?: number;
  }>;
  maxCountExceeded: boolean;
  hasActiveAlerts: boolean;
}

export function useServiceFlyoutTransactions({
  http,
  notifications,
  serviceName,
  environment,
  start,
  end,
  transactionType,
  latencyAggregationType,
  searchQuery,
}: {
  http: HttpStart;
  notifications: NotificationsStart;
  serviceName: string;
  environment: string;
  start: string;
  end: string;
  transactionType?: string;
  latencyAggregationType?: LatencyAggregationType;
  searchQuery: string;
}) {
  const enabled = !!transactionType && !!latencyAggregationType;

  const {
    dataSource,
    isLoading: isDataSourceLoading,
    error: dataSourceError,
  } = usePreferredTransactionDataSource({
    http,
    start,
    end,
  });

  useEffect(() => {
    if (
      !dataSourceError ||
      (dataSourceError instanceof Error && dataSourceError.name === 'AbortError')
    )
      return;
    const err = dataSourceError as Error | IHttpFetchError<ResponseErrorBody>;
    const toastMessage =
      'response' in err
        ? [
            err.body?.message ?? err.response?.statusText,
            err.response?.status != null ? `(${err.response.status})` : undefined,
            err.response?.url,
          ]
            .filter(Boolean)
            .join(' ')
        : undefined;
    notifications.toasts.addDanger({
      title: i18n.translate('apmUiShared.serviceFlyout.transactions.dataSourceErrorToast', {
        defaultMessage: 'Failed to load transaction data',
      }),
      text: toastMessage,
    });
  }, [dataSourceError, notifications.toasts]);

  const [maxCountExceeded, setMaxCountExceeded] = useState(false);
  const serverSearchQuery = maxCountExceeded ? searchQuery : '';

  const { value: response, loading: isLoading } = useAbortableAsync(
    async ({ signal }) => {
      if (!enabled || !dataSource) return undefined;
      const result = await http.get<MainStatisticsResponse>(
        `/internal/apm/services/${encodeURIComponent(
          serviceName
        )}/transactions/groups/main_statistics`,
        {
          signal,
          query: {
            environment,
            kuery: '',
            start,
            end,
            transactionType,
            useDurationSummary: false,
            latencyAggregationType,
            documentType: dataSource.documentType,
            rollupInterval: dataSource.rollupInterval,
            searchQuery: serverSearchQuery,
          },
        }
      );
      setMaxCountExceeded(result.maxCountExceeded);
      return result;
    },
    [
      http,
      serviceName,
      environment,
      start,
      end,
      transactionType,
      latencyAggregationType,
      serverSearchQuery,
      enabled,
      dataSource,
    ]
  );

  const items: TransactionGroup[] = useMemo(() => {
    const groups = response?.transactionGroups ?? [];
    const filtered =
      !response?.maxCountExceeded && searchQuery
        ? groups.filter((g) => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : groups;
    return filtered.map((group) => ({
      name: group.name,
      transactionType: group.transactionType,
      latency: { value: group.latency ?? null },
      throughput: { value: group.throughput ?? 0 },
      errorRate: { value: group.errorRate ?? null },
      alertsCount: group.alertsCount,
      impact: group.impact != null ? { value: group.impact } : undefined,
    }));
  }, [response, searchQuery]);

  return {
    items,
    isLoading: isLoading || isDataSourceLoading,
    maxCountExceeded: response?.maxCountExceeded ?? false,
    hasActiveAlerts: response?.hasActiveAlerts ?? false,
    error: dataSourceError,
  };
}
