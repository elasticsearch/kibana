/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ClusterPutComponentTemplateRequest,
  MappingDynamicMapping,
  Metadata,
} from '@elastic/elasticsearch/lib/api/types';
import {
  createOrUpdateComponentTemplate,
  createOrUpdateIndexTemplate,
} from '@kbn/alerting-plugin/server';
import { mappingFromFieldMap } from '@kbn/alerting-plugin/common';
import type { ElasticsearchClient, Logger, SavedObjectsClientContract } from '@kbn/core/server';

import type { AuditLogger } from '@kbn/security-plugin-types-server';
import {
  getIndexPatternDataStream,
  getTransformOptions,
  mappingComponentName,
  nameSpaceAwareMappingsComponentName,
  riskScoreFieldMap,
  totalFieldsLimit,
} from './configurations';
import { createDataStream, rolloverDataStream } from '../utils/create_datastream';
import type { RiskEngineDataWriter as Writer } from './risk_engine_data_writer';
import { RiskEngineDataWriter } from './risk_engine_data_writer';
import {
  getRiskScoreLatestIndex,
  getRiskScoreTimeSeriesIndex,
} from '../../../../common/entity_analytics/risk_engine';
import {
  createTransform,
  deleteTransform,
  stopTransform,
  getLatestTransformId,
} from '../utils/transforms';
import { getRiskInputsIndex } from './get_risk_inputs_index';

import { createOrUpdateIndex } from '../utils/create_or_update_index';
import { retryTransientEsErrors } from '../utils/retry_transient_es_errors';
import type { RiskScoreHistoryEntry } from '../../../../common/api/entity_analytics/risk_engine';
import { RISK_SCORE_HISTORY_PAGE_SIZE_MAX } from '../../../../common/entity_analytics/risk_score/constants';
import { RiskScoreAuditActions } from './audit';
import { AUDIT_CATEGORY, AUDIT_OUTCOME, AUDIT_TYPE } from '../audit';
import {
  createEventIngestedPipeline,
  getIngestPipelineName,
} from '../utils/event_ingested_pipeline';

interface RiskScoringDataClientOpts {
  logger: Logger;
  kibanaVersion: string;
  esClient: ElasticsearchClient;
  namespace: string;
  soClient: SavedObjectsClientContract;
  auditLogger?: AuditLogger | undefined;
}

export class RiskScoreDataClient {
  private writerCache: Map<string, Writer> = new Map();
  constructor(private readonly options: RiskScoringDataClientOpts) {}

  public async getWriter({ namespace }: { namespace: string }): Promise<Writer> {
    if (this.writerCache.get(namespace)) {
      return this.writerCache.get(namespace) as Writer;
    }
    const indexPatterns = getIndexPatternDataStream(namespace);
    await this.initializeWriter(namespace, indexPatterns.alias);
    return this.writerCache.get(namespace) as Writer;
  }

  private async initializeWriter(namespace: string, index: string): Promise<Writer> {
    const writer = new RiskEngineDataWriter({
      esClient: this.options.esClient,
      namespace,
      index,
      logger: this.options.logger,
    });

    this.writerCache.set(namespace, writer);
    return writer;
  }

  public refreshRiskScoreIndex = async () => {
    await this.options.esClient.indices.refresh({
      index: getRiskScoreTimeSeriesIndex(this.options.namespace),
    });
  };

  /**
   * Daily average normalized risk scores per entity (oldest → newest calendar buckets)
   * from the risk score time-series index. Suitable for trend / escalation analysis.
   *
   * The risk-score time-series index nests the identity-side fields under
   * `<entityType>.risk.*` (e.g. `host.risk.id_field`, `user.risk.id_value`),
   * so this query parameterises every reference on `entityType`.
   *
   * Filters on `<entityType>.risk.id_field === 'entity.id'` so only V2-shaped
   * documents (written by the entity-store risk-score maintainer) participate.
   * Legacy documents written by the pre-V2 scoring task have `id_field` set to
   * `host.name` or `user.name`, and are excluded by this filter. That is the
   * intended behaviour, since their `id_value` carries a raw name rather than
   * an EUID and would silently distort the trend.
   *
   * The returned map is keyed by EUID (e.g. `"host:InnoDB"`).
   */
  public async getDailyAverageRiskScoreNormSeries(params: {
    entityType: string;
    entityIds: readonly string[];
    lookbackRange?: { readonly gte: string; readonly lte: string };
  }): Promise<Map<string, number[]>> {
    const { entityType, entityIds } = params;
    const range = params.lookbackRange ?? { gte: 'now-90d', lte: 'now' };
    const result = new Map<string, number[]>();

    if (entityIds.length === 0) {
      return result;
    }

    const { esClient, namespace } = this.options;
    const index = getRiskScoreTimeSeriesIndex(namespace);

    const idFieldPath = `${entityType}.risk.id_field`;
    const idValuePath = `${entityType}.risk.id_value`;

    const response = await esClient.search({
      index,
      size: 0,
      ignore_unavailable: true,
      allow_no_indices: true,
      query: {
        bool: {
          filter: [
            { term: { [idFieldPath]: 'entity.id' } },
            { terms: { [idValuePath]: [...entityIds] } },
            { range: { '@timestamp': range } },
          ],
        },
      },
      aggs: {
        by_entity: {
          terms: { field: idValuePath, size: entityIds.length },
          aggs: {
            scores_over_time: {
              date_histogram: { field: '@timestamp', calendar_interval: 'day' },
              aggs: {
                avg_score: { avg: { field: `${entityType}.risk.calculated_score_norm` } },
              },
            },
          },
        },
      },
    });

    const buckets = ((response.aggregations?.by_entity as Record<string, unknown>)?.buckets ??
      []) as Array<{
      key: string;
      scores_over_time: { buckets: Array<{ avg_score: { value: number | null } }> };
    }>;

    for (const bucket of buckets) {
      const scores = bucket.scores_over_time.buckets
        .map((b) => b.avg_score.value)
        .filter((v): v is number => v != null);
      result.set(bucket.key, scores);
    }

    return result;
  }

  public getRiskScoreHistory = async (params: {
    entityType: string;
    entityId: string;
    range: { readonly gte: string; readonly lte: string };
    scoreType?: string;
    pageSize: number;
  }): Promise<RiskScoreHistoryEntry[]> => {
    const { esClient, namespace } = this.options;
    const index = getRiskScoreTimeSeriesIndex(namespace);
    const riskPath = `${params.entityType}.risk`;

    const response = await esClient.search<RiskScoreTimeSeriesSource>({
      index,
      size: Math.min(params.pageSize, RISK_SCORE_HISTORY_PAGE_SIZE_MAX),
      sort: [{ '@timestamp': 'asc' }],
      _source: ['@timestamp', riskPath],
      query: {
        bool: {
          filter: [
            { term: { [`${riskPath}.id_field`]: 'entity.id' } },
            { term: { [`${riskPath}.id_value`]: params.entityId } },
            { range: { '@timestamp': { gte: params.range.gte, lte: params.range.lte } } },
            ...toScoreTypeFilter(riskPath, params.scoreType),
          ],
        },
      },
    });

    return response.hits.hits
      .map((hit) => toHistoryEntry(hit._source, params.entityType))
      .filter((entry): entry is RiskScoreHistoryEntry => entry !== undefined);
  };

  public getRiskInputsIndex = ({ dataViewId }: { dataViewId: string }) =>
    getRiskInputsIndex({
      dataViewId,
      logger: this.options.logger,
      soClient: this.options.soClient,
    });

  public createOrUpdateRiskScoreLatestIndex = async () => {
    await createOrUpdateIndex({
      esClient: this.options.esClient,
      logger: this.options.logger,
      options: {
        index: getRiskScoreLatestIndex(this.options.namespace),
        mappings: mappingFromFieldMap(riskScoreFieldMap, false),
        settings: {
          // set to null because it was previously set but we now want it to be removed
          'index.default_pipeline': null,
        },
      },
    });
  };

  public createOrUpdateRiskScoreComponentTemplate = async () =>
    createOrUpdateComponentTemplate({
      logger: this.options.logger,
      esClient: this.options.esClient,
      template: {
        name: nameSpaceAwareMappingsComponentName(this.options.namespace),
        _meta: {
          managed: true,
        },
        template: {
          settings: {},
          mappings: mappingFromFieldMap(riskScoreFieldMap, 'strict'),
        },
      } as ClusterPutComponentTemplateRequest,
      totalFieldsLimit,
    });

  public createOrUpdateRiskScoreIndexTemplate = async () => {
    const indexPatterns = getIndexPatternDataStream(this.options.namespace);
    const indexMetadata: Metadata = {
      kibana: {
        version: this.options.kibanaVersion,
      },
      managed: true,
      namespace: this.options.namespace,
    };

    return createOrUpdateIndexTemplate({
      logger: this.options.logger,
      esClient: this.options.esClient,
      template: {
        name: indexPatterns.template,
        data_stream: { hidden: true },
        index_patterns: [indexPatterns.alias],
        composed_of: [nameSpaceAwareMappingsComponentName(this.options.namespace)],
        template: {
          lifecycle: {},
          settings: {
            'index.mapping.total_fields.limit': totalFieldsLimit,
            'index.default_pipeline': getIngestPipelineName(this.options.namespace),
          },
          mappings: {
            dynamic: false,
            _meta: indexMetadata,
          },
        },
        _meta: indexMetadata,
      },
    });
  };

  public rolloverRiskScoreTimeSeriesIndex = async () =>
    rolloverDataStream({
      esClient: this.options.esClient,
      logger: this.options.logger,
      dataStreamName: getRiskScoreTimeSeriesIndex(this.options.namespace),
    });

  public async init() {
    const namespace = this.options.namespace;
    const esClient = this.options.esClient;

    try {
      await createEventIngestedPipeline(esClient, namespace);

      await this.createOrUpdateRiskScoreComponentTemplate();

      await this.createOrUpdateRiskScoreIndexTemplate();

      const indexPatterns = getIndexPatternDataStream(namespace);
      await createDataStream({
        logger: this.options.logger,
        esClient,
        totalFieldsLimit,
        indexPatterns,
      });

      this.options.auditLogger?.log({
        message: 'System installed risk engine Elasticsearch components',
        event: {
          action: RiskScoreAuditActions.RISK_ENGINE_INSTALL,
          category: AUDIT_CATEGORY.DATABASE,
          type: AUDIT_TYPE.CHANGE,
          outcome: AUDIT_OUTCOME.SUCCESS,
        },
      });
    } catch (error) {
      this.options.logger.error(
        `Error initializing risk engine resources: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * @deprecated This is for the legacy risk engine and will be removed when 9.4 mode is default.
   */
  public async initLegacyTransforms() {
    const namespace = this.options.namespace;
    const esClient = this.options.esClient;

    try {
      await this.createOrUpdateRiskScoreLatestIndex();

      const indexPatterns = getIndexPatternDataStream(namespace);
      const transformId = getLatestTransformId(namespace);
      await createTransform({
        esClient,
        logger: this.options.logger,
        transform: {
          transform_id: transformId,
          ...getTransformOptions({
            dest: getRiskScoreLatestIndex(namespace),
            source: [indexPatterns.alias],
            namespace: this.options.namespace,
          }),
        },
      });
    } catch (error) {
      this.options.logger.error(
        `Error initializing legacy risk engine transforms: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Deletes all resources created by init().
   * It returns an array of errors that occurred during the deletion.
   *
   * WARNING: It will remove all data.
   */
  public async tearDown() {
    const namespace = this.options.namespace;
    const esClient = this.options.esClient;
    const indexPatterns = getIndexPatternDataStream(namespace);
    const errors: Error[] = [];
    const addError = (e: Error) => errors.push(e);

    await deleteTransform({
      esClient,
      logger: this.options.logger,
      transformId: getLatestTransformId(namespace),
      deleteData: true,
    }).catch(addError);

    await esClient.indices
      .deleteDataStream(
        {
          name: indexPatterns.alias,
        },
        { ignore: [404] }
      )
      .catch(addError);

    await esClient.indices
      .deleteIndexTemplate(
        {
          name: indexPatterns.template,
        },
        { ignore: [404] }
      )
      .catch(addError);

    await esClient.cluster
      .deleteComponentTemplate(
        {
          name: nameSpaceAwareMappingsComponentName(namespace),
        },
        { ignore: [404] }
      )
      .catch(addError);

    await esClient.cluster
      .deleteComponentTemplate(
        {
          name: mappingComponentName,
        },
        { ignore: [404] }
      )
      .catch(addError);

    return errors;
  }

  /**
   * Ensures that configuration migrations for risk score indices are seamlessly handled across Kibana upgrades.
   *
   * Upgrades:
   * - Migrating to 8.12+ requires a change to the risk score latest transform index's 'dynamic' setting to ensure that
   * unmapped fields are allowed within stored documents.
   *
   */
  public async upgradeIfNeeded() {
    const desiredDynamicValue = 'false';
    const currentDynamicValue = await this.getRiskScoreLatestIndexDynamicConfiguration();
    if (currentDynamicValue !== desiredDynamicValue) {
      await this.setRiskScoreLatestIndexDynamicConfiguration(desiredDynamicValue);
    }
  }

  private async getRiskScoreLatestIndexDynamicConfiguration(): Promise<string | undefined> {
    const riskScoreLatestIndexName = getRiskScoreLatestIndex(this.options.namespace);
    const riskScoreLatestIndexResponse = await retryTransientEsErrors(
      () => this.options.esClient.indices.get({ index: riskScoreLatestIndexName }),
      { logger: this.options.logger }
    );
    return riskScoreLatestIndexResponse[riskScoreLatestIndexName]?.mappings?.dynamic?.toString();
  }

  /**
   * Sets the risk score latest index's 'dynamic' mapping property to the desired value.
   * @throws Error if the index does not exist.
   */
  private async setRiskScoreLatestIndexDynamicConfiguration(dynamic: MappingDynamicMapping) {
    return retryTransientEsErrors(
      () =>
        this.options.esClient.indices.putMapping({
          index: getRiskScoreLatestIndex(this.options.namespace),
          dynamic,
        }),
      { logger: this.options.logger }
    );
  }

  public copyTimestampToEventIngestedForRiskScore = (abortSignal?: AbortSignal) => {
    return this.options.esClient.updateByQuery(
      {
        index: getRiskScoreLatestIndex(this.options.namespace),
        conflicts: 'proceed',
        ignore_unavailable: true,
        allow_no_indices: true,
        query: {
          bool: {
            must_not: {
              exists: {
                field: 'event.ingested',
              },
            },
          },
        },
        script: {
          source: 'ctx._source.event.ingested = ctx._source.@timestamp',
          lang: 'painless',
        },
      },
      {
        requestTimeout: '5m',
        retryOnTimeout: true,
        maxRetries: 2,
        signal: abortSignal,
      }
    );
  };

  public async reinstallTransform() {
    const esClient = this.options.esClient;
    const namespace = this.options.namespace;
    const transformId = getLatestTransformId(namespace);
    const indexPatterns = getIndexPatternDataStream(namespace);

    await stopTransform({ esClient, logger: this.options.logger, transformId });
    await deleteTransform({ esClient, logger: this.options.logger, transformId });
    await createTransform({
      esClient,
      logger: this.options.logger,
      transform: {
        transform_id: transformId,
        ...getTransformOptions({
          dest: getRiskScoreLatestIndex(namespace),
          source: [indexPatterns.alias],
          namespace: this.options.namespace,
        }),
      },
    });
  }
}

// --- types and helpers for getRiskScoreHistory ---

type RiskScoreTimeSeriesRisk = RiskScoreHistoryEntry & {
  readonly id_field: string;
  readonly id_value: string;
};

interface RiskScoreTimeSeriesSource {
  readonly '@timestamp': string;
  readonly host?: { readonly risk: RiskScoreTimeSeriesRisk };
  readonly user?: { readonly risk: RiskScoreTimeSeriesRisk };
  readonly service?: { readonly risk: RiskScoreTimeSeriesRisk };
}

const toScoreTypeFilter = (
  riskPath: string,
  scoreType: string | undefined
): Array<Record<string, unknown>> => {
  if (scoreType === undefined) {
    return [];
  }

  // documents written before score_type was introduced have no field — treat as base
  if (scoreType === 'base') {
    return [
      {
        bool: {
          should: [
            { term: { [`${riskPath}.score_type`]: 'base' } },
            { bool: { must_not: { exists: { field: `${riskPath}.score_type` } } } },
          ],
          minimum_should_match: 1,
        },
      },
    ];
  }

  return [{ term: { [`${riskPath}.score_type`]: scoreType } }];
};

const getRiskFromSource = (
  source: RiskScoreTimeSeriesSource,
  entityType: string
): RiskScoreTimeSeriesRisk | undefined => {
  if (entityType === 'host') {
    return source.host?.risk;
  }
  if (entityType === 'user') {
    return source.user?.risk;
  }
  if (entityType === 'service') {
    return source.service?.risk;
  }
  return undefined;
};

const toHistoryEntry = (
  source: RiskScoreTimeSeriesSource | undefined,
  entityType: string
): RiskScoreHistoryEntry | undefined => {
  if (source === undefined) {
    return undefined;
  }

  const risk = getRiskFromSource(source, entityType);

  if (risk === undefined) {
    return undefined;
  }

  const timestamp = risk['@timestamp'] ?? source['@timestamp'];

  if (timestamp === undefined) {
    return undefined;
  }

  return {
    '@timestamp': timestamp,
    calculated_score_norm: risk.calculated_score_norm,
    calculated_level: risk.calculated_level,
    ...(risk.calculated_score !== undefined && { calculated_score: risk.calculated_score }),
    ...(risk.score_type !== undefined && { score_type: risk.score_type }),
    ...(risk.category_1_score !== undefined && { category_1_score: risk.category_1_score }),
    ...(risk.category_1_count !== undefined && { category_1_count: risk.category_1_count }),
  };
};
