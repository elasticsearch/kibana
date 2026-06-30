/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ElasticsearchClient,
  IUiSettingsClient,
  KibanaRequest,
  Logger,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import type {
  QueryDslFieldAndFormat,
  QueryDslQueryContainer,
  SearchHit,
} from '@elastic/elasticsearch/lib/api/types';
import type { EntityStoreCRUDClient } from '@kbn/entity-store/server';
import type { Entity } from '@kbn/entity-store/common';
import type { EntityRiskScoreRecord } from '../../../../../common/api/entity_analytics/common';
import type { EntityAnalyticsRoutesDeps } from '../../types';
import type { ExperimentalFeatures } from '../../../../../common';
import { getRiskScoreData, getAnomalyData, getVulnerabilityData } from './utils';
import type { AnomalyRecord } from './utils/get_anomaly_data';

interface GetEnrichedEntitiesParams {
  anomalyFromDate: number;
  anomalyToDate: number;
  filter?: QueryDslQueryContainer | QueryDslQueryContainer[];
  fields?: QueryDslFieldAndFormat[];
  size?: number;
  searchAfter?: Array<string | number>;
  getAlertInputsForRiskScore?: boolean;
}

export interface EnrichedEntity {
  entity: Entity;
  fields?: SearchHit['fields'];
  riskScore?: EntityRiskScoreRecord;
  anomalies?: AnomalyRecord[];
  vulnerabilities?: SearchHit[];
  vulnerabilitiesTotal?: Record<string, number>;
  alertDocuments?: Array<Record<string, unknown>>;
}
export interface EnrichedEntityResult {
  entities: Array<EnrichedEntity>;
}

interface EnrichedEntityServiceOpts {
  entityStoreClient: EntityStoreCRUDClient;
  esClient: ElasticsearchClient;
  experimentalFeatures: ExperimentalFeatures;
  logger: Logger;
  ml: EntityAnalyticsRoutesDeps['ml'];
  request: KibanaRequest;
  soClient: SavedObjectsClientContract;
  spaceId: string;
  uiSettingsClient: IUiSettingsClient;
}
export class EnrichEntityService {
  constructor(private readonly opts: EnrichedEntityServiceOpts) {}

  public async getEnrichedEntities({
    anomalyFromDate,
    anomalyToDate,
    filter,
    fields,
    size,
    searchAfter,
    getAlertInputsForRiskScore = true,
  }: GetEnrichedEntitiesParams): Promise<EnrichedEntityResult> {
    // Proxies a call to the entity store to get the entities matching the input filter
    const { entities, fields: entityFields } = await this.opts.entityStoreClient.listEntities({
      filter,
      size,
      searchAfter,
      ...(fields ? { fields } : {}),
    });

    if (!entities || entities.length === 0) {
      return { entities: [] };
    }

    // Enrich any returned entities with risk score, anomalies, and vulnerabilities
    const sharedOpts = {
      entities,
      esClient: this.opts.esClient,
      logger: this.opts.logger,
    };

    const [riskScoreData, anomalyData, vulnerabilityData] = await Promise.all([
      getRiskScoreData({
        ...sharedOpts,
        spaceId: this.opts.spaceId,
        getAlerts: getAlertInputsForRiskScore,
      }),
      getAnomalyData({
        ...sharedOpts,
        experimentalFeatures: this.opts.experimentalFeatures,
        fromDate: anomalyFromDate,
        toDate: anomalyToDate,
        ml: this.opts.ml,
        request: this.opts.request,
        soClient: this.opts.soClient,
        uiSettingsClient: this.opts.uiSettingsClient,
      }),
      getVulnerabilityData({ ...sharedOpts, fields }),
    ]);

    return {
      entities: entities.map((entity, i) => ({
        entity,
        fields: entityFields?.[i],
        riskScore: riskScoreData[i].riskScore,
        anomalies: anomalyData[i],
        vulnerabilities: vulnerabilityData[i].vulnerabilities,
        vulnerabilitiesTotal: vulnerabilityData[i].vulnerabilitiesTotal,
        ...(getAlertInputsForRiskScore ? { alertDocuments: riskScoreData[i].alertDocuments } : {}),
      })),
    };
  }
}
