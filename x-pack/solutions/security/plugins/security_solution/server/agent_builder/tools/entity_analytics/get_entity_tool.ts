/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition, ToolAvailabilityContext } from '@kbn/agent-builder-server';
import { getToolResultId } from '@kbn/agent-builder-server/tools';
import { executeEsql } from '@kbn/agent-builder-genai-utils';
import {
  getHistorySnapshotIndexPattern,
  getEntitiesAlias,
  ENTITY_LATEST,
} from '@kbn/entity-store/server';
import type { Logger } from '@kbn/logging';
import type { ElasticsearchClient, KibanaRequest } from '@kbn/core/server';
import { ENTITY_ANOMALY_DEFAULT_LOOKBACK_DAYS } from '../../../../common/constants';
import type { AnomalyRecord } from '../../../lib/entity_analytics/enriched_entity/service/utils/get_anomaly_data';
import { EnrichEntityService } from '../../../lib/entity_analytics/enriched_entity';
import type { ExperimentalFeatures } from '../../../../common';
import type { EntityRiskScoreRecord } from '../../../../common/api/entity_analytics/common';
import { IdentifierType } from '../../../../common/api/entity_analytics/common/common.gen';
import { EntityType } from '../../../../common/entity_analytics/types';
import { getRiskScoreTimeSeriesIndex } from '../../../../common/entity_analytics/risk_engine/indices';
import type {
  SecuritySolutionPluginCoreSetupDependencies,
  SetupPlugins,
} from '../../../plugin_contract';
import { getAgentBuilderResourceAvailability } from '../../utils/get_agent_builder_resource_availability';
import { ENTITY_ANALYTICS_AI_TOOL_USAGE_EVENT } from '../../../lib/telemetry/event_based/events';
import { securityTool } from '../constants';
import {
  buildRenderAttachmentTag,
  buildSingleEntityAttachmentId,
  describeAttachmentForRow,
  ensureEntityAttachment,
  getRowValue,
  isAttachmentIdentifierType,
  stripEntityIdPrefix,
  ENTITY_STORE_ENTITY_TYPE_FIELD,
  ENTITY_STORE_ENTITY_ID_FIELD,
  stripRiskRecordForAttachment,
  type EntityAttachmentRiskStats,
} from './entity_attachment_utils';

const schema = z.object({
  entityType: IdentifierType.describe(
    'The type of entity: host, user, service, or generic'
  ).optional(),
  entityId: z
    .string()
    .min(1)
    .describe(
      'The entity id (EUID), canonical entity.name, or user.full_name to fetch. ' +
        'Examples: "host:server1" (prefixed EUID), "server1" (non-prefixed), ' +
        '"LAPTOP-SALES04" (entity.name), "John Doe" (user.full_name).'
    ),
  interval: z
    .string()
    .regex(
      /^\d+[smhdwM]$/,
      `Intervals should follow {value}{unit} where unit is one of s,m,h,d,w,M`
    )
    .describe(
      `The time interval to get entity profile snapshot history (e.g. '30d', '24h', '1w'). Intervals should be in format {value}{unit} where value is a number and unit is one of 's' (second), 'm' (minute), 'h' (hour), 'd' (day), 'w' (week), or 'M' (month)`
    )
    .optional(),
  date: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
      'Date must be in ISO 8601 format (e.g. "2024-01-15T12:00:00Z")'
    )
    .describe(
      `Get the entity's profile on a certain date. Date must be in ISO 8601 datetime format. When specified, both the current profile and the profile snapshot will be fetched.`
    )
    .optional(),
});

export const SECURITY_GET_ENTITY_TOOL_ID = securityTool('get_entity');

const escapeEsqlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const escapeEsqlRlikePattern = (value: string) => {
  const regexEscaped = value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  return escapeEsqlString(regexEscaped);
};

export const normalizeEntityId = (
  entityId: string,
  entityType?: z.infer<typeof IdentifierType>
): string => {
  if (!entityType) {
    return entityId;
  }

  const prefix = `${entityType}:`;
  return entityId.startsWith(prefix) ? entityId : `${prefix}${entityId}`;
};

const intervalToEsql = (interval: string) => {
  const match = interval.match(/^(\d+)([smhdwM])$/);
  if (match == null) {
    throw new Error(`Invalid interval format: ${interval}`);
  }

  const [, value, unit] = match;
  const unitMap: Record<string, string> = {
    s: 'second',
    m: 'minute',
    h: 'hour',
    d: 'day',
    w: 'week',
    M: 'month',
  };
  const unitLabel = unitMap[unit];
  if (unitLabel == null) {
    throw new Error(`Unsupported interval unit: ${unit}`);
  }

  const numericValue = Number(value);
  const intervalUnit = numericValue === 1 ? unitLabel : `${unitLabel}s`;
  return `NOW() - ${numericValue} ${intervalUnit}`;
};

const dateToUtcDayRange = (isoDate: string): { start: string; end: string } => {
  const day = isoDate.slice(0, 10); // "YYYY-MM-DD"
  return {
    start: `${day}T00:00:00.000Z`,
    end: `${day}T23:59:59.999Z`,
  };
};

const formatAnomaly = ({ source, job }: AnomalyRecord) => {
  const { jobName: _jobName, ...restSource } = source;
  const cleanedSource = Object.fromEntries(Object.entries(restSource).filter(([, v]) => v != null));
  return { source: cleanedSource, ...(job ? { job } : {}) };
};

/**
 * Maps the entity-store identifier type to the risk-index `EntityType` enum.
 * Returns `null` when the type is unsupported (e.g. unknown types or types
 * without a dedicated risk index mapping) so the caller can skip the
 * enrichment instead of issuing a doomed query.
 */
const identifierTypeToRiskEntityType = (
  identifierType: z.infer<typeof IdentifierType>
): EntityType | null => {
  switch (identifierType) {
    case 'host':
      return EntityType.host;
    case 'user':
      return EntityType.user;
    case 'service':
      return EntityType.service;
    case 'generic':
      return EntityType.generic;
    default:
      return null;
  }
};

interface RiskStatsPair {
  riskStats?: EntityAttachmentRiskStats;
  resolutionRiskStats?: EntityAttachmentRiskStats;
}

interface FetchRiskStatsForAttachmentParams {
  identifierType: z.infer<typeof IdentifierType>;
  identifier: string;
  entityStoreEntityId: string;
  esClient: ElasticsearchClient;
  spaceId: string;
  logger: Logger;
  createResolutionClient?: (
    esClient: ElasticsearchClient,
    namespace: string
  ) => {
    getResolutionGroup: (
      entityId: string
    ) => Promise<{ group_size: number; target: Record<string, unknown> }>;
  };
}

const dedupeNonEmptyStrings = (values: Array<string | undefined>): string[] => {
  const out = new Set<string>();
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      out.add(value);
    }
  }
  return [...out];
};

/**
 * Direct search against the risk score time-series index for the latest
 * matching risk document.
 *
 * We filter on `<type>.risk.id_value` — the same field the entity-details
 * flyout uses with Entity Store V2 — and pass multiple `id_value` candidates
 * through a `terms` clause so we tolerate both V2 (prefixed EUID, e.g.
 * `user:982675@github`) and V1 (bare name, e.g. `haylee-anderson`) data
 * shapes without a second round-trip.
 */
const searchRiskDocForCandidates = async ({
  esClient,
  spaceId,
  logger,
  entityType,
  idCandidates,
  scoreType,
  debugLabel,
}: {
  esClient: ElasticsearchClient;
  spaceId: string;
  logger: Logger;
  entityType: EntityType;
  idCandidates: string[];
  scoreType: 'base' | 'resolution';
  debugLabel: string;
}): Promise<EntityRiskScoreRecord | undefined> => {
  if (idCandidates.length === 0) {
    return undefined;
  }

  const idValueField = `${entityType}.risk.id_value`;
  const scoreTypeField = `${entityType}.risk.score_type`;

  try {
    const response = await esClient.search<Record<EntityType, { risk: EntityRiskScoreRecord }>>({
      index: getRiskScoreTimeSeriesIndex(spaceId),
      ignore_unavailable: true,
      size: 1,
      sort: [{ '@timestamp': { order: 'desc' } }],
      query: {
        bool: {
          filter: [
            { terms: { [idValueField]: idCandidates } },
            ...(scoreType === 'resolution' ? [{ term: { [scoreTypeField]: 'resolution' } }] : []),
          ],
          ...(scoreType === 'base'
            ? { must_not: [{ term: { [scoreTypeField]: 'resolution' } }] }
            : {}),
        },
      },
    });

    return response.hits.hits[0]?._source?.[entityType]?.risk;
  } catch (error) {
    logger.debug(
      `Failed to fetch ${scoreType} risk score for attachment ${debugLabel}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
};

/**
 * Fetches the full risk breakdown for an entity (and, when part of a
 * resolution group, the group's resolution risk doc) and returns the
 * stripped shapes that can be embedded in the `security.entity` attachment.
 *
 * The client-side chat card uses these to drive `RiskSummaryMini` without
 * spinning up a search-strategy call through Redux. Failures are logged and
 * swallowed — the attachment is still useful without the detailed breakdown.
 */
const fetchRiskStatsForAttachment = async ({
  identifierType,
  identifier,
  entityStoreEntityId,
  esClient,
  spaceId,
  logger,
  createResolutionClient,
}: FetchRiskStatsForAttachmentParams): Promise<RiskStatsPair> => {
  const entityType = identifierTypeToRiskEntityType(identifierType);
  if (!entityType) {
    return {};
  }

  const debugLabel = `${identifierType}:${identifier}`;
  const primaryCandidates = dedupeNonEmptyStrings([entityStoreEntityId, identifier]);

  const primary = await searchRiskDocForCandidates({
    esClient,
    spaceId,
    logger,
    entityType,
    idCandidates: primaryCandidates,
    scoreType: 'base',
    debugLabel,
  });

  let resolution: EntityRiskScoreRecord | undefined;
  if (createResolutionClient) {
    try {
      const resolutionClient = createResolutionClient(esClient, spaceId);
      const group = await resolutionClient.getResolutionGroup(entityStoreEntityId);

      // Only look up a resolution doc when the entity actually participates
      // in a multi-entity group. For standalone entities `group_size === 1`
      // and there is no meaningful resolution score to display.
      if (group.group_size > 1) {
        // Single target, multiple possible `id_value` representations (V2
        // prefixed EUID, V1 `entity.name`, and `<type>.name` fallbacks) — the
        // `terms` clause inside `searchRiskDocForCandidates` OR-matches
        // whichever shape the resolution risk doc was indexed with, so
        // `size: 1` still returns the latest doc for this one target.
        const targetCandidates = getResolutionTargetRiskIdCandidates(group.target);
        resolution = await searchRiskDocForCandidates({
          esClient,
          spaceId,
          logger,
          entityType,
          idCandidates: targetCandidates,
          scoreType: 'resolution',
          debugLabel: `${debugLabel} (resolution)`,
        });
      }
    } catch (error) {
      logger.debug(
        `Failed to look up resolution group for attachment ${debugLabel}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return {
    riskStats: stripRiskRecordForAttachment(primary),
    resolutionRiskStats: stripRiskRecordForAttachment(resolution),
  };
};

/**
 * Collects the identifier values we should feed into the risk index lookup
 * for a resolution-group target. The target document is the raw `_source`
 * from the latest-entities index, so we walk the shape to gather every
 * candidate the risk doc could be keyed on:
 *
 * - `entity.id` — V2's prefixed EUID (matches `<type>.risk.id_value`).
 * - `entity.name` — the display name (matches legacy V1 risk docs keyed
 *   off `<type>.name`).
 * - `host.name`/`user.name`/`service.name` as last-ditch fallbacks for
 *   targets that don't carry the `entity` block.
 */
const getResolutionTargetRiskIdCandidates = (target: Record<string, unknown>): string[] => {
  const entity = target.entity as
    | { EngineMetadata?: { Type?: unknown }; id?: unknown; name?: unknown }
    | undefined;

  const candidates: Array<string | undefined> = [];

  if (typeof entity?.id === 'string') {
    candidates.push(entity.id);
  }
  if (typeof entity?.name === 'string') {
    candidates.push(entity.name);
  }

  const nameFields = ['host.name', 'user.name', 'service.name'];
  for (const field of nameFields) {
    const [first, second] = field.split('.');
    const namespace = target[first] as Record<string, unknown> | undefined;
    const value = namespace?.[second];
    if (typeof value === 'string') {
      candidates.push(value);
    }
  }

  return dedupeNonEmptyStrings(candidates);
};

interface FindEntityByIdParams {
  entityIndex: string;
  entityId: string;
  entityType?: z.infer<typeof IdentifierType>;
  esClient: ElasticsearchClient;
}

type MatchSource = 'exact_id' | 'exact_name' | 'rlike_id' | 'rlike_name';

interface FindEntityByIdResult {
  source: MatchSource;
  query: string;
  columns: Array<{ name: string; type: string }>;
  values: unknown[][];
}

const findEntityById = async ({
  entityIndex,
  entityId,
  entityType,
  esClient,
}: FindEntityByIdParams): Promise<FindEntityByIdResult> => {
  const normalizedEntityId = normalizeEntityId(entityId, entityType);
  const escapedNormalized = escapeEsqlString(normalizedEntityId);

  // 1. Exact id match (canonical key, uses prefix if entityType provided)
  const idQuery = `FROM ${entityIndex} | WHERE entity.id == "${escapedNormalized}" | LIMIT 1`;
  const idHit = await executeEsql({ query: idQuery, esClient });
  if (idHit.values.length > 0) {
    return { source: 'exact_id', query: idQuery, columns: idHit.columns, values: idHit.values };
  }

  // 2. Exact name match against entity.name, user.full_name, or host.name.
  // `user.full_name` and `host.name` are multi-valued `collect` fields in the
  // entity store, so we use MV_CONTAINS instead of `==` (which returns null
  // with a warning on MV inputs). LIMIT 2 still detects display-name
  // collisions so we can suppress the rich entity card and let the LLM
  // disambiguate.
  const escapedRaw = escapeEsqlString(entityId);
  const nameExactQuery =
    `FROM ${entityIndex} ` +
    `| WHERE entity.name == "${escapedRaw}" ` +
    `OR MV_CONTAINS(user.full_name, "${escapedRaw}") ` +
    `OR MV_CONTAINS(host.name, "${escapedRaw}") ` +
    `| LIMIT 2`;
  const nameExactHit = await executeEsql({ query: nameExactQuery, esClient });
  if (nameExactHit.values.length > 0) {
    return {
      source: 'exact_name',
      query: nameExactQuery,
      columns: nameExactHit.columns,
      values: nameExactHit.values,
    };
  }

  // 3. entity.id RLIKE fallback (substring match)
  const rlikePattern = escapeEsqlRlikePattern(entityId);
  const likeQuery = `FROM ${entityIndex} | WHERE entity.id RLIKE ".*${rlikePattern}.*" | LIMIT 5`;
  const likeHit = await executeEsql({ query: likeQuery, esClient });
  if (likeHit.values.length > 0) {
    return {
      source: 'rlike_id',
      query: likeQuery,
      columns: likeHit.columns,
      values: likeHit.values,
    };
  }

  // 4. entity.name / user.full_name RLIKE fallback (substring match)
  const nameQuery = `FROM ${entityIndex} | WHERE entity.name RLIKE ".*${rlikePattern}.*" OR user.full_name RLIKE ".*${rlikePattern}.*" | LIMIT 5`;
  const nameHit = await executeEsql({ query: nameQuery, esClient });
  return {
    source: 'rlike_name',
    query: nameQuery,
    columns: nameHit.columns,
    values: nameHit.values,
  };
};

interface EnrichEntityResultParams {
  row: unknown[];
  columns: Array<{ name: string; type: string }>;
  query: string;
  date?: string;
  interval?: string;
  logger: Logger;
  spaceId: string;
  esClient: ElasticsearchClient;
  enrichedEntityService: EnrichEntityService;
}

const enrichEntityResult = async ({
  row,
  columns,
  query,
  date,
  interval,
  logger,
  spaceId,
  esClient,
  enrichedEntityService,
}: EnrichEntityResultParams) => {
  const rowEntityId = String(getRowValue(columns, row, ENTITY_STORE_ENTITY_ID_FIELD) ?? '');
  const escapedRowEntityId = escapeEsqlString(rowEntityId);

  // date takes full priority: skip risk inputs and return the profile for the matching calendar day
  if (date != null) {
    const { start, end } = dateToUtcDayRange(date);
    const snapshotQuery = `FROM ${getHistorySnapshotIndexPattern(
      spaceId
    )} | WHERE entity.id == "${escapedRowEntityId}" AND @timestamp >= "${start}" AND @timestamp <= "${end}" | LIMIT 1`;
    const snapshotResponse = await executeEsql({ query: snapshotQuery, esClient });
    const profileHistory = snapshotResponse.values.map((r) =>
      Object.fromEntries(snapshotResponse.columns.map((col, i) => [col.name, r[i]]))
    );
    return {
      tool_result_id: getToolResultId(),
      type: ToolResultType.esqlResults,
      data: {
        query,
        columns: [...columns, { name: 'profile_history', type: 'nested' }],
        values: [[...row, JSON.stringify(profileHistory)]],
      },
    };
  }

  let resultColumns = columns;
  let resultRow = [...row];

  try {
    // Get enriched entity
    const toDate = Date.now();
    const fromDate = toDate - ENTITY_ANOMALY_DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const { entities: enrichedEntities } = await enrichedEntityService.getEnrichedEntities({
      filter: { term: { 'entity.id': rowEntityId } },
      size: 1,
      anomalyFromDate: fromDate,
      anomalyToDate: toDate,
    });

    if (enrichedEntities.length > 0) {
      const enrichedEntity = enrichedEntities[0];
      const riskScoreInputs = enrichedEntity.alertDocuments ?? [];
      const anomalies = enrichedEntity.anomalies ?? [];
      const vulnerabilities = enrichedEntity.vulnerabilities ?? [];

      if (riskScoreInputs.length > 0) {
        resultColumns = [...columns, { name: 'risk_score_inputs', type: 'nested' }];
        resultRow = [...resultRow, JSON.stringify(riskScoreInputs)];
      }

      if (anomalies.length > 0) {
        resultColumns = [...resultColumns, { name: 'anomalies', type: 'nested' }];
        resultRow = [...resultRow, JSON.stringify(anomalies.map(formatAnomaly))];
      }

      if (vulnerabilities.length > 0) {
        resultColumns = [...resultColumns, { name: 'vulnerabilities', type: 'nested' }];
        resultRow = [...resultRow, JSON.stringify(vulnerabilities)];
      }
    }
  } catch (errors) {
    // Swallow enrichment errors and continue to return the base entity data.
    logger.debug(
      `Failed to enrich entity ${rowEntityId}: ${
        errors instanceof Error ? errors.message : String(errors)
      }`
    );
  }

  if (interval) {
    const snapshotQuery = `FROM ${getHistorySnapshotIndexPattern(
      spaceId
    )} | WHERE entity.id == "${escapedRowEntityId}" AND @timestamp >= ${intervalToEsql(
      interval
    )} | SORT @timestamp DESC | LIMIT 100`;
    const snapshotResponse = await executeEsql({ query: snapshotQuery, esClient });
    const profileHistory = snapshotResponse.values.map((r) =>
      Object.fromEntries(snapshotResponse.columns.map((col, i) => [col.name, r[i]]))
    );
    resultColumns = [...resultColumns, { name: 'profile_history', type: 'nested' }];
    resultRow = [...resultRow, JSON.stringify(profileHistory)];
  }

  return {
    tool_result_id: getToolResultId(),
    type: ToolResultType.esqlResults,
    data: { query, columns: resultColumns, values: [resultRow] },
  };
};

export const getEntityTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger,
  ml: SetupPlugins['ml'],
  experimentalFeatures: ExperimentalFeatures
): BuiltinToolDefinition<typeof schema> => {
  return {
    id: SECURITY_GET_ENTITY_TOOL_ID,
    type: ToolType.builtin,
    description: `Retrieve profile for security entity (user, host, service, generic) from the Entity store using entity ID (EUID). Includes the alerts that contributed to the risk score if the entity has a risk score.

When exactly one entity is resolved, this tool also stores a \`security.entity\` attachment (creating new or updating existing) and its \`other\` result includes a pre-formatted \`renderTag\` string. To show the rich entity card inline, copy that \`renderTag\` string verbatim onto its own line in your reply BEFORE your prose summary. Do NOT assemble the tag yourself from \`attachmentId\` and \`version\`, and do NOT substitute the id with anything derived from the user's prompt. When the query resolves multiple candidates (fallback match) no attachment is stored, no \`renderTag\` is returned, and you must not emit a render tag in that case.`,
    schema,
    tags: ['security', 'entity-store', 'entity-analytics'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request, spaceId }: ToolAvailabilityContext) => {
        try {
          const availability = await getAgentBuilderResourceAvailability({ core, request, logger });
          if (availability.status === 'available') {
            const isEntityStoreV2Enabled = experimentalFeatures.entityAnalyticsEntityStoreV2;
            if (!isEntityStoreV2Enabled) {
              return {
                status: 'unavailable',
                reason: 'Entity Store V2 is not enabled.',
              };
            }

            const [coreStart] = await core.getStartServices();
            const esClient = coreStart.elasticsearch.client.asInternalUser;

            // Tool is only available if the latest entity store index exists for this space
            const indexExists = await esClient.indices.exists({
              index: getEntitiesAlias(ENTITY_LATEST, spaceId),
            });

            if (!indexExists) {
              return {
                status: 'unavailable',
                reason: 'Entity Store V2 index does not exist for this space',
              };
            }
          }

          return availability;
        } catch (error) {
          return {
            status: 'unavailable',
            reason: `Failed to check entity store v2 index availability: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          };
        }
      },
    },
    handler: async (params, { spaceId, esClient, savedObjectsClient, attachments }) => {
      logger.debug(
        `${SECURITY_GET_ENTITY_TOOL_ID} tool called with parameters ${JSON.stringify(params)}`
      );

      let success = false;
      let entitiesReturned = 0;
      let errorMessage: string | undefined;

      try {
        const { entityType, entityId, interval, date } = params;

        const [coreStart, { entityStore }] = await core.getStartServices();
        const client = esClient.asCurrentUser;
        const normalizedEntityId = normalizeEntityId(entityId, entityType);
        const entityIndex = getEntitiesAlias(ENTITY_LATEST, spaceId);
        const entityStoreClient = entityStore.createCRUDClient(client, spaceId);
        const uiSettingsClient = coreStart.uiSettings.asScopedToClient(savedObjectsClient);
        const enrichedEntityService = new EnrichEntityService({
          entityStoreClient,
          esClient: client,
          experimentalFeatures,
          logger,
          ml,
          // this is a workaround for a bug in the ML providers where Kibana privileges not read correctly from fake requests
          // (which is what the tool receives from the agent builder context when running as a background task)
          request: {} as KibanaRequest,
          soClient: savedObjectsClient,
          spaceId,
          uiSettingsClient,
        });

        const { source, query, columns, values } = await findEntityById({
          entityIndex,
          entityId,
          entityType,
          esClient: client,
        });

        if (values.length === 0) {
          success = true;
          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.error,
                data: { message: `No entity found for id: ${normalizedEntityId}` },
              },
            ],
          };
        }

        // Persist a rich entity attachment only for high-confidence single-row
        // matches. Exact id/name matches are always trusted; the entity.id RLIKE
        // fallback is also trusted when the single resolved row's stripped id
        // equals the user input (i.e. the LLM forgot the "{type}:" prefix).
        // The entity.name RLIKE fallback stays excluded — display-name substring
        // matches are too ambiguous to authoritatively render a card for.
        const isRlikeIdPrefixMatch = (): boolean => {
          if (source !== 'rlike_id' || values.length !== 1) {
            return false;
          }
          const row = values[0];
          const rawType = getRowValue(columns, row, ENTITY_STORE_ENTITY_TYPE_FIELD);
          const rawId = getRowValue(columns, row, ENTITY_STORE_ENTITY_ID_FIELD);
          if (!isAttachmentIdentifierType(rawType) || typeof rawId !== 'string') {
            return false;
          }
          return stripEntityIdPrefix(rawId, rawType) === entityId;
        };

        const shouldCreateAttachment =
          values.length === 1 &&
          (source === 'exact_id' || source === 'exact_name' || isRlikeIdPrefixMatch());

        const attachmentResult = shouldCreateAttachment
          ? await (async () => {
              const baseDescriptor = describeAttachmentForRow({ columns, row: values[0] });
              if (!baseDescriptor) {
                return null;
              }

              // Fetch the real risk breakdown so the chat card's
              // contributions table mirrors the flyout instead of showing
              // zeros (the entity store only stores high-level scores).
              // We prefer the entity-store `entity.id` for the resolution
              // lookup because the resolution group is keyed on that field.
              const rowEntityStoreId = getRowValue(
                columns,
                values[0],
                ENTITY_STORE_ENTITY_ID_FIELD
              );
              const enrichment = await fetchRiskStatsForAttachment({
                identifierType: baseDescriptor.identifierType,
                identifier: baseDescriptor.identifier,
                entityStoreEntityId: typeof rowEntityStoreId === 'string' ? rowEntityStoreId : '',
                esClient: client,
                spaceId,
                logger,
                createResolutionClient: entityStore?.createResolutionClient,
              });

              const descriptor = describeAttachmentForRow({
                columns,
                row: values[0],
                enrichment,
              });
              if (!descriptor) {
                return null;
              }

              return ensureEntityAttachment({
                attachments,
                id: buildSingleEntityAttachmentId(descriptor.identifierType, descriptor.identifier),
                data: {
                  identifierType: descriptor.identifierType,
                  identifier: descriptor.identifier,
                  attachmentLabel: descriptor.attachmentLabel,
                  ...(descriptor.entityStoreId ? { entityStoreId: descriptor.entityStoreId } : {}),
                  ...(descriptor.riskStats ? { riskStats: descriptor.riskStats } : {}),
                  ...(descriptor.resolutionRiskStats
                    ? { resolutionRiskStats: descriptor.resolutionRiskStats }
                    : {}),
                },
                description: descriptor.attachmentLabel,
                logger,
              });
            })()
          : null;

        const attachmentSideEffectResults = attachmentResult
          ? [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.other as const,
                data: {
                  attachmentId: attachmentResult.attachmentId,
                  version: attachmentResult.version,
                  renderTag: buildRenderAttachmentTag(attachmentResult),
                },
              },
            ]
          : [];

        try {
          const enrichedResults = await Promise.all(
            values.map((row) =>
              enrichEntityResult({
                row,
                columns,
                query,
                date,
                interval,
                spaceId,
                logger,
                esClient: client,
                enrichedEntityService,
              })
            )
          );

          success = true;
          entitiesReturned = enrichedResults.length;
          return { results: [...enrichedResults, ...attachmentSideEffectResults] };
        } catch (error) {
          logger.debug(
            `Error enriching entity results: ${
              error instanceof Error ? error.message : 'Unknown error'
            }, returning profile without enrichment`
          );
          success = true;
          entitiesReturned = values.length;
          return {
            results: [
              ...values.map((row) => ({
                tool_result_id: getToolResultId(),
                type: ToolResultType.esqlResults,
                data: { query, columns, values: [row] },
              })),
              ...attachmentSideEffectResults,
            ],
          };
        }
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.error,
              data: { message: `Error fetching entity from Entity Store: ${errorMessage}` },
            },
          ],
        };
      } finally {
        const [coreStart] = await core.getStartServices();
        coreStart.analytics.reportEvent(ENTITY_ANALYTICS_AI_TOOL_USAGE_EVENT.eventType, {
          toolId: SECURITY_GET_ENTITY_TOOL_ID,
          entityTypes: params.entityType ? [params.entityType] : [],
          spaceId,
          success,
          entitiesReturned,
          errorMessage,
        });
      }
    },
  };
};
