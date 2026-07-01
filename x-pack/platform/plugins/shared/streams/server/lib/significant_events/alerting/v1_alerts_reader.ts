/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { QueryLink } from '@kbn/significant-events-schema';
import { ALERT_RULE_UUID } from '@kbn/rule-data-utils';
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
  rule_name?: { top?: Array<{ metrics?: Record<string, string> }> };
  stream?: { buckets?: Array<{ key: string }> };
  change_points?: { type?: Record<string, { p_value: number }> };
  last_5m?: { doc_count?: number };
  last_floor_window?: { doc_count?: number };
}

export class SignificantEventsAlertsReaderV1 implements ISignificantEventsAlertsReader {
  readonly index = '.alerts-streams.alerts-default';
  readonly ruleIdColumn = 'rule_uuid' as const;

  buildOccurrencesEsqlRequest({ ruleIds, value, esqlUnit, limit }: OccurrencesEsqlParams) {
    const ruleIdLiterals = ruleIds.map((id) => esql.str(id));
    const ruleUuidCol = esql.col(ALERT_RULE_UUID.split('.'));

    return toEsqlRequest(
      esql.from([this.index]).where`${ruleUuidCol} IN (${ruleIdLiterals})`
        .pipe`STATS count = COUNT(*) BY rule_uuid = ${ruleUuidCol}, bucket = BUCKET(@timestamp, ${esql.num(
        value
      )} ${esql.kwd(esqlUnit)})`.pipe`SORT bucket ASC`.pipe`LIMIT ${esql.num(limit)}`
    );
  }

  async countAlerts(
    esClient: ElasticsearchClient,
    { lookback, spaceId, ruleUuid }: CountDetectionAlertsParams
  ): Promise<number> {
    const filter: Array<Record<string, unknown>> = [
      {
        terms: {
          'kibana.space_ids': [spaceId, '*'],
        },
      },
      { range: { '@timestamp': { gte: lookback } } },
    ];
    if (ruleUuid) {
      filter.push({ term: { 'kibana.alert.rule.uuid': ruleUuid } });
    }

    const response = await esClient.count({
      index: this.index,
      ignore_unavailable: true,
      query: { bool: { filter } },
    });

    return response.count;
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
            { terms: { 'kibana.space_ids': [spaceId, '*'] } },
            { term: { 'kibana.alert.rule.uuid': ruleUuid } },
            { range: { '@timestamp': { gte: lookback } } },
          ],
        },
      },
      aggs: buildChangePointTimeSeriesAggs(bucketInterval, {
        useDistinctSignalCount: false,
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
            { terms: { 'kibana.space_ids': [spaceId, '*'] } },
            { term: { 'kibana.alert.rule.uuid': ruleUuid } },
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
        },
        peak: {
          max_bucket: { buckets_path: 'activity_windows._count' },
        },
      },
    });

    return { aggregations: response.aggregations ?? {} };
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
            { terms: { 'kibana.space_ids': [spaceId, '*'] } },
            { term: { 'kibana.alert.rule.uuid': ruleUuid } },
          ],
        },
      },
      aggs: {
        current_window: {
          filter: { range: { '@timestamp': { gte: currentLookback } } },
        },
        reference_window: {
          filter: {
            range: {
              '@timestamp': { gte: referenceLookbackGte, lt: referenceLookbackLt },
            },
          },
        },
      },
    });

    return { aggregations: response.aggregations ?? {} };
  }

  private buildChangePointScanBody({ lookback, bucketInterval, spaceId }: ChangePointScanParams) {
    return {
      query: {
        bool: {
          filter: [
            { terms: { 'kibana.space_ids': [spaceId, '*'] } },
            { range: { '@timestamp': { gte: lookback } } },
          ],
        },
      },
      aggs: {
        by_rule: {
          terms: { field: 'kibana.alert.rule.uuid', size: RULES_BUCKET_SIZE },
          aggs: {
            rule_name: {
              top_metrics: {
                metrics: [{ field: 'kibana.alert.rule.name' }],
                sort: { '@timestamp': 'desc' },
                size: 1,
              },
            },
            stream: {
              terms: { field: 'kibana.alert.rule.tags', exclude: 'streams', size: 1 },
            },
            ...buildChangePointTimeSeriesAggs(bucketInterval, {
              useDistinctSignalCount: false,
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
    // These sub-aggs are absent when a rule produced too few/no docs in the window: ES omits the
    // `change_points` result, the `rule_name` top hit, and the `stream` terms buckets. We then fall
    // back to the rule/stream identity from the queryLinks metadata so the bucket shape stays stable.
    const meta = ruleMetadata.get(bucket.key);
    const ruleName = meta?.ruleName ?? 'unknown';
    const streamName = meta?.streamName ?? 'unknown';
    const changePoints = bucket.change_points?.type
      ? { type: bucket.change_points.type }
      : { type: {} as Record<string, { p_value: number }> };
    const ruleNameAgg = bucket.rule_name?.top?.[0]?.metrics
      ? { top: [{ metrics: bucket.rule_name.top[0].metrics as Record<string, string> }] }
      : { top: [{ metrics: { 'kibana.alert.rule.name': ruleName } }] };
    const streamAgg = bucket.stream?.buckets
      ? { buckets: bucket.stream.buckets }
      : { buckets: [{ key: streamName }] };

    return {
      key: bucket.key,
      doc_count: bucket.doc_count,
      rule_name: ruleNameAgg,
      stream: streamAgg,
      change_points: changePoints,
      last_5m: { doc_count: bucket.last_5m?.doc_count ?? 0 },
      last_floor_window: { doc_count: bucket.last_floor_window?.doc_count ?? 0 },
    };
  }
}
