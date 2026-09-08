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
import type { EntityDetailsHighlightsRequestBody } from '../../../../common/api/entity_analytics/entity_details/highlights.gen';
import { getThreshold } from '../../../../common/utils/ml';
import { isSecurityJob } from '../../../../common/machine_learning/is_security_job';
import {
  EntityType,
  EntityTypeToIdentifierField,
  type EntityIdentifierFields,
} from '../../../../common/entity_analytics/types';
import { DEFAULT_ANOMALY_SCORE } from '../../../../common/constants';
import { CriticalityLevels } from '../../../../common/entity_analytics/asset_criticality/constants';
import type { EntityAnalyticsRoutesDeps } from '../types';
import type { AssetCriticalityDataClient, IdentifierValuesByField } from '../asset_criticality';
import { buildCriticalitiesQuery } from '../asset_criticality';
import type { AggregationBucket } from '../../asset_inventory/telemetry/type';
import type { EnrichedEntity } from '../enriched_entity';
import { EnrichEntityService } from '../enriched_entity';

/**
 * Rounds a score to 2 decimal places for the LLM payload. The generated summary echoes
 * whatever numbers it is given, so formatting the payload here keeps the summary
 * consistent with the rest of Entity Analytics instead of surfacing raw values like
 * `67.2175384208`. Returns an empty string for null/undefined to match the existing
 * payload shape.
 *
 * NOTE: this intentionally duplicates the 2-decimal rounding of the UI's
 * `formatRiskScore` (public/entity_analytics/common/utils.ts). That helper lives in
 * `public` and cannot be imported by server code. Follow-up: extract `formatRiskScore`
 * into `common/entity_analytics/risk_score` so the UI and server share one source of
 * truth (kept out of this PR to avoid an unrelated cross-file refactor).
 */
const formatScoreForSummary = (score: number | null | undefined): string =>
  score == null ? '' : (Math.round(score * 100) / 100).toFixed(2);

/**
 * Human-readable labels for the asset-criticality enum, so the generated summary matches
 * the Entity Analytics UI (e.g. `extreme_impact` rendered as `Extreme Impact`) instead of
 * echoing the raw enum value.
 *
 * NOTE: this intentionally duplicates the UI's `CRITICALITY_LEVEL_TITLE`
 * (public/entity_analytics/components/asset_criticality/translations.ts). That map is
 * built from `i18n.translate` and lives in `public`, so it cannot be imported by server
 * code. Follow-up: extract the level labels into `common/entity_analytics/asset_criticality`
 * so the UI and server share one source of truth (kept out of this PR to avoid an
 * unrelated cross-file refactor).
 */
const CRITICALITY_LEVEL_SUMMARY_LABELS: Record<string, string> = {
  unassigned: 'Unassigned',
  low_impact: 'Low Impact',
  medium_impact: 'Medium Impact',
  high_impact: 'High Impact',
  extreme_impact: 'Extreme Impact',
};

const isCriticalityFieldKey = (key: string): boolean =>
  key === 'criticality_level' || // asset-criticality index / risk docs (V1)
  key === 'asset.criticality' || // entity store ECS field (V2)
  key.endsWith('.asset.criticality'); // e.g. host.asset.criticality, user.asset.criticality

const isAssignedCriticalityValue = (value: unknown): boolean =>
  (Object.values(CriticalityLevels) as string[]).includes(String(value));

/**
 * Picks only criticality fields from entity-store raw data. Returns undefined when none are
 * assigned (missing or `unassigned`)
 */
const getAssignedCriticalityRawData = (
  rawData: Record<string, unknown[]>
): Record<string, unknown[]> | undefined => {
  const picked: Record<string, unknown[]> = {};
  for (const [key, values] of Object.entries(rawData)) {
    if (isCriticalityFieldKey(key)) {
      picked[key] = values;
    }
  }
  const hasAssigned = Object.values(picked).some((values) =>
    values.some(isAssignedCriticalityValue)
  );
  return hasAssigned ? picked : undefined;
};

/**
 * Rewrites the criticality-level values inside an anonymized asset-criticality record to
 * their human-readable labels. The value lands in the record under `criticality_level`
 * or the ECS field `asset.criticality` (optionally prefixed by the entity, e.g.
 * `host.asset.criticality`); unknown values pass through unchanged so nothing is dropped
 * if the enum ever grows.
 */
const formatCriticalityLevelsInRecord = (
  record: Record<string, string[]>
): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(record).map(([key, values]) => [
      key,
      isCriticalityFieldKey(key)
        ? values.map((value) => CRITICALITY_LEVEL_SUMMARY_LABELS[value] ?? value)
        : values,
    ])
  );

// Always return a new object to prevent mutation
const getEmptyVulnerabilitiesTotal = (): Record<string, number> => ({
  [VULNERABILITIES_RESULT_EVALUATION.NONE]: 0,
  [VULNERABILITIES_RESULT_EVALUATION.CRITICAL]: 0,
  [VULNERABILITIES_RESULT_EVALUATION.HIGH]: 0,
  [VULNERABILITIES_RESULT_EVALUATION.MEDIUM]: 0,
  [VULNERABILITIES_RESULT_EVALUATION.LOW]: 0,
});

interface EntityDetailsHighlightsServiceFactoryOptions {
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

  const getRiskScoreData = async (entityType: string, entityIdentifier: string) => {
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
            score: [formatScoreForSummary(latestRiskScore.calculated_score_norm)],
            id_field: [latestRiskScore.id_field],
            alert_inputs: latestRiskScore.inputs.map((input) => ({
              risk_score: [formatScoreForSummary(input.risk_score)],
              contribution_score: [formatScoreForSummary(input.contribution_score)],
              description: [input.description ?? ''],
              timestamp: [input.timestamp ?? ''],
            })),
            asset_criticality_contribution_score:
              latestRiskScore.category_2_score != null
                ? formatScoreForSummary(latestRiskScore.category_2_score)
                : '0',
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
      formatCriticalityLevelsInRecord(
        transformRawDataToRecord({
          anonymizationFields,
          currentReplacements: localReplacements,
          getAnonymizedValue,
          onNewReplacements: localOnNewReplacements,
          rawData: getRawDataOrDefault(omit(hit.fields, '_id')), // We need to exclude _id because asset criticality id contains user data
        })
      )
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

  const applyAnonymizationToData = (enrichedEntity: EnrichedEntity, entityType: EntityType) => {
    const anonymizedRiskScore = enrichedEntity.riskScore
      ? [
          {
            score: [formatScoreForSummary(enrichedEntity.riskScore.calculated_score_norm)],
            id_field: [enrichedEntity.riskScore.id_field],
            alert_inputs: enrichedEntity.riskScore.inputs.map((input) => ({
              risk_score: [formatScoreForSummary(input.risk_score)],
              contribution_score: [formatScoreForSummary(input.contribution_score)],
              description: [input.description ?? ''],
              timestamp: [input.timestamp ?? ''],
            })),
            asset_criticality_contribution_score:
              enrichedEntity.riskScore.category_2_score != null
                ? formatScoreForSummary(enrichedEntity.riskScore.category_2_score)
                : '0',
          },
        ]
      : [];

    const criticalityRawData = getAssignedCriticalityRawData(
      getRawDataOrDefault(enrichedEntity.fields)
    );
    const assetCriticalityAnonymized = criticalityRawData
      ? [
          formatCriticalityLevelsInRecord(
            transformRawDataToRecord({
              anonymizationFields,
              currentReplacements: localReplacements,
              getAnonymizedValue,
              onNewReplacements: localOnNewReplacements,
              rawData: criticalityRawData,
            })
          ),
        ]
      : [];

    // Vulnerabilities only apply to hosts (enrichment only queries findings when
    // entityType === EntityType.host — see enriched_entity/service/utils/get_vulnerability_data.ts).
    // Omitting these keys for non-hosts keeps the LLM from rendering a zeroed-out
    // Vulnerabilities section in the flyout summary.
    const vulnerabilitiesAnonymized =
      entityType === EntityType.host
        ? (enrichedEntity.vulnerabilities ?? []).map((hit) =>
            transformRawDataToRecord({
              anonymizationFields,
              currentReplacements: localReplacements,
              getAnonymizedValue,
              onNewReplacements: localOnNewReplacements,
              rawData: getRawDataOrDefault(hit.fields),
            })
          )
        : undefined;

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
      ...(vulnerabilitiesAnonymized !== undefined
        ? {
            vulnerabilities: vulnerabilitiesAnonymized,
            // Prevents the UI from displaying the wrong number of vulnerabilities
            vulnerabilitiesTotal: enrichedEntity.vulnerabilitiesTotal,
          }
        : {}),
      // Null when empty so the model gets an explicit "no ML anomalies" signal
      // (clearer than [] or omitting the key).
      anomalies: anomaliesAnonymized.length > 0 ? anomaliesAnonymized : null,
    };
  };

  const getV1Data = async ({
    entityType,
    entityIdentifier,
    anomalyFromDate,
    anomalyToDate,
  }: GetDataFnOpts) => {
    const typedEntityType = entityType as EntityType;
    const entityField = EntityTypeToIdentifierField[typedEntityType];
    const anonymizedRiskScore = await getRiskScoreData(entityType, entityIdentifier);
    const assetCriticalityAnonymized = await getAssetCriticalityData(entityField, entityIdentifier);

    // Vulnerabilities only apply to hosts (enrichment only queries findings when
    // entityType === EntityType.host — see enriched_entity/service/utils/get_vulnerability_data.ts).
    // Omitting these keys for non-hosts keeps the LLM from rendering a zeroed-out
    // Vulnerabilities section in the flyout summary.
    const vulnerabilityData =
      typedEntityType === EntityType.host
        ? await getVulnerabilityData(
            typedEntityType,
            buildVulnerabilityEntityFlyoutPreviewQuery(entityField, entityIdentifier)
          )
        : undefined;

    const anomaliesAnonymized: Record<string, string[]>[] = await getAnomaliesData(
      [{ fieldName: entityField, fieldValue: entityIdentifier }],
      anomalyFromDate,
      anomalyToDate
    );

    return {
      assetCriticality: assetCriticalityAnonymized,
      riskScore: anonymizedRiskScore ?? undefined,
      ...(vulnerabilityData !== undefined
        ? {
            vulnerabilities: vulnerabilityData.vulnerabilitiesAnonymized ?? [],
            // Prevents the UI from displaying the wrong number of vulnerabilities
            vulnerabilitiesTotal: vulnerabilityData.vulnerabilitiesTotal,
          }
        : {}),
      // Null when empty so the model gets an explicit "no ML anomalies" signal
      // (clearer than [] or omitting the key).
      anomalies: anomaliesAnonymized.length > 0 ? anomaliesAnonymized : null,
    };
  };

  const getV2Data = async ({
    entityType,
    entityIdentifier,
    anomalyFromDate,
    anomalyToDate,
  }: GetDataFnOpts) => {
    const typedEntityType = entityType as EntityType;
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
      // No entity → omit vulnerabilities; anomalies are explicitly null (no ML findings).
      return {
        riskScore: [],
        assetCriticality: [],
        anomalies: null,
      };
    }

    return applyAnonymizationToData(enrichedEntities[0], typedEntityType);
  };

  return {
    getLocalReplacements,
    getV1Data,
    getV2Data,
  };
};
