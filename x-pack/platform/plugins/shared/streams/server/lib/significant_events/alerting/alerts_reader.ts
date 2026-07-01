/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsqlQueryRequest } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { QueryLink } from '@kbn/significant-events-schema';
import { SignificantEventsAlertsReaderV1 } from './v1_alerts_reader';
import { SignificantEventsAlertsReaderV2 } from './v2_alerts_reader';

export interface ChangePointScanParams {
  lookback: string;
  bucketInterval: string;
  spaceId: string;
}

export interface ChangePointRuleBucket {
  key: string;
  doc_count: number;
  rule_name: {
    top: Array<{ metrics: Record<string, string> }>;
  };
  stream: {
    buckets: Array<{ key: string }>;
  };
  change_points: {
    type: Record<string, { p_value: number }>;
  };
  last_5m: {
    doc_count: number;
  };
  last_floor_window: {
    doc_count: number;
  };
}

export interface RuleMetadata {
  ruleName: string;
  streamName: string;
}

export interface CountDetectionAlertsParams {
  lookback: string;
  spaceId: string;
  ruleUuid?: string;
}

export interface OccurrencesEsqlParams {
  ruleIds: string[];
  value: number;
  esqlUnit: string;
  limit: number;
}

export interface ISignificantEventsAlertsReader {
  readonly index: string;
  readonly ruleIdColumn: 'rule_uuid' | 'rule_id';

  buildOccurrencesEsqlRequest(params: OccurrencesEsqlParams): EsqlQueryRequest;

  countAlerts(esClient: ElasticsearchClient, params: CountDetectionAlertsParams): Promise<number>;

  runChangePointScan(
    esClient: ElasticsearchClient,
    params: ChangePointScanParams,
    queryLinks: QueryLink[]
  ): Promise<{ by_rule: { buckets: ChangePointRuleBucket[] } }>;

  runRuleChangePoint(
    esClient: ElasticsearchClient,
    params: {
      ruleUuid: string;
      lookback: string;
      bucketInterval: string;
      spaceId: string;
    }
  ): Promise<{ aggregations: Record<string, unknown> }>;

  runRuleActivity(
    esClient: ElasticsearchClient,
    params: {
      ruleUuid: string;
      lookback: string;
      windowInterval: string;
      spaceId: string;
    }
  ): Promise<{ aggregations: Record<string, unknown> }>;

  runRuleAlertWindows(
    esClient: ElasticsearchClient,
    params: {
      ruleUuid: string;
      currentLookback: string;
      referenceLookbackGte: string;
      referenceLookbackLt: string;
      spaceId: string;
    }
  ): Promise<{ aggregations: Record<string, unknown> }>;
}

export function buildRuleMetadataMap(queryLinks: QueryLink[]): Map<string, RuleMetadata> {
  const map = new Map<string, RuleMetadata>();
  for (const link of queryLinks) {
    map.set(link.rule_id, {
      ruleName: link.query.title,
      streamName: link.stream_name,
    });
  }
  return map;
}

export const ALERTS_READER_V1: ISignificantEventsAlertsReader =
  new SignificantEventsAlertsReaderV1();
export const ALERTS_READER_V2: ISignificantEventsAlertsReader =
  new SignificantEventsAlertsReaderV2();

export function createAlertsReader(alertingV2Active: boolean): ISignificantEventsAlertsReader {
  return alertingV2Active ? ALERTS_READER_V2 : ALERTS_READER_V1;
}
