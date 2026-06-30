/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '@kbn/react-hooks';
import { getESQLAdHocDataview } from '@kbn/esql-utils';
import { esFieldTypeToKibanaFieldType } from '@kbn/field-types';
import { validateEsqlQuery } from '@kbn/alerting-v2-schemas';
import type { TypedLensByValueInput } from '@kbn/lens-plugin/public';
import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import { getLensAttributesFromSuggestion, ChartType } from '@kbn/visualization-utils';
import { useRuleFormServices } from '../contexts';
import { parseDuration } from '../utils';
import type { PreviewColumn } from './use_preview';

/** Debounce wait time in milliseconds — matches the preview grid debounce */
const DEBOUNCE_WAIT = 2000;

export interface UsePreviewChartResult {
  /** Lens attributes needed to render the chart, or undefined while building */
  lensAttributes: TypedLensByValueInput['attributes'] | undefined;
  /** Time range for the chart derived from the lookback window */
  timeRange: { from: string; to: string } | undefined;
  /** Whether the chart attributes are currently being built */
  isLoading: boolean;
  /** Whether the chart attributes failed to build */
  hasError: boolean;
  /** DSL filters to pass to the Lens embeddable (e.g. exception exclusions) */
  lensFilters: unknown[];
}

export interface UsePreviewChartParams {
  /** The full ES|QL query */
  query: string;
  /** The time field name for the date histogram */
  timeField: string;
  /** The schedule interval string (e.g. '5m', '1h') */
  interval: string;
  /** The lookback duration string (e.g. '5m', '1h') */
  lookback: string;
  /** ES|QL columns from the preview query result (used for suggestions) */
  esqlColumns?: PreviewColumn[];
  /** Whether the chart is enabled (defaults to true) */
  enabled?: boolean;
  /** Optional additional DSL filter for the chart (e.g. exception exclusions) */
  additionalFilter?: unknown;
}

/**
 * Converts PreviewColumn[] (EuiDataGrid format) to DatatableColumn[]
 * (Expressions format) for use with the Lens suggestions API.
 *
 * ES types (e.g. 'keyword', 'long') must be mapped to Kibana
 * DatatableColumnType values (e.g. 'string', 'number') for Lens
 * suggestions to work correctly. This mirrors the conversion that
 * Discover performs via `formatESQLColumns`.
 */
const toDatatableColumns = (columns: PreviewColumn[]): DatatableColumn[] =>
  columns.map(
    (col) =>
      ({
        id: col.id,
        name: col.id,
        meta: { type: esFieldTypeToKibanaFieldType(col.esType), esType: col.esType },
      } as DatatableColumn)
  );

/**
 * Creates a stable string key from column definitions so that we can
 * detect meaningful changes without relying on object reference equality.
 */
const columnsToKey = (columns: PreviewColumn[]): string =>
  columns.map((c) => `${c.id}:${c.esType}`).join(',');

/**
 * Hook that builds Lens embeddable attributes for a preview chart using
 * the Lens plugin's public `stateHelperApi().suggestions` API directly,
 * together with `getLensAttributesFromSuggestion` to convert the top
 * suggestion into renderable Lens attributes.
 *
 * For STATS queries (transformational commands), Lens suggestions will
 * auto-detect the most appropriate chart type from the aggregated columns.
 * For plain queries, Lens generates a time histogram suggestion.
 *
 * Uses the same debounce timing as `usePreview` to keep the chart and grid
 * visually in sync.
 */
export const usePreviewChart = ({
  query,
  timeField,
  interval,
  lookback,
  esqlColumns = [],
  enabled = true,
  additionalFilter,
}: UsePreviewChartParams): UsePreviewChartResult => {
  const { dataViews, lens } = useRuleFormServices();

  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_WAIT);

  // Build a stable string key so the effect only re-runs when column
  // content actually changes, not on every parent render.
  const columnsKey = useMemo(() => columnsToKey(esqlColumns), [esqlColumns]);

  // Keep the converted DatatableColumn[] in a ref so the effect can
  // always read the latest value without depending on its reference.
  const datatableColumnsRef = useRef<DatatableColumn[]>([]);
  datatableColumnsRef.current = useMemo(() => toDatatableColumns(esqlColumns), [esqlColumns]);

  const timeRange = useMemo(() => {
    if (!interval?.trim() || !lookback?.trim()) return undefined;
    try {
      const intervalMs = parseDuration(interval);
      const lookbackMs = parseDuration(lookback);
      const now = Date.now();
      return {
        from: new Date(now - intervalMs - lookbackMs).toISOString(),
        to: new Date(now).toISOString(),
      };
    } catch {
      return undefined;
    }
  }, [interval, lookback]);

  const [lensAttributes, setLensAttributes] = useState<
    TypedLensByValueInput['attributes'] | undefined
  >(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const hasValidInputs =
      enabled &&
      Boolean(debouncedQuery?.trim()) &&
      Boolean(timeField?.trim()) &&
      Boolean(interval?.trim()) &&
      Boolean(lookback?.trim());

    if (!hasValidInputs) {
      setLensAttributes(undefined);
      setHasError(false);
      setIsLoading(false);
      return;
    }

    // Don't try to build chart if query has syntax errors
    if (validateEsqlQuery(debouncedQuery ?? '')) {
      setLensAttributes(undefined);
      setHasError(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const run = async () => {
      try {
        // Resolve the Lens suggestions API from the public start contract
        const { suggestions } = await lens.stateHelperApi();

        if (cancelled) return;

        // Create an ad-hoc DataView from the query's index pattern.
        // We must NOT skip field fetching: the Lens suggestions API needs
        // the DataView's field list (via toSpec()) to generate valid suggestions.
        const adHocDataView = await getESQLAdHocDataview({
          dataViewsService: dataViews,
          query: debouncedQuery!,
        });

        if (cancelled) return;

        // Set the time field to the user-configured value
        adHocDataView.timeFieldName = timeField;

        // Build the context object that the Lens suggestions API expects for
        // ES|QL queries. This is the same shape used internally by Unified Histogram.
        const context = {
          dataViewSpec: adHocDataView.toSpec(),
          fieldName: '',
          textBasedColumns: datatableColumnsRef.current,
          query: { esql: debouncedQuery! },
        };

        // Get suggestions, preferring bar charts and excluding tables
        // We filter out tables manually as well since excludedVisualizations
        // might return empty array if table was the primary suggestion
        const allSuggestions =
          suggestions(
            context,
            adHocDataView,
            ['lnsDatatable'],
            ChartType.Bar // Prefer bar chart type
          ) ?? [];

        // Filter out any table suggestions that might have slipped through
        // Only accept chart visualizations (not tables)
        const chartSuggestions = allSuggestions.filter(
          (s) => s.visualizationId && s.visualizationId !== 'lnsDatatable'
        );
        const topSuggestion = chartSuggestions[0];

        if (!cancelled) {
          if (topSuggestion) {
            const attributes = getLensAttributesFromSuggestion({
              filters: [],
              query: { esql: debouncedQuery! },
              suggestion: topSuggestion,
              dataView: adHocDataView,
            });
            setLensAttributes(attributes as TypedLensByValueInput['attributes']);
            setHasError(false);
          } else {
            // No valid chart suggestion available — return null to indicate
            // we cannot generate a visualization for this query
            setLensAttributes(undefined);
            setHasError(false);
          }
          setIsLoading(false);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[usePreviewChart] Failed to build chart attributes:', err);
        if (!cancelled) {
          setLensAttributes(undefined);
          setHasError(true);
          setIsLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
    // columnsKey is a stable string derived from esqlColumns content.
    // datatableColumns is read from a ref to avoid re-triggering the effect
    // on every object reference change.
  }, [enabled, debouncedQuery, timeField, interval, lookback, columnsKey, dataViews, lens]);

  // True while the debounce timer is pending
  const isDebouncing = query !== debouncedQuery;

  const lensFilters = useMemo(() => {
    if (additionalFilter == null) return [];
    return [{ meta: { alias: null, disabled: false, negate: false }, query: additionalFilter }];
  }, [additionalFilter]);

  return {
    lensAttributes,
    timeRange,
    isLoading: isDebouncing || isLoading,
    hasError,
    lensFilters,
  };
};
