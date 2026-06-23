/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DocLinksServiceSetup, Logger, StartServicesAccessor } from '@kbn/core/server';
import type { MappingRuntimeFields } from '@elastic/elasticsearch/lib/api/types';
import type { RiskScoresPreviewResponse } from '../../../common/api/entity_analytics';
import type { EntityType } from '../../../common/search_strategy';
import type { ITelemetryEventsSender } from '../telemetry/sender';
import type {
  AfterKeys,
  EntityAfterKey,
  RiskScoreWeights,
} from '../../../common/api/entity_analytics/common';
import type { Range } from '../../../common/entity_analytics/risk_engine';
import type { ConfigType } from '../../config';
import type { SetupPlugins, StartPlugins } from '../../plugin';
import type { SecuritySolutionPluginRouter } from '../../types';
export type EntityAnalyticsConfig = ConfigType['entityAnalytics'];
export interface EntityAnalyticsRoutesDeps {
  router: SecuritySolutionPluginRouter;
  logger: Logger;
  config: ConfigType;
  docLinks: DocLinksServiceSetup;
  getStartServices: StartServicesAccessor<StartPlugins>;
  telemetrySender: ITelemetryEventsSender;
  ml: SetupPlugins['ml'];
  hasEncryptionKey: boolean;
}

export interface CalculateRiskScoreAggregations {
  user?: {
    after_key: EntityAfterKey;
    buckets: RiskScoreBucket[];
  };
  host?: {
    after_key: EntityAfterKey;
    buckets: RiskScoreBucket[];
  };
  service?: {
    after_key: EntityAfterKey;
    buckets: RiskScoreBucket[];
  };
}

export interface SearchHitRiskInput {
  id: string;
  index: string;
  rule_name?: string;
  category?: string;
  time?: string;
  score?: number;
  contribution?: number;
}

export interface RiskScoreBucket {
  key: { [identifierField: string]: string };
  doc_count: number;
  top_inputs: {
    doc_count: number;
    risk_details: {
      value: {
        score: number;
        normalized_score: number;
        notes: string[];
        category_1_score: number;
        category_1_count: number;
        risk_inputs: SearchHitRiskInput[];
      };
    };
  };
}

export interface RiskEngineConfiguration {
  dataViewId: string;
  enabled: boolean;
  filter: unknown;
  identifierType: EntityType | undefined;
  interval: string;
  pageSize: number;
  range: Range;
  alertSampleSizePerShard?: number;
  // When the version changes the engine automatically updates the mappings
  _meta: {
    mappingsVersion: number;
  };
  excludeAlertStatuses?: string[];
  excludeAlertTags?: string[];
  enableResetToZero: boolean;
  filters?: Array<{
    entity_types: string[];
    filter: string;
  }>;
}

export interface CalculateScoresParams {
  afterKeys: AfterKeys;
  debug?: boolean;
  index: string;
  filter?: unknown;
  identifierType?: EntityType;
  pageSize: number;
  range: { start: string; end: string };
  runtimeMappings: MappingRuntimeFields;
  weights?: RiskScoreWeights;
  alertSampleSizePerShard?: number;
  excludeAlertStatuses?: string[];
  excludeAlertTags?: string[];
  filters?: Array<{ entity_types: string[]; filter: string }>;
}

export interface CalculateAndPersistScoresParams {
  afterKeys: AfterKeys;
  debug?: boolean;
  index: string;
  filter?: unknown;
  identifierType: EntityType;
  pageSize: number;
  range: Range;
  runtimeMappings: MappingRuntimeFields;
  weights?: RiskScoreWeights;
  alertSampleSizePerShard?: number;
  excludeAlertStatuses?: string[];
  excludeAlertTags?: string[];
  returnScores?: boolean;
  refresh?: 'wait_for';
}

export type CalculateResults = RiskScoresPreviewResponse & {
  entities: Record<EntityType, string[]>;
};

export interface RiskScoreCompositeBuckets {
  user: {
    after_key: EntityAfterKey;
    buckets: RiskScoreCompositeBucket[];
  };
  host: {
    after_key: EntityAfterKey;
    buckets: RiskScoreCompositeBucket[];
  };
  service: {
    after_key: EntityAfterKey;
    buckets: RiskScoreCompositeBucket[];
  };
}

export interface RiskScoreCompositeBucket {
  key: { [identifierField: string]: string };
  doc_count: number;
}
