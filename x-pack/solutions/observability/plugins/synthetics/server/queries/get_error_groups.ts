/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import DateMath from '@kbn/datemath';
import { ALL_SPACES_ID } from '@kbn/spaces-plugin/common/constants';
import {
  EXCLUDE_RUN_ONCE_FILTER,
  SUMMARY_FILTER,
  getQueryFilters,
} from '../../common/constants/client_defaults';
import type { SyntheticsEsClient } from '../lib';
import type {
  ErrorGroupsResponse,
  ErrorGroup,
  ErrorGroupItem,
  ErrorGroupPattern,
  ErrorGroupHistogramBucket,
} from '../../common/runtime_types';

/**
 * Classifies an error group's temporal pattern using its histogram distribution.
 *
 * - persistent: errors appear in >= 75% of time buckets (steady failure)
 * - intermittent: errors in < 75% of buckets but started before the last quarter of the window
 * - new: errors only appear in the most recent quarter of the time window
 */
function classifyPattern(histogram: ErrorGroupHistogramBucket[]): ErrorGroupPattern {
  if (histogram.length <= 1) return 'persistent';

  const nonZero = histogram.filter((b) => b.count > 0);
  const coverage = nonZero.length / histogram.length;

  if (coverage >= 0.75) return 'persistent';

  const quarterIdx = Math.floor(histogram.length * 0.75);
  const earlyBucketsHaveErrors = histogram.slice(0, quarterIdx).some((b) => b.count > 0);

  if (!earlyBucketsHaveErrors) return 'new';

  return 'intermittent';
}

const HISTOGRAM_BUCKET_TARGET = 24;
const MIN_HISTOGRAM_INTERVAL_MS = 60_000;
const FALLBACK_HISTOGRAM_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Every error group must share one aligned time grid. The "Errors over time"
 * chart derives a single bar width from the first group's bucket spacing, then
 * merges all groups into one series; if a short-lived (intermittent) group has
 * a finer bucket interval, the merged series ends up with sub-interval spacing
 * and every bar collapses to sub-pixel width — i.e. the chart renders blank.
 * A per-group `auto_date_histogram` produced exactly that, so we bucket with a
 * single window-derived `fixed_interval` shared by all groups instead.
 */
export function getErrorGroupsHistogramInterval(from: string, to: string): number {
  const fromMs = DateMath.parse(from)?.valueOf();
  const toMs = DateMath.parse(to, { roundUp: true })?.valueOf();

  if (
    fromMs == null ||
    toMs == null ||
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    toMs <= fromMs
  ) {
    return FALLBACK_HISTOGRAM_INTERVAL_MS;
  }

  return Math.max(Math.floor((toMs - fromMs) / HISTOGRAM_BUCKET_TARGET), MIN_HISTOGRAM_INTERVAL_MS);
}

interface GetErrorGroupsParams {
  syntheticsEsClient: SyntheticsEsClient;
  from: string;
  to: string;
  monitorTypes?: string[];
  locations?: string[];
  tags?: string[];
  projects?: string[];
  statusCodes?: string[];
  query?: string;
  spaceId: string;
}

export async function getErrorGroups({
  syntheticsEsClient,
  from,
  to,
  monitorTypes,
  locations,
  tags,
  projects,
  statusCodes,
  query,
  spaceId,
}: GetErrorGroupsParams): Promise<ErrorGroupsResponse> {
  const filters: QueryDslQueryContainer[] = [
    SUMMARY_FILTER as QueryDslQueryContainer,
    EXCLUDE_RUN_ONCE_FILTER as QueryDslQueryContainer,
    { range: { '@timestamp': { gte: from, lte: to } } },
    { term: { 'monitor.status': 'down' } },
    { terms: { 'meta.space_id': [spaceId, ALL_SPACES_ID] } },
  ];

  if (monitorTypes?.length) {
    filters.push({ terms: { 'monitor.type': monitorTypes } });
  }
  if (locations?.length) {
    filters.push({ terms: { 'observer.geo.name': locations } });
  }
  if (tags?.length) {
    filters.push({ terms: { tags } });
  }
  if (projects?.length) {
    filters.push({ terms: { 'monitor.project.id': projects } });
  }
  if (statusCodes?.length) {
    // `http.response.status_code` is mapped as a numeric field, so coerce
    // any URL-string codes to numbers before sending the `terms` query.
    const numericStatusCodes = statusCodes.map((s) => Number(s)).filter((n) => Number.isFinite(n));
    if (numericStatusCodes.length) {
      filters.push({ terms: { 'http.response.status_code': numericStatusCodes } });
    }
  }

  const must: QueryDslQueryContainer[] = [];
  if (query) {
    must.push(getQueryFilters(query) as QueryDslQueryContainer);
  }

  const histogramIntervalMs = getErrorGroupsHistogramInterval(from, to);
  const histogramRangeStart = DateMath.parse(from)?.valueOf();
  const histogramRangeEnd = DateMath.parse(to, { roundUp: true })?.valueOf();
  const histogramBounds =
    histogramRangeStart != null && histogramRangeEnd != null
      ? { extended_bounds: { min: histogramRangeStart, max: histogramRangeEnd } }
      : {};

  const result = await syntheticsEsClient.search(
    {
      size: 0,
      query: {
        bool: {
          filter: filters,
          ...(must.length ? { must } : {}),
        },
      },
      aggs: {
        error_groups: {
          categorize_text: {
            field: 'error.message',
            size: 25,
          },
          aggs: {
            affected_monitors: {
              cardinality: { field: 'config_id' },
            },
            affected_locations: {
              cardinality: { field: 'observer.name' },
            },
            first_seen: {
              min: { field: 'state.started_at' },
            },
            last_seen: {
              max: { field: '@timestamp' },
            },
            error_states: {
              cardinality: { field: 'state.id' },
            },
            per_state: {
              terms: {
                field: 'state.id',
                size: 10,
              },
              aggs: {
                latest: {
                  top_hits: {
                    size: 1,
                    _source: [
                      'error.message',
                      'state.id',
                      'state.duration_ms',
                      'state.started_at',
                      'monitor.name',
                      'monitor.type',
                      'monitor.check_group',
                      '@timestamp',
                      'config_id',
                      'observer.name',
                      'observer.geo.name',
                    ],
                    sort: [{ '@timestamp': { order: 'desc' } }],
                  },
                },
              },
            },
            over_time: {
              date_histogram: {
                field: '@timestamp',
                fixed_interval: `${histogramIntervalMs}ms`,
                min_doc_count: 0,
                ...histogramBounds,
              },
            },
          },
        },
      },
    },
    'getErrorGroups'
  );

  const buckets = (result.body.aggregations as any)?.error_groups?.buckets ?? [];

  const groups: ErrorGroup[] = buckets.map((bucket: any) => {
    const stateItems: ErrorGroupItem[] = (bucket.per_state?.buckets ?? [])
      .map((stateBucket: any) => {
        const source = stateBucket.latest?.hits?.hits?.[0]?._source;
        if (!source) return null;
        return {
          timestamp: source['@timestamp'] ?? '',
          monitorName: source.monitor?.name ?? '',
          monitorType: source.monitor?.type ?? '',
          configId: source.config_id ?? '',
          stateId: source.state?.id ?? '',
          checkGroup: source.monitor?.check_group ?? '',
          locationName: source.observer?.geo?.name ?? source.observer?.name ?? '',
          locationId: source.observer?.name ?? '',
          durationMs: Number(source.state?.duration_ms) || 0,
          errorMessage: source.error?.message ?? '',
        } satisfies ErrorGroupItem;
      })
      .filter(Boolean);

    const firstStateSource = bucket.per_state?.buckets?.[0]?.latest?.hits?.hits?.[0]?._source;
    const sampleMessage: string = firstStateSource?.error?.message ?? (bucket.key as string);

    const histogram = (bucket.over_time?.buckets ?? []).map((timeBucket: any) => ({
      timestamp: timeBucket.key as number,
      count: timeBucket.doc_count as number,
    }));

    return {
      name: bucket.key as string,
      sampleMessage,
      pattern: classifyPattern(histogram),
      count: bucket.error_states?.value ?? 0,
      monitorCount: bucket.affected_monitors?.value ?? 0,
      locationCount: bucket.affected_locations?.value ?? 0,
      firstSeen: bucket.first_seen?.value_as_string ?? '',
      lastSeen: bucket.last_seen?.value_as_string ?? '',
      histogram,
      items: stateItems,
    } satisfies ErrorGroup;
  });

  return { groups };
}
