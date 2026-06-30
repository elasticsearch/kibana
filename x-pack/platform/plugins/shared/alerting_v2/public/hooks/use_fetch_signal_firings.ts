/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import { useQuery } from '@kbn/react-query';
import { runEsqlAsyncSearch } from '@kbn/alerting-v2-episodes-ui/utils/run_esql_async_search';
import { esqlResponseToObjectRows } from '@kbn/alerting-v2-episodes-ui/utils/esql_response_to_rows';
import { computeBucketInterval } from '@kbn/alerting-v2-episodes-ui/utils/histogram_utils';
import { signalOverviewQueryKeys } from '../queries/signal_activity/query_keys';
import {
  buildSignalFiringsHistogramQuery,
  buildSignalFiringsSummaryQuery,
  type SignalFiringsBucketRow,
  type SignalFiringsSummaryRow,
} from '../queries/signal_activity/signal_firings_histogram_query';

/** A histogram bucket with the bucket start in epoch ms, ready for the chart. */
export interface SignalFiringBucket {
  timeMs: number;
  count: number;
}

const EMPTY_BUCKETS: SignalFiringBucket[] = [];

export interface UseFetchSignalFiringsOptions {
  ruleId: string | undefined;
  gteMs: number;
  lteMs: number;
  data: DataPublicPluginStart;
}

export interface UseFetchSignalFiringsResult {
  buckets: SignalFiringBucket[];
  /** Bucket interval driving the histogram (e.g. `'1h'`); also sizes the rate unit. */
  interval: string;
  /** Exact epoch ms of the most recent firing, or `null` when there are none. */
  lastFiringMs: number | null;
  isLoading: boolean;
  isHistogramError: boolean;
  isSummaryError: boolean;
  refetch: () => void;
}

export const useFetchSignalFirings = ({
  ruleId,
  gteMs,
  lteMs,
  data,
}: UseFetchSignalFiringsOptions): UseFetchSignalFiringsResult => {
  const enabled =
    Boolean(ruleId) && Number.isFinite(gteMs) && Number.isFinite(lteMs) && lteMs > gteMs;

  const interval = useMemo(() => computeBucketInterval(gteMs, lteMs), [gteMs, lteMs]);

  // --- 1. Bucketed histogram (feeds the chart + Total + Average) ---
  const histogramQuery = useQuery({
    queryKey: signalOverviewQueryKeys.firingsHistogram(ruleId ?? '', gteMs, lteMs, interval),
    enabled,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      runEsqlAsyncSearch({
        data,
        params: {
          query: buildSignalFiringsHistogramQuery({
            ruleId: ruleId!,
            gteMs,
            lteMs,
            interval,
          }).print('basic'),
          time_zone: 'UTC',
        },
        abortSignal: signal,
      }),
    select: (raw) =>
      esqlResponseToObjectRows<SignalFiringsBucketRow>(raw)
        .map((row) => ({ timeMs: Date.parse(row.ts), count: Number(row.count) }))
        .filter((bucket) => Number.isFinite(bucket.timeMs)),
  });

  // --- 2. Summary aggregate (exact last-firing timestamp) ---
  const summaryQuery = useQuery({
    queryKey: signalOverviewQueryKeys.firingsSummary(ruleId ?? '', gteMs, lteMs),
    enabled,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      runEsqlAsyncSearch({
        data,
        params: {
          query: buildSignalFiringsSummaryQuery({ ruleId: ruleId!, gteMs, lteMs }).print('basic'),
          time_zone: 'UTC',
        },
        abortSignal: signal,
      }),
    select: (raw) => {
      const rows = esqlResponseToObjectRows<SignalFiringsSummaryRow>(raw);
      const lastFiring = rows[0]?.last_firing;
      if (!lastFiring) return null;
      const ms = Date.parse(lastFiring);
      return Number.isFinite(ms) ? ms : null;
    },
  });

  return {
    buckets: histogramQuery.data ?? EMPTY_BUCKETS,
    interval,
    lastFiringMs: summaryQuery.data ?? null,
    isLoading: enabled && (histogramQuery.isLoading || summaryQuery.isLoading),
    isHistogramError: histogramQuery.isError,
    isSummaryError: summaryQuery.isError,
    refetch: () => {
      histogramQuery.refetch();
      summaryQuery.refetch();
    },
  };
};
