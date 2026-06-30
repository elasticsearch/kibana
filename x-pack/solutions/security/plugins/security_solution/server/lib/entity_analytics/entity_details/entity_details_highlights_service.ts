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
import {
  getVulnerabilitiesQuery,
  VULNERABILITIES_RESULT_EVALUATION,
} from '@kbn/cloud-security-posture-common/utils/findings_query_builders';
import { buildVulnerabilityEntityFlyoutPreviewQuery } from '@kbn/cloud-security-posture-common';
import type { Replacements } from '@kbn/elastic-assistant-common';
import { getAnonymizedValue, getRawDataOrDefault } from '@kbn/elastic-assistant-common';
import { omit } from 'lodash';
import { getAnonymizedValues } from '@kbn/elastic-assistant-common/impl/data_anonymization/get_anonymized_values';
import { getAnonymizedData } from '@kbn/elastic-assistant-common/impl/data_anonymization/get_anonymized_data';
import { transformRawDataToRecord } from '@kbn/elastic-assistant-common/impl/data_anonymization/transform_raw_data';
import { flattenObject } from '@kbn/object-utils/src/flatten_object';
import type {
  QueryDslQueryContainer,
  QueryDslFieldAndFormat,
} from '@elastic/elasticsearch/lib/api/types';
import type { MlSummaryJob } from '@kbn/ml-plugin/server';
import type { EntityStoreCRUDClient } from '@kbn/entity-store/server';
import type { CriteriaField } from '@kbn/ml-anomaly-utils';
import { createGetRiskScores } from '../risk_score/get_risk_score';
import type { EntityRiskScoreRecord } from '../../../../common/api/entity_analytics/common';
import type { RiskEngineDataClient } from '../risk_engine/risk_engine_data_client';
import type { EntityDetailsHighlightsRequestBody } from '../../../../common/api/entity_analytics/entity_details/highlights.gen';
import { getThreshold } from '../../../../common/utils/ml';
import { isSecurityJob } from '../../../../common/machine_learning/is_security_job';
import {
  EntityType,
  EntityTypeToIdentifierField,
  type EntityIdentifierFields,
} from '../../../../common/entity_analytics/types';
import { DEFAULT_ANOMALY_SCORE } from '../../../../common/constants';
import type { EntityAnalyticsRoutesDeps } from '../types';
import type { AssetCriticalityDataClient, IdentifierValuesByField } from '../asset_criticality';
import { buildCriticalitiesQuery } from '../asset_criticality';
import type { AggregationBucket } from '../../asset_inventory/telemetry/type';
import type { EnrichedEntity } from '../enriched_entity';
import { EnrichEntityService } from '../enriched_entity';

// Always return a new object to prevent mutation
const getEmptyVulnerabilitiesTotal = (): Record<string, number> => ({
  [VULNERABILITIES_RESULT_EVALUATION.NONE]: 0,
  [VULNERABILITIES_RESULT_EVALUATION.CRITICAL]: 0,
  [VULNERABILITIES_RESULT_EVALUATION.HIGH]: 0,
  [VULNERABILITIES_RESULT_EVALUATION.MEDIUM]: 0,
  [VULNERABILITIES_RESULT_EVALUATION.LOW]: 0,
});

interface EntityDetailsHighlightsServiceFactoryOptions {
  riskEngineClient: RiskEngineDataClient;
  entityStoreClient: EntityStoreCRUDClient;
  esClient: ElasticsearchClient;
  experimentalFeatures: EntityAnalyticsRoutesDeps['config']['experimentalFeatures'];
  spaceId: string;
  logger: Logger;
  request: KibanaRequest;
  assetCriticalityClient: AssetCriticalityDataClient;
  soClient: SavedObjectsClientContract;
  uiSettingsClient: IUiSettingsClient;
  ml: EntityAnalyticsRoutesDeps['ml'];
  anonymizationFields: EntityDetailsHighlightsRequestBody['anonymizationFields'];
}

interface GetDataFnOpts {
  entityType: string;
  entityIdentifier: string;
  anomalyFromDate: number;
  anomalyToDate: number;
}

export const entityDetailsHighlightsServiceFactory = ({
  logger,
  riskEngineClient,
  entityStoreClient,
  experimentalFeatures,
  request,
  spaceId,
  esClient,
  assetCriticalityClient,
  soClient,
  uiSettingsClient,
  ml,
  anonymizationFields,
}: EntityDetailsHighlightsServiceFactoryOptions) => {
  let localReplacements: Replacements = {};
  const localOnNewReplacements = (newReplacements: Replacements) => {
    localReplacements = { ...localReplacements, ...newReplacements };
  };
  const fields: QueryDslFieldAndFormat[] = anonymizationFields
    .filter((fieldItem) => fieldItem.allowed)
    .map((fieldItem) => ({
      field: fieldItem.field,
      include_unmapped: true,
    }));

  const getRiskScoreData = async (
    entityType: string,
    entityIdentifier: string,
    checkEngineStatus: boolean = true
  ) => {
    if (checkEngineStatus) {
      const engineStatus = await riskEngineClient.getStatus({ namespace: spaceId });
      if (engineStatus.riskEngineStatus !== 'ENABLED') {
        return null;
      }
    }

    const getRiskScore = createGetRiskScores({
      logger,
      esClient,
      spaceId,
    });

    let latestRiskScore: EntityRiskScoreRecord | null = null;
    const riskScore = await getRiskScore({
      entityType: entityType as EntityType,
      entityIdentifier,
      pagination: { querySize: 1, cursorStart: 0 },
    });
    latestRiskScore = riskScore[0];

    const anonymizedRiskScore = latestRiskScore
      ? [
          {
            score: [latestRiskScore.calculated_score_norm],
            id_field: [latestRiskScore.id_field],
            alert_inputs: latestRiskScore.inputs.map((input) => ({
              risk_score: [input.risk_score?.toString() ?? ''],
              contribution_score: [input.contribution_score?.toString() ?? ''],
              description: [input.description ?? ''],
              timestamp: [input.timestamp ?? ''],
            })),
            asset_criticality_contribution_score:
              latestRiskScore.category_2_score?.toString() ?? '0',
          },
        ]
      : [];

    return anonymizedRiskScore;
  };

  const getAssetCriticalityData = async (
    entityField: EntityIdentifierFields,
    entityIdentifier: string
  ) => {
    const param: IdentifierValuesByField = {
      [entityField]: [entityIdentifier],
    };
    const criticalitiesQuery = buildCriticalitiesQuery(param);

    const criticalitySearchResponse = await assetCriticalityClient.search({
      query: criticalitiesQuery,
      size: 1,
      fields,
    });

    const assetCriticalityAnonymized = criticalitySearchResponse.hits.hits.map((hit) =>
      transformRawDataToRecord({
        anonymizationFields,
        currentReplacements: localReplacements,
        getAnonymizedValue,
        onNewReplacements: localOnNewReplacements,
        rawData: getRawDataOrDefault(omit(hit.fields, '_id')), // We need to exclude _id because asset criticality id contains user data
      })
    );

    return assetCriticalityAnonymized;
  };

  const getAnomaliesData = async (
    criteriaFields: CriteriaField[],
    fromDate: number,
    toDate: number,
    influencersFilterQuery?: {
      bool: {
        filter: Array<QueryDslQueryContainer | undefined> | undefined;
      };
    }
  ) => {
    let anomaliesAnonymized: Record<string, string[]>[] = [];
    if (ml) {
      const jobs: MlSummaryJob[] = await ml.jobServiceProvider(request, soClient).jobsSummary();
      const securityJobIds = jobs.filter(isSecurityJob).map((j) => j.id);
      const { getAnomaliesTableData } = ml.resultsServiceProvider(request, soClient);
      const anomalyScore = await uiSettingsClient.get<number>(DEFAULT_ANOMALY_SCORE);

      const anomaliesData = await getAnomaliesTableData(
        securityJobIds,
        criteriaFields,
        [],
        'auto',
        [{ min: getThreshold(anomalyScore, -1) }],
        fromDate,
        toDate,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        500,
        10,
        influencersFilterQuery
      );

      const jobNameById = jobs.reduce<Record<string, { name: string; description: string }>>(
        (acc, job) => {
          acc[job.id] = {
            name: job.customSettings?.security_app_display_name ?? job.id,
            description: job.description,
          };
          return acc;
        },
        {}
      );

      anomaliesAnonymized = anomaliesData.anomalies.map((anomaly) => {
        // remove fields that could leak user data
        const formattedAnomaly = omit(anomaly.source, [
          'partition_field_value',
          'influencers',
          'entityValue',
        ]);

        // the only ECS fields inside anomalies are entities data (user, host, ip)
        const relatedEntities = getAnonymizedData({
          anonymizationFields,
          currentReplacements: localReplacements,
          rawData: getRawDataOrDefault(flattenObject(formattedAnomaly)),
          getAnonymizedValue,
          getAnonymizedValues,
        });
        localOnNewReplacements(relatedEntities.replacements);

        return flattenObject({
          id: formattedAnomaly.job_id,
          score: formattedAnomaly.record_score,
          job: jobNameById[anomaly.jobId],
          entities: relatedEntities.anonymizedData,
        });
      });
    }
    return anomaliesAnonymized;
  };

  const getVulnerabilityData = async (
    entityType: EntityType,
    query?: {
      bool: {
        filter: Array<QueryDslQueryContainer | undefined> | undefined;
      };
    }
  ) => {
    if (entityType !== EntityType.host) {
      return {
        vulnerabilitiesAnonymized: [],
        vulnerabilitiesTotal: getEmptyVulnerabilitiesTotal(),
      };
    }

    const vulnerabilitiesQuery = getVulnerabilitiesQuery({
      query,
      sort: [{ 'vulnerability.score.base': 'desc' }],
      enabled: true,
      pageSize: 1,
    });
    const vulnerabilities = await esClient.search<
      unknown,
      { count: { buckets: AggregationBucket[] } }
    >({
      ...vulnerabilitiesQuery,
      query: vulnerabilitiesQuery.query as QueryDslQueryContainer,
      _source: false,
      fields,
      size: 100,
    });

    const vulnerabilitiesAggregations = vulnerabilities?.aggregations?.count?.buckets;
    const vulnerabilitiesTotal = vulnerabilitiesAggregations
      ? Object.entries(vulnerabilitiesAggregations).reduce<Record<string, number>>(
          (acc, [key, value]) => {
            acc[key] = value.doc_count;
            return acc;
          },
          getEmptyVulnerabilitiesTotal()
        )
      : getEmptyVulnerabilitiesTotal();

    const vulnerabilitiesAnonymized = vulnerabilities?.hits.hits.map((hit) =>
      transformRawDataToRecord({
        anonymizationFields,
        currentReplacements: localReplacements,
        getAnonymizedValue,
        onNewReplacements: localOnNewReplacements,
        rawData: getRawDataOrDefault(hit.fields),
      })
    );
    return { vulnerabilitiesAnonymized, vulnerabilitiesTotal };
  };

  const getLocalReplacements = (entityField: EntityIdentifierFields, entityIdentifier: string) => {
    // Ensure the entity identifier is present in the replacements
    const anonymizedEntityIdentifier = getAnonymizedData({
      anonymizationFields,
      currentReplacements: {},
      rawData: { [entityField]: [entityIdentifier] },
      getAnonymizedValue,
      getAnonymizedValues,
    });

    localOnNewReplacements(anonymizedEntityIdentifier.replacements);

    return localReplacements;
  };

  const applyAnonymizationToData = (enrichedEntity: EnrichedEntity) => {
    const anonymizedRiskScore = enrichedEntity.riskScore
      ? [
          {
            score: [enrichedEntity.riskScore.calculated_score_norm],
            id_field: [enrichedEntity.riskScore.id_field],
            alert_inputs: enrichedEntity.riskScore.inputs.map((input) => ({
              risk_score: [input.risk_score?.toString() ?? ''],
              contribution_score: [input.contribution_score?.toString() ?? ''],
              description: [input.description ?? ''],
              timestamp: [input.timestamp ?? ''],
            })),
            asset_criticality_contribution_score:
              enrichedEntity.riskScore.category_2_score?.toString() ?? '0',
          },
        ]
      : [];

    const assetCriticalityAnonymized_ = transformRawDataToRecord({
      anonymizationFields,
      currentReplacements: localReplacements,
      getAnonymizedValue,
      onNewReplacements: localOnNewReplacements,
      rawData: getRawDataOrDefault(omit(enrichedEntity.fields, '_id')), // We need to exclude _id because asset criticality id contains user data
    });
    const assetCriticalityAnonymized = assetCriticalityAnonymized_
      ? [assetCriticalityAnonymized_]
      : [];

    const vulnerabilitiesAnonymized = (enrichedEntity.vulnerabilities ?? []).map((hit) =>
      transformRawDataToRecord({
        anonymizationFields,
        currentReplacements: localReplacements,
        getAnonymizedValue,
        onNewReplacements: localOnNewReplacements,
        rawData: getRawDataOrDefault(hit.fields),
      })
    );

    const anomaliesAnonymized = (enrichedEntity.anomalies ?? []).map((anomaly) => {
      // remove fields that could leak user data
      const formattedAnomaly = omit(anomaly.source, [
        'partition_field_value',
        'influencers',
        'entityValue',
      ]);

      // the only ECS fields inside anomalies are entities data (user, host, ip)
      const relatedEntities = getAnonymizedData({
        anonymizationFields,
        currentReplacements: localReplacements,
        rawData: getRawDataOrDefault(flattenObject(formattedAnomaly)),
        getAnonymizedValue,
        getAnonymizedValues,
      });
      localOnNewReplacements(relatedEntities.replacements);

      return flattenObject({
        id: formattedAnomaly.job_id ?? formattedAnomaly.jobId,
        score: formattedAnomaly.record_score ?? formattedAnomaly.recordScore,
        job: anomaly.job,
        threat_tactics: formattedAnomaly.threatTactics ?? [],
        entities: relatedEntities.anonymizedData,
      });
    });

    return {
      riskScore: anonymizedRiskScore ?? undefined,
      assetCriticality: assetCriticalityAnonymized,
      vulnerabilities: vulnerabilitiesAnonymized ?? [],
      vulnerabilitiesTotal: enrichedEntity.vulnerabilitiesTotal, // Prevents the UI from displaying the wrong number of vulnerabilities
      anomalies: anomaliesAnonymized,
    };
  };

  const getV1Data = async ({
    entityType,
    entityIdentifier,
    anomalyFromDate,
    anomalyToDate,
  }: GetDataFnOpts) => {
    const entityField = EntityTypeToIdentifierField[entityType as EntityType];
    const anonymizedRiskScore = await getRiskScoreData(entityType, entityIdentifier);
    const assetCriticalityAnonymized = await getAssetCriticalityData(entityField, entityIdentifier);

    const { vulnerabilitiesAnonymized, vulnerabilitiesTotal } = await getVulnerabilityData(
      entityType as EntityType,
      buildVulnerabilityEntityFlyoutPreviewQuery(entityField, entityIdentifier)
    );

    const anomaliesAnonymized: Record<string, string[]>[] = await getAnomaliesData(
      [{ fieldName: entityField, fieldValue: entityIdentifier }],
      anomalyFromDate,
      anomalyToDate
    );

    return {
      assetCriticality: assetCriticalityAnonymized,
      riskScore: anonymizedRiskScore ?? undefined,
      vulnerabilities: vulnerabilitiesAnonymized ?? [],
      vulnerabilitiesTotal, // Prevents the UI from displaying the wrong number of vulnerabilities
      anomalies: anomaliesAnonymized,
    };
  };

  const getV2Data = async ({ entityIdentifier, anomalyFromDate, anomalyToDate }: GetDataFnOpts) => {
    const enrichedEntityService = new EnrichEntityService({
      entityStoreClient,
      esClient,
      experimentalFeatures,
      logger,
      ml,
      request,
      soClient,
      spaceId,
      uiSettingsClient,
    });

    const { entities: enrichedEntities } = await enrichedEntityService.getEnrichedEntities({
      anomalyFromDate,
      anomalyToDate,
      filter: { term: { 'entity.id': entityIdentifier } },
      size: 1,
      fields,
      getAlertInputsForRiskScore: false,
    });

    if (!enrichedEntities || enrichedEntities.length === 0) {
      return {
        riskScore: [],
        assetCriticality: [],
        vulnerabilities: [],
        vulnerabilitiesTotal: getEmptyVulnerabilitiesTotal(),
        anomalies: [],
      };
    }

    return applyAnonymizationToData(enrichedEntities[0]);
  };

  return {
    getLocalReplacements,
    getV1Data,
    getV2Data,
  };
};
