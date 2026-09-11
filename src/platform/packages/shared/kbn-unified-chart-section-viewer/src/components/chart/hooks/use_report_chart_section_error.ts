/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { apm } from '@elastic/apm-rum';
import type { Logger } from '@kbn/logging';
import { useCallback } from 'react';
import { useExternalServices } from '../../../context/external_services';
import { ERROR_TYPE } from '../../../utils/error_labels';
import { toLoggable } from '../../../utils/logger_utils';
import {
  classifyChartSectionError,
  getChartSectionErrorMeta,
} from '../../../common/errors/classify_chart_section_error';
import { isSuppressedFetchError } from '../utils/is_suppressed_fetch_error';

/** APM label identifying which chart-section call site produced an error. */
export type ChartSectionErrorSource =
  | 'useFetchExemplars'
  | 'useFetchMetricsData'
  | 'useLensProps'
  | 'useMetricSourceKind';

/**
 * Correlation labels merged into the APM payload alongside the error.
 *
 * `profile_id` is required: it identifies which data source profile owns the
 * failing chart section and is the only label that lets us filter these
 * events in APM. `chart_id` is optional because not every call site has a
 * stable chart identifier (e.g. the grid-level fetch).
 */
interface ChartSectionErrorLabels {
  profile_id: string;
  chart_id?: string;
  page?: string;
}

export interface ReportChartSectionErrorArgs {
  error: unknown;
  source: ChartSectionErrorSource;
  labels: ChartSectionErrorLabels;
}

/**
 * Minimal adapter for the APM RUM `Span` outcome field. The public RUM types
 * do not expose `outcome`, but the runtime span object accepts it (mirroring
 * lens/data_loader.ts). Casting through this interface preserves type-safety
 * for the single assignment without suppressing real type errors.
 */
interface SpanWithOutcome {
  outcome: 'success' | 'failure';
}

/**
 * Reports a non-render chart-section error to APM. No-ops on `AbortError`
 * (per `isSuppressedFetchError`) and non-Error values. APM transport
 * failures are swallowed and routed through `logger` when provided.
 */
const reportChartSectionError = (
  { error, source, labels: callerLabels }: ReportChartSectionErrorArgs,
  logger?: Logger
): void => {
  if (isSuppressedFetchError(error)) {
    return;
  }
  if (!(error instanceof Error)) {
    return;
  }

  // Best-effort: APM reporting must never break the host app. If `@elastic/apm-rum`
  // throws (e.g. transport failure, internal error) swallow it silently.
  try {
    const labels: Record<string, string> = {};
    // Drop undefined / empty values so APM is not polluted with placeholder
    // labels (e.g., an unset `chart_id`). Caller labels are written first so
    // that the reserved keys assigned below (`error_type`,
    // `chart_section_source`, `esql_*`, `error_category`) always win on
    // collision and cannot be overridden by a caller bypassing the
    // `ChartSectionErrorLabels` type.
    for (const [key, value] of Object.entries(callerLabels)) {
      if (value !== undefined && value !== '') {
        labels[key] = value;
      }
    }
    labels.error_type = ERROR_TYPE.CHART_SECTION_NON_RENDER_ERROR;
    labels.chart_section_source = source;
    const { type: esqlErrorType, status: esqlStatus } = getChartSectionErrorMeta(error);
    if (esqlErrorType) {
      labels.esql_error_type = esqlErrorType;
    }
    if (esqlStatus != null) {
      labels.esql_status = String(esqlStatus);
    }
    labels.error_category = classifyChartSectionError(error);

    // `apm.captureError` alone doesn't mark the surrounding transaction failed.
    // Mirror lens/data_loader.ts: attach a failed child span around the capture.
    const span = apm
      .getCurrentTransaction()
      ?.startSpan('chart-section-non-render-error', 'chart-section');
    span?.addLabels(labels);
    apm.captureError(error, { labels });
    if (span) {
      (span as unknown as SpanWithOutcome).outcome = 'failure';
      span.end();
    }
  } catch (reportingError) {
    // Best-effort: swallow and route through logger tagged
    // `error_type=APMReportingFailure` for grep-ability. No-ops silently
    // if no logger is wired.
    logger?.error(toLoggable(reportingError), {
      labels: {
        error_type: ERROR_TYPE.APM_REPORTING_FAILURE,
        chart_section_source: source,
      },
    });
  }
};

/**
 * Returns a stable reporter bound to the package logger from
 * {@link useExternalServices}.
 */
export const useReportChartSectionError = (): ((args: ReportChartSectionErrorArgs) => void) => {
  const logger = useExternalServices()?.logger;
  return useCallback(
    (args: ReportChartSectionErrorArgs) => reportChartSectionError(args, logger),
    [logger]
  );
};
