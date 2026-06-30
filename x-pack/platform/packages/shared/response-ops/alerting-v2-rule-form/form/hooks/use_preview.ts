/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import { useQuery } from '@kbn/react-query';
import { getESQLResults } from '@kbn/esql-utils';
import { useDebouncedValue } from '@kbn/react-hooks';
import type { EuiDataGridColumn } from '@elastic/eui';
import { validateEsqlQuery } from '@kbn/alerting-v2-schemas';
import { useRuleFormServices } from '../contexts';
import { parseDuration } from '../utils';
import { ruleFormKeys } from './query_key_factory';

/** Maximum number of preview rows to display */
const MAX_PREVIEW_ROWS = 100;

/** Debounce wait time in milliseconds */
const DEBOUNCE_WAIT = 2000;

export interface PreviewColumn extends EuiDataGridColumn {
  /** The ES|QL column type (e.g. 'keyword', 'long', 'date') */
  esType: string;
}

export interface PreviewResult {
  /** Columns derived from the ES|QL response */
  columns: PreviewColumn[];
  /** Row data mapped from the ES|QL response values */
  rows: Array<Record<string, string | null>>;
  /** Total row count (before truncation) */
  totalRowCount: number;
  /** Whether the query is currently loading */
  isLoading: boolean;
  /** Whether the query resulted in an error */
  isError: boolean;
  /** Error message, if any */
  error: string | null;
  /** Field names selected as the grouping key */
  groupingFields: string[];
  /** Number of unique alert groups based on grouping field values, or null if no grouping is configured */
  uniqueGroupCount: number | null;
  /** Whether the current query is syntactically valid ES|QL (used to distinguish "no query" from "valid query with 0 results") */
  hasValidQuery: boolean;
  /** The assembled ES|QL query string passed to the preview */
  query: string;
  /** The time field name used for the range filter */
  timeField: string;
  /** The schedule interval string (e.g. '5m', '1h') */
  interval: string;
  /** The lookback duration string (e.g. '5m', '1h') */
  lookback: string;
  /** Optional additional DSL filter applied to the preview (e.g. exception exclusions) */
  additionalFilter?: unknown;
  /** Re-executes the preview query with a fresh time window */
  refetch: () => void;
}

export interface UsePreviewParams {
  /** The assembled ES|QL query string to execute */
  query: string;
  /** The time field name for the range filter */
  timeField: string;
  /** The schedule interval string (e.g. '5m', '1h') */
  interval: string;
  /** The lookback duration string (e.g. '5m', '1h') */
  lookback: string;
  /** Fields selected as the grouping key */
  groupingFields: string[];
  /** Whether the preview is enabled (defaults to true) */
  enabled?: boolean;
  /** Optional additional DSL filter to compose with the time range filter (e.g. exception exclusions) */
  additionalFilter?: unknown;
}

/**
 * Constructs a time range filter for the ES|QL query preview.
 *
 * The preview window spans `interval + lookback` to match what the rule
 * executor actually queries: the interval covers the scheduling gap and the
 * lookback extends further back to catch late-arriving data.
 */
const getTimeFilter = (timeField: string, interval: string, lookback: string) => {
  const intervalMs = parseDuration(interval);
  const lookbackMs = parseDuration(lookback);
  const timeWindow = intervalMs + lookbackMs;
  const now = Date.now();
  const dateEnd = new Date(now).toISOString();
  const dateStart = new Date(now - timeWindow).toISOString();
  return {
    timeRange: {
      from: dateStart,
      to: dateEnd,
    },
    timeFilter: {
      bool: {
        filter: [
          {
            range: {
              [timeField]: {
                lte: dateEnd,
                gt: dateStart,
                format: 'strict_date_optional_time',
              },
            },
          },
        ],
      },
    },
  };
};

/**
 * Formats a cell value as a display string.
 */
const formatCellValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};

/**
 * Generic hook that executes an ES|QL query and returns preview results.
 *
 * Handles debouncing, time filtering, column/row mapping, and unique group
 * computation. Specialised hooks (rule preview, recovery preview) compose
 * this hook by watching the relevant form fields and assembling the query
 * before delegating here.
 */
export const usePreview = ({
  query,
  timeField,
  interval,
  lookback,
  groupingFields,
  enabled = true,
  additionalFilter,
}: UsePreviewParams): PreviewResult => {
  const { data } = useRuleFormServices();

  // Debounced query to avoid re-fetching on every keystroke.
  // useDebouncedValue properly cancels stale timers so only the latest value
  // ever commits, regardless of the debounce duration.
  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_WAIT);

  const stableAdditionalFilter = useMemo(
    () => additionalFilter,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(additionalFilter)]
  );

  // Determine if we have enough inputs to run the query
  const canExecute =
    enabled &&
    Boolean(debouncedQuery?.trim() && timeField?.trim() && interval?.trim() && lookback?.trim());

  const fetchPreview = useCallback(async () => {
    if (!canExecute) {
      return { columns: [], values: [] };
    }

    const { timeFilter, timeRange } = getTimeFilter(timeField, interval, lookback);

    const composedFilter =
      stableAdditionalFilter != null
        ? {
            bool: {
              filter: [
                ...(timeFilter &&
                'bool' in timeFilter &&
                timeFilter.bool &&
                'filter' in timeFilter.bool &&
                Array.isArray(timeFilter.bool.filter)
                  ? timeFilter.bool.filter
                  : [timeFilter]),
                stableAdditionalFilter,
              ],
            },
          }
        : timeFilter;

    const result = await getESQLResults({
      esqlQuery: debouncedQuery,
      search: data.search.search,
      dropNullColumns: true,
      timeRange,
      filter: composedFilter,
    });

    return result.response;
  }, [
    canExecute,
    debouncedQuery,
    timeField,
    interval,
    lookback,
    data.search.search,
    stableAdditionalFilter,
  ]);

  const {
    data: response,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      ...ruleFormKeys.preview(debouncedQuery, timeField, lookback),
      interval,
      stableAdditionalFilter,
    ],
    queryFn: fetchPreview,
    enabled: canExecute,
    keepPreviousData: true,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Map response into columns and rows for EuiDataGrid
  const columns: PreviewColumn[] = (response?.columns ?? []).map((col) => ({
    id: col.name,
    displayAsText: col.name,
    esType: col.type,
  }));

  const allRows = (response?.values ?? []).map((row) => {
    const record: Record<string, string | null> = {};
    (response?.columns ?? []).forEach((col, idx) => {
      record[col.name] = formatCellValue(row[idx]);
    });
    return record;
  });

  const totalRowCount = allRows.length;
  const rows = allRows.slice(0, MAX_PREVIEW_ROWS);

  const uniqueGroupCount = useMemo(() => {
    if (groupingFields.length === 0 || allRows.length === 0) {
      return null;
    }
    const seen = new Set<string>();
    for (const row of allRows) {
      const key = groupingFields.map((f) => row[f] ?? '').join('|');
      seen.add(key);
    }
    return seen.size;
  }, [groupingFields, allRows]);

  const errorMessage = isError && error instanceof Error ? error.message : null;

  // True while the debounce timer is pending (user is still typing)
  const isDebouncing = query !== debouncedQuery;

  // A query is considered valid when it is non-empty, syntactically correct,
  // and all required inputs (timeField, lookback) are provided.
  const hasValidQuery = useMemo(
    () => Boolean(query?.trim()) && !validateEsqlQuery(query) && canExecute,
    [query, canExecute]
  );

  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    columns,
    rows,
    totalRowCount,
    isLoading: isDebouncing || (canExecute && isLoading),
    isError,
    error: errorMessage,
    groupingFields,
    uniqueGroupCount,
    hasValidQuery,
    query,
    timeField,
    interval,
    lookback,
    additionalFilter: stableAdditionalFilter,
    refetch: handleRefetch,
  };
};
