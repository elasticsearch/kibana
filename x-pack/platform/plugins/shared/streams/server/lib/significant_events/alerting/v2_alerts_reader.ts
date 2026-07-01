/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { QueryLink } from '@kbn/significant-events-schema';
import { toEsqlRequest } from '../../streams/helpers/esql';
import {
  RULES_BUCKET_SIZE,
  buildChangePointHistogramBounds,
  buildChangePointTimeSeriesAggs,
} from './change_point_scan_shared';
import type {
  ChangePointRuleBucket,
  ChangePointScanParams,
  CountDetectionAlertsParams,
  RuleMetadata,
} from './alerts_reader';
import {
  type ISignificantEventsAlertsReader,
  type OccurrencesEsqlParams,
  buildRuleMetadataMap,
} from './alerts_reader';

interface RawRuleBucket {
  key: string;
  doc_count: number;
  signal_count?: { value?: number };
  change_points?: { type?: Record<string, { p_value: number }> };
  last_5m?: { doc_count?: number; signal_count?: { value?: number } };
  last_floor_window?: { doc_count?: number; signal_count?: { value?: number } };
}

export class SignificantEventsAlertsReaderV2 implements ISignificantEventsAlertsReader {
  readonly index = '.rule-events';
  readonly ruleIdColumn = 'rule_id' as const;

  buildOccurrencesEsqlRequest({ ruleIds, value, esqlUnit, limit }: OccurrencesEsqlParams) {
    const ruleIdLiterals = ruleIds.map((id) => esql.str(id));
    const ruleIdCol = esql.col(['rule', 'id']);

    return toEsqlRequest(
      esql.from([this.index]).where`${ruleIdCol} IN (${ruleIdLiterals})`
        .pipe`STATS count = COUNT_DISTINCT(group_hash) BY rule_id = ${ruleIdCol}, bucket = BUCKET(@timestamp, ${esql.num(
        value
      )} ${esql.kwd(esqlUnit)})`.pipe`SORT bucket ASC`.pipe`LIMIT ${esql.num(limit)}`
    );
  }

  async countAlerts(
    esClient: ElasticsearchClient,
    { lookback, spaceId, ruleUuid }: CountDetectionAlertsParams
  ): Promise<number> {
    const filter: Array<Record<string, unknown>> = [
      { term: { type: 'signal' } },
      { term: { space_id: spaceId } },
      { range: { '@timestamp': { gte: lookback } } },
    ];
    if (ruleUuid) {
      filter.push({ term: { 'rule.id': ruleUuid } });
    }

    const response = await esClient.search({
      index: this.index,
      ignore_unavailable: true,
      size: 0,
      query: { bool: { filter } },
      aggs: {
        signal_count: {
          cardinality: { field: 'group_hash' },
        },
      },
    });

    return (response.aggregations?.signal_count as { value?: number } | undefined)?.value ?? 0;
  }

  async runChangePointScan(
    esClient: ElasticsearchClient,
    params: ChangePointScanParams,
    queryLinks: QueryLink[]
  ) {
    const ruleMetadata = buildRuleMetadataMap(queryLinks);
    const response = await esClient.search({
      index: this.index,
      ignore_unavailable: true,
      size: 0,
      // Drop the per-bucket `over_time` series from the response: it can be large and is only
      // needed server-side as the buckets_path input for the change_point pipeline agg, not in
      // the payload the Detection workflow consumes.
      filter_path: '-aggregations.by_rule.buckets.over_time',
      ...this.buildChangePointScanBody(params),
    });

    const rawBuckets =
      (response.aggregations?.by_rule as { buckets?: RawRuleBucket[] })?.buckets ?? [];

    return {
      by_rule: {
        buckets: rawBuckets.map((bucket) => this.enrichChangePointBucket(bucket, ruleMetadata)),
      },
    };
  }

  async runRuleChangePoint(
    esClient: ElasticsearchClient,
    {
      ruleUuid,
      lookback,
      bucketInterval,
      spaceId,
    }: Parameters<ISignificantEventsAlertsReader['runRuleChangePoint']>[1]
  ) {
    const response = await esClient.search({
      index: this.index,
      ignore_unavailable: true,
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { type: 'signal' } },
            { term: { space_id: spaceId } },
            { term: { 'rule.id': ruleUuid } },
            { range: { '@timestamp': { gte: lookback } } },
          ],
        },
      },
      aggs: buildChangePointTimeSeriesAggs(bucketInterval, {
        useDistinctSignalCount: true,
        extendedBounds: { min: lookback, max: 'now' },
      }),
    });

    return { aggregations: response.aggregations ?? {} };
  }

  async runRuleActivity(
    esClient: ElasticsearchClient,
    {
      ruleUuid,
      lookback,
      windowInterval,
      spaceId,
    }: Parameters<ISignificantEventsAlertsReader['runRuleActivity']>[1]
  ) {
    const response = await esClient.search({
      index: this.index,
      ignore_unavailable: true,
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { type: 'signal' } },
            { term: { space_id: spaceId } },
            { term: { 'rule.id': ruleUuid } },
            { range: { '@timestamp': { gte: lookback } } },
          ],
        },
      },
      aggs: {
        activity_windows: {
          date_histogram: {
            field: '@timestamp',
            fixed_interval: windowInterval,
            min_doc_count: 0,
          },
          aggs: {
            signal_count: {
              cardinality: { field: 'group_hash' },
            },
          },
        },
        peak: {
          max_bucket: { buckets_path: 'activity_windows>signal_count' },
        },
      },
    });

    return { aggregations: this.normalizeActivityAggregations(response.aggregations ?? {}) };
  }

  async runRuleAlertWindows(
    esClient: ElasticsearchClient,
    {
      ruleUuid,
      currentLookback,
      referenceLookbackGte,
      referenceLookbackLt,
      spaceId,
    }: Parameters<ISignificantEventsAlertsReader['runRuleAlertWindows']>[1]
  ) {
    const response = await esClient.search({
      index: this.index,
      ignore_unavailable: true,
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { type: 'signal' } },
            { term: { space_id: spaceId } },
            { term: { 'rule.id': ruleUuid } },
          ],
        },
      },
      aggs: {
        current_window: {
          filter: { range: { '@timestamp': { gte: currentLookback } } },
          aggs: {
            signal_count: {
              cardinality: { field: 'group_hash' },
            },
          },
        },
        reference_window: {
          filter: {
            range: {
              '@timestamp': { gte: referenceLookbackGte, lt: referenceLookbackLt },
            },
          },
          aggs: {
            signal_count: {
              cardinality: { field: 'group_hash' },
            },
          },
        },
      },
    });

    return { aggregations: this.normalizeWindowAggregations(response.aggregations ?? {}) };
  }

  private buildChangePointScanBody({ lookback, bucketInterval, spaceId }: ChangePointScanParams) {
    return {
      query: {
        bool: {
          filter: [
            { term: { type: 'signal' } },
            { term: { space_id: spaceId } },
            { range: { '@timestamp': { gte: lookback } } },
          ],
        },
      },
      aggs: {
        by_rule: {
          terms: { field: 'rule.id', size: RULES_BUCKET_SIZE },
          aggs: {
            signal_count: {
              cardinality: { field: 'group_hash' },
            },
            ...buildChangePointTimeSeriesAggs(bucketInterval, {
              useDistinctSignalCount: true,
              includeFloorWindow: true,
              extendedBounds: buildChangePointHistogramBounds(lookback, bucketInterval),
            }),
          },
        },
      },
    };
  }

  private enrichChangePointBucket(
    bucket: RawRuleBucket,
    ruleMetadata: Map<string, RuleMetadata>
  ): ChangePointRuleBucket {
    const meta = ruleMetadata.get(bucket.key);
    const ruleName = meta?.ruleName ?? 'unknown';
    const streamName = meta?.streamName ?? 'unknown';
    const changePoints = bucket.change_points?.type
      ? { type: bucket.change_points.type }
      : { type: {} as Record<string, { p_value: number }> };

    return {
      key: bucket.key,
      doc_count: bucket.signal_count?.value ?? bucket.doc_count,
      rule_name: { top: [{ metrics: { 'kibana.alert.rule.name': ruleName } }] },
      stream: { buckets: [{ key: streamName }] },
      change_points: changePoints,
      last_5m: { doc_count: this.distinctSignalCount(bucket.last_5m) },
      last_floor_window: { doc_count: this.distinctSignalCount(bucket.last_floor_window) },
    };
  }

  private distinctSignalCount(window?: {
    doc_count?: number;
    signal_count?: { value?: number };
  }): number {
    return window?.signal_count?.value ?? window?.doc_count ?? 0;
  }

  private normalizeWindowAggregations(
    aggregations: Record<string, unknown>
  ): Record<string, unknown> {
    const normalizeWindow = (window: unknown) => {
      const typedWindow = window as
        | { doc_count?: number; signal_count?: { value?: number } }
        | undefined;
      if (!typedWindow) {
        return window;
      }
      return { doc_count: typedWindow.signal_count?.value ?? typedWindow.doc_count ?? 0 };
    };

    return {
      ...aggregations,
      current_window: normalizeWindow(aggregations.current_window),
      reference_window: normalizeWindow(aggregations.reference_window),
    };
  }

  private normalizeActivityAggregations(
    aggregations: Record<string, unknown>
  ): Record<string, unknown> {
    const activityWindows = aggregations.activity_windows as
      | { buckets?: Array<{ key: string; signal_count?: { value?: number } }> }
      | undefined;

    if (!activityWindows?.buckets) {
      return aggregations;
    }

    return {
      ...aggregations,
      activity_windows: {
        buckets: activityWindows.buckets.map((bucket) => ({
          key: bucket.key,
          doc_count: bucket.signal_count?.value ?? 0,
        })),
      },
    };
  }
}
