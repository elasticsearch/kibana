/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/common';
import type { ESQLSearchResponse } from '@kbn/es-types';
import type { IUiSettingsClient } from '@kbn/core/public';
import type { ISearchGeneric } from '@kbn/search-types';
import type { ChartSectionProps } from '@kbn/unified-histogram/types';
import { useAbortableAsync } from '@kbn/react-hooks';
import { FEATURE_FLAG_DEFAULTS, FEATURE_FLAGS } from '../../../../common/constants';
import { useFeatureFlag } from '../../../../hooks/use_feature_flag';
import { isSuppressedFetchError } from '../../../chart/utils/is_suppressed_fetch_error';
import { useReportChartSectionError } from '../../../chart/hooks/use_report_chart_section_error';
import { executeEsqlQuery } from '../utils/execute_esql_query';

/**
 * Asks Elasticsearch which metrics have exemplars. `LIMIT 0` returns column metadata
 * and no rows, so the answer is the column list, which is very fast.
 *
 * This detection step is mandatory: querying an exemplars stream that does not exist,
 * or a metric column that is absent from it, will trigger a 400 error. Many metrics have
 * no exemplars, so without this we will see chart errors.
 *
 * The `metrics.*` wildcard is tolerant of matching nothing, so the probe itself only
 * fails when no exemplars data stream exists at all - one failure for the whole grid.
 *
 * TODO(elasticsearch#154786): this is also the natural place to hang the eventual
 * `TS_EXEMPLARS` capability check.
 */
export const EXEMPLARS_PROBE_QUERY = 'FROM exemplars-*.otel-* | KEEP metrics.* | LIMIT 0';

export interface UseExemplarsAvailabilityParams {
  fetchParams: ChartSectionProps['fetchParams'];
  services: ChartSectionProps['services'];
  /** Forwarded as the `profile_id` APM label on captured errors. */
  profileId: string;
}

export interface ExemplarsAvailabilityResult {
  /**
   * Names of the metric fields that have exemplars. Empty while the probe is in
   * flight, when the flag is off, and if the probe failed.
   */
  availableMetrics: Set<string>;
  /**
   * `true` only when the probe request itself failed. Distinguishes "could not ask"
   * from "asked and this metric has no exemplars", which should not look like an error.
   */
  hasProbeFailed: boolean;
}

// Module-scope sentinels: consumers rebuild Lens props off these values' identity, so a
// fresh object per render would re-trigger a rebuild on every render.
const NOTHING_AVAILABLE: ExemplarsAvailabilityResult = Object.freeze({
  availableMetrics: new Set<string>(),
  hasProbeFailed: false,
});

const PROBE_FAILED: ExemplarsAvailabilityResult = Object.freeze({
  availableMetrics: new Set<string>(),
  hasProbeFailed: true,
});

/**
 * Detects which metrics have OTLP exemplars, with one request for the whole grid.
 * Never throws: a failed probe degrades to "nothing available" and is reported to APM
 * under its own `chart_section_source` so it stays distinguishable from chart errors.
 */
export const useExemplarsAvailability = ({
  fetchParams,
  services,
  profileId,
}: UseExemplarsAvailabilityParams): ExemplarsAvailabilityResult => {
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

  const { value } = useAbortableAsync<ExemplarsAvailabilityResult | undefined>(async () => {
    // Gate before anything else: when the flag is off we do not fetch exemplars at all.
    if (!isExemplarsEnabled || !dataView) {
      return undefined;
    }

    try {
      const availableMetrics = await probeExemplarsAvailability({
        search,
        dataView,
        uiSettings,
        profileId,
      });
      return { availableMetrics, hasProbeFailed: false };
    } catch (error) {
      if (isSuppressedFetchError(error)) {
        // An abort is the normal unmount / refetch path, not a probe failure. Reporting
        // it would page on navigation, and flagging it would raise the failure warning
        // for a request nobody was waiting on.
        return undefined;
      }
      reportError({ error, source: 'useFetchExemplars', labels: { profile_id: profileId } });
      return PROBE_FAILED;
    }
  }, [isExemplarsEnabled, dataView, search, uiSettings, profileId, reportError]);

  return value ?? NOTHING_AVAILABLE;
};

interface ProbeParams {
  search: ISearchGeneric;
  dataView: DataView;
  uiSettings: IUiSettingsClient;
  profileId: string;
}

// Caches the in-flight promise rather than the resolved value: every chart in the grid
// asks on the same render, and a resolved-value cache would only be populated after the
// first await, by which point the others would already have issued their own request.
//
// Lives for the browser session and is cleared on any full page reload, including
// switching Kibana spaces.
const cache = new Map<string, Promise<Set<string>>>();

/**
 * Clears the cache above. Call when previous probes are known to be stale
 * (e.g. between tests).
 */
export const resetExemplarsAvailabilityCache = () => {
  cache.clear();
};

const probeExemplarsAvailability = async (params: ProbeParams): Promise<Set<string>> => {
  const cacheKey = EXEMPLARS_PROBE_QUERY;
  let pending = cache.get(cacheKey);

  if (!pending) {
    pending = fetchMetricsWithExemplars(params);
    cache.set(cacheKey, pending);
    // Negative-cache eviction: both a failure and an empty column set can be transient
    // (the exemplars data stream is only created on the first exemplar write). Evict so
    // the next consumer retries instead of pinning "no exemplars" for the whole session.
    pending
      .then((availableMetrics) => {
        if (availableMetrics.size === 0 && cache.get(cacheKey) === pending) {
          cache.delete(cacheKey);
        }
      })
      .catch(() => {
        if (cache.get(cacheKey) === pending) {
          cache.delete(cacheKey);
        }
      });
  }

  return pending;
};

const fetchMetricsWithExemplars = async ({
  search,
  dataView,
  uiSettings,
  profileId,
}: ProbeParams): Promise<Set<string>> => {
  // Deliberately no `signal`: the request is shared by every chart in the grid via the
  // cache above, so binding it to one consumer's lifetime would cancel it for the others.
  // `useAbortableAsync`'s own signal still controls whether a landed result is applied.
  //
  // Deliberately no `timeRange` or `filters` either: this asks a schema question ("which
  // metric columns exist here?"), and a filter on a field the exemplars stream does not
  // map would silently return nothing.
  const { rawResponse } = await executeEsqlQuery({
    esqlQuery: EXEMPLARS_PROBE_QUERY,
    search,
    dataView,
    uiSettings,
    profileId,
  });

  return new Set(extractColumnNames(rawResponse));
};

// `ExecuteEsqlResult.rawResponse` is typed as `object`, so narrow before reading columns.
const hasColumns = (response: object): response is Pick<ESQLSearchResponse, 'columns'> =>
  Array.isArray((response as Partial<ESQLSearchResponse>).columns);

const extractColumnNames = (response: object): string[] =>
  hasColumns(response) ? response.columns.map(({ name }) => name) : [];
