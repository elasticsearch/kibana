/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ChartSectionProps } from '@kbn/unified-histogram/types';
import { useAbortableAsync } from '@kbn/react-hooks';
import { FEATURE_FLAG_DEFAULTS, FEATURE_FLAGS } from '../../../../common/constants';
import { useFeatureFlag } from '../../../../hooks/use_feature_flag';
import type { ParsedMetricItem } from '../../../../types';
import { isSuppressedFetchError } from '../../../chart/utils/is_suppressed_fetch_error';
import { useReportChartSectionError } from '../../../chart/hooks/use_report_chart_section_error';
import { createExemplarsQuery } from '../../../../common/utils/esql/create_exemplars_query';
import { executeEsqlQuery } from '../utils/execute_esql_query';

/**
 * Raw ES|QL response shape produced by `executeEsqlQuery`. Column names and row
 * values are used by the points renderer in kibana#289722 to draw exemplar diamonds.
 * When that PR merges, import `EsqlRawResponse` from there instead.
 */
export interface ExemplarRawResponse {
  columns: Array<{ name: string; type: string }>;
  values: unknown[][];
}

export interface UseFetchExemplarsParams {
  fetchParams: ChartSectionProps['fetchParams'];
  services: ChartSectionProps['services'];
  metricItem: ParsedMetricItem;
  /** Populated by the grid-level probe; gates the fetch per-metric. */
  availableMetrics: Set<string>;
  whereStatements?: string[];
  originalSource?: string;
  profileId: string;
}

const isEsqlRawResponse = (
  r: object
): r is { columns: Array<{ name: string; type: string }>; values: unknown[][] } =>
  Array.isArray((r as Record<string, unknown>).columns) &&
  Array.isArray((r as Record<string, unknown>).values);

/**
 * Per-chart exemplar row fetch. Returns `undefined` while in-flight, when the
 * flag is off, or when the metric has no exemplars. Never throws.
 */
export const useFetchExemplars = ({
  fetchParams,
  services,
  metricItem,
  availableMetrics,
  whereStatements,
  originalSource,
  profileId,
}: UseFetchExemplarsParams): ExemplarRawResponse | undefined => {
  const isExemplarsEnabled = useFeatureFlag(
    FEATURE_FLAGS.IS_EXEMPLARS_ENABLED,
    FEATURE_FLAG_DEFAULTS[FEATURE_FLAGS.IS_EXEMPLARS_ENABLED]
  );
  const reportError = useReportChartSectionError();
  const { dataView } = fetchParams;
  const {
    data: {
      search: { search },
    },
    uiSettings,
  } = services;

  const { value } = useAbortableAsync<ExemplarRawResponse | undefined>(
    async ({ signal }) => {
      if (!isExemplarsEnabled || !dataView || !availableMetrics.has(metricItem.metricName)) {
        return undefined;
      }

      const esqlQuery = createExemplarsQuery({ metricItem, whereStatements, originalSource });
      if (!esqlQuery) {
        return undefined;
      }

      try {
        const { rawResponse } = await executeEsqlQuery({
          esqlQuery,
          search,
          signal,
          dataView,
          timeRange: fetchParams.timeRange,
          uiSettings,
          profileId,
        });

        if (!isEsqlRawResponse(rawResponse)) {
          return undefined;
        }

        return { columns: rawResponse.columns, values: rawResponse.values };
      } catch (error) {
        if (isSuppressedFetchError(error)) {
          return undefined;
        }
        reportError({ error, source: 'useFetchExemplars', labels: { profile_id: profileId } });
        return undefined;
      }
    },
    // `availableMetrics` identity changes when the probe resolves, triggering the first fetch.
    [
      isExemplarsEnabled,
      dataView,
      availableMetrics,
      metricItem,
      whereStatements,
      originalSource,
      search,
      fetchParams.timeRange,
      uiSettings,
      profileId,
      reportError,
    ]
  );

  return value;
};
