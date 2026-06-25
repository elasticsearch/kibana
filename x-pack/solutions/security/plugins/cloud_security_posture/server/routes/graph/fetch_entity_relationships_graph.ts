/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { castArray } from 'lodash';
import type { Logger, IScopedClusterClient } from '@kbn/core/server';
import type { EsqlToRecords } from '@elastic/elasticsearch/lib/helpers';
import { getEntitiesLatestIndexName } from '@kbn/cloud-security-posture-common/utils/helpers';
import { ENTITY_RELATIONSHIP_FIELDS } from '@kbn/cloud-security-posture-common/constants';
import {
  type EuidSourceFields,
  GRAPH_ACTOR_EUID_SOURCE_FIELDS,
  TYPED_ENTITY_PREFIXES,
} from './constants';
import {
  concatJsonObjectPropertyBool,
  concatJsonObjectPropertyString,
  concatJsonObjectPropertyEsqlExprSafe,
  JSON_OBJECT_END,
  JSON_OBJECT_SEPARATOR,
  JSON_OBJECT_START,
  concatJsonObjectPropertyEsqlExprAsString,
  hashIds,
  rebuildDocData,
} from './utils';
import type { EntityId, EntityRecord, RelationshipEdge, RelationshipEsqlRow } from './types';
import type { EntityEnrichmentFields } from './fetch_entity_enrichment';

interface BuildRelationshipsEsqlQueryParams {
  indexName: string;
  relationshipFields: readonly string[];
}

const RESOLUTION_RELATIONSHIP_FIELD = 'resolution.resolved_to' as const;

/**
 * ECS relationship leaves store canonical target EUIDs under `entity.relationships.<leaf>.ids`
 * and raw dimensions under `entity.relationships.<leaf>.raw_identifiers.*` (dynamic bag).
 * Resolution still uses `entity.relationships.resolution.resolved_to`.
 */
const buildRelationshipTargetsEval = (field: string): string => {
  const col = `\`_rel_targets_${field}\``;
  if (field === RESOLUTION_RELATIONSHIP_FIELD) {
    return `${col} = COALESCE(\`entity.relationships.resolution.resolved_to\`, [""])`;
  }

  return `${col} = COALESCE(\`entity.relationships.${field}.ids\`, [""])`;
};

/**
 * Builds ES|QL query for fetching entity relationships from the generic entities index.
 * Uses FORK to expand each relationship field and aggregates results.
 * The filter is applied via the DSL filter parameter.
 * Target enrichment is applied later in TypeScript via fetchEntityEnrichment.
 */
const buildRelationshipsEsqlQuery = ({
  indexName,
  relationshipFields,
}: BuildRelationshipsEsqlQueryParams): string => {
  const targetsEval = relationshipFields
    .map((field) => buildRelationshipTargetsEval(field))
    .join(',\n  ');

  // Build FORK branches: expand flattened targets per relationship leaf
  const forkBranches = relationshipFields
    .map((field) => {
      const col = `\`_rel_targets_${field}\``;
      return `  (MV_EXPAND ${col} | EVAL relationship = "${field}" | EVAL _target_id = TO_STRING(${col}) | DROP entity.relationships.*, ${col})`;
    })
    .join('\n');

  return `SET unmapped_fields="nullify";
FROM ${indexName}
| EVAL _source_source_fields = ${buildSourceFieldsJson(GRAPH_ACTOR_EUID_SOURCE_FIELDS)}
| EVAL
  ${targetsEval}
| FORK
${forkBranches}
| WHERE _target_id != ""
// Build actors doc data with entity metadata (from the entity store source entity)
| EVAL actorDocData = CONCAT(${JSON_OBJECT_START},
    ${concatJsonObjectPropertyEsqlExprSafe('id', 'entity.id')},
    ${JSON_OBJECT_SEPARATOR}, ${concatJsonObjectPropertyString('type', 'entity')},
    ${JSON_OBJECT_SEPARATOR}, "\\"entity\\":", ${JSON_OBJECT_START},
      ${concatJsonObjectPropertyBool('availableInEntityStore', true)},
      CASE(entity.name IS NOT NULL, CONCAT(${JSON_OBJECT_SEPARATOR},
        ${concatJsonObjectPropertyEsqlExprAsString('name', 'entity.name')}), ""),
      CASE(entity.type IS NOT NULL, CONCAT(${JSON_OBJECT_SEPARATOR},
        ${concatJsonObjectPropertyEsqlExprAsString('type', 'entity.type')}), ""),
      CASE(entity.sub_type IS NOT NULL, CONCAT(${JSON_OBJECT_SEPARATOR},
        ${concatJsonObjectPropertyEsqlExprAsString('sub_type', 'entity.sub_type')}), ""),
      CASE(entity.EngineMetadata.Type IS NOT NULL, CONCAT(${JSON_OBJECT_SEPARATOR},
        ${concatJsonObjectPropertyEsqlExprAsString(
          'engine_type',
          'entity.EngineMetadata.Type'
        )}), ""),
      CASE(
        host.ip IS NOT NULL,
        CONCAT(${JSON_OBJECT_SEPARATOR}, "\\"host\\":", ${JSON_OBJECT_START},
          "\\"ip\\":[\\"", MV_CONCAT(TO_STRING(host.ip), "\\",\\""), "\\"]",
          ${JSON_OBJECT_END}),
        ""
      ),
      ${JSON_OBJECT_SEPARATOR}, _source_source_fields,
    ${JSON_OBJECT_END},
  ${JSON_OBJECT_END})
// Target entity data built by TypeScript enrichment
| EVAL targetDocData = CONCAT(${JSON_OBJECT_START},
    ${concatJsonObjectPropertyEsqlExprSafe('id', '_target_id')},
    ${JSON_OBJECT_SEPARATOR}, ${concatJsonObjectPropertyString('type', 'entity')},
  ${JSON_OBJECT_END})
// Per-triple rows. All grouping (actor × relationship × target type/sub_type) happens in
// TypeScript via regroupRelationships. STATS … BY (entity.id, relationship, _target_id)
// would inflate row count beyond ES|QL's 10,000-row hard cap on dense entity stores.
| EVAL actorId = TO_STRING(entity.id),
  targetId = TO_STRING(_target_id),
  relationshipNodeId = CONCAT(TO_STRING(entity.id), "-", relationship)
| RENAME \`entity.type\` AS actorEntityType,
  \`entity.sub_type\` AS actorEntitySubType,
  \`entity.name\` AS actorEntityName,
  \`host.ip\` AS actorHostIps
| KEEP actorId, actorEntityType, actorEntitySubType, actorEntityName, actorHostIps, actorDocData, relationship, relationshipNodeId, targetId, targetDocData
| SORT relationship ASC`;
};

/**
 * Builds a DSL filter for relationship queries from entityIds.
 * Creates a query that matches:
 * 1. Entities where entity.id is in the provided IDs (direct match)
 * 2. Entities where any entity.relationships.* field contains the provided IDs
 *    (entities that have relationships pointing to these IDs)
 */
const buildRelationshipDslFilter = (entityIds: EntityId[]) => {
  if (!entityIds || entityIds.length === 0) {
    return undefined;
  }

  // Extract just the IDs for the terms query
  const ids = entityIds.map((entity) => entity.id);

  const relationshipQueries = ENTITY_RELATIONSHIP_FIELDS.map((field) => {
    if (field === RESOLUTION_RELATIONSHIP_FIELD) {
      return {
        terms: {
          'entity.relationships.resolution.resolved_to': ids,
        },
      };
    }

    return {
      terms: {
        [`entity.relationships.${field}.ids`]: ids,
      },
    };
  });

  return {
    bool: {
      should: [
        // Match entities by their ID
        {
          terms: {
            'entity.id': ids,
          },
        },
        // Match entities that have relationships pointing to these IDs
        ...relationshipQueries,
      ],
      minimum_should_match: 1,
    },
  };
};

/**
 * Fetches entity relationships from the generic entities index.
 * Queries for all relationship types for entities matching the provided entityIds.
 * Note: Relationships require the v2 entity store; returns an empty result if the
 * entities index does not exist.
 */
export const fetchEntityRelationships = async ({
  esClient,
  logger,
  entityIds,
  spaceId,
  entityStoreIndexExists,
}: {
  esClient: IScopedClusterClient;
  logger: Logger;
  entityIds: EntityId[];
  spaceId: string;
  entityStoreIndexExists: boolean;
}): Promise<EsqlToRecords<RelationshipEsqlRow>> => {
  if (!entityStoreIndexExists) {
    return { columns: [], records: [] };
  }

  const indexName = getEntitiesLatestIndexName(spaceId);
  logger.trace(`Fetching relationships from index [${indexName}] for ${entityIds.length} entities`);

  const query = buildRelationshipsEsqlQuery({
    indexName,
    relationshipFields: ENTITY_RELATIONSHIP_FIELDS,
  });
  const filter = buildRelationshipDslFilter(entityIds);

  logger.trace(`Relationships ES|QL query: ${query}`);
  logger.trace(`Relationships filter: ${JSON.stringify(filter)}`);

  const response = await esClient.asCurrentUser.helpers
    .esql({
      columnar: false,
      filter,
      query,
    })
    .toRecords<RelationshipEsqlRow>();

  logger.trace(`Fetched [${response.records.length}] relationship records`);

  return response;
};

export const fetchEntities = async ({
  esClient,
  logger,
  entityIds,
  spaceId,
  entityStoreIndexExists,
}: {
  esClient: IScopedClusterClient;
  logger: Logger;
  entityIds: EntityId[];
  spaceId: string;
  entityStoreIndexExists: boolean;
}): Promise<EsqlToRecords<EntityRecord>> => {
  if (entityIds.length === 0 || !entityStoreIndexExists) {
    return { columns: [], records: [] };
  }

  const indexName = getEntitiesLatestIndexName(spaceId);

  logger.trace(`Fetching entities from index [${indexName}] for ${entityIds.length} entities`);
  const esqlQuery = `SET unmapped_fields="nullify";
    FROM ${indexName}
    | WHERE entity.id IN (${entityIds.map((_, idx) => `?entityId${idx}`).join(',')})
    | INLINE STATS __host_ip = VALUES(TO_STRING(host.ip)) // Extract host IPs as string type
    | EVAL id = entity.id
    | EVAL name = entity.name
    | EVAL type = entity.type
    | EVAL sub_type = entity.sub_type
    | EVAL docData = CONCAT(${JSON_OBJECT_START},
      ${concatJsonObjectPropertyEsqlExprAsString('id', 'entity.id')},
      ${JSON_OBJECT_SEPARATOR}, ${concatJsonObjectPropertyString('type', 'entity')},
      ${JSON_OBJECT_SEPARATOR}, "\\"entity\\":", ${JSON_OBJECT_START},
        ${concatJsonObjectPropertyBool('availableInEntityStore', true)},
        CASE(entity.name IS NOT NULL, CONCAT(${JSON_OBJECT_SEPARATOR},
          ${concatJsonObjectPropertyEsqlExprAsString('name', 'entity.name')}), ""),
        CASE(entity.type IS NOT NULL, CONCAT(${JSON_OBJECT_SEPARATOR},
          ${concatJsonObjectPropertyEsqlExprAsString('type', 'entity.type')}), ""),
        CASE(entity.sub_type IS NOT NULL, CONCAT(${JSON_OBJECT_SEPARATOR},
          ${concatJsonObjectPropertyEsqlExprAsString('sub_type', 'entity.sub_type')}), ""),
        CASE(entity.EngineMetadata.Type IS NOT NULL, CONCAT(${JSON_OBJECT_SEPARATOR},
          ${concatJsonObjectPropertyEsqlExprAsString(
            'engine_type',
            'entity.EngineMetadata.Type'
          )}), ""),
        CASE(
          host.ip IS NOT NULL,
          CONCAT(${JSON_OBJECT_SEPARATOR}, "\\"host\\":", ${JSON_OBJECT_START},
            "\\"ip\\":[\\"", MV_CONCAT(__host_ip, "\\",\\""), "\\"]",
            ${JSON_OBJECT_END}),
          ""
        ),
        ${JSON_OBJECT_SEPARATOR}, ${buildSourceFieldsJson(GRAPH_ACTOR_EUID_SOURCE_FIELDS)},
      ${JSON_OBJECT_END},
    ${JSON_OBJECT_END})
    | KEEP id, name, type, sub_type, docData`;
  logger.trace(`Entities ES|QL query: ${esqlQuery}`);

  const response = await esClient.asCurrentUser.helpers
    .esql({
      columnar: false,
      query: esqlQuery,
      params: entityIds.map((entity, idx) => ({ [`entityId${idx}`]: entity.id })),
    })
    .toRecords<EntityRecord>();

  logger.trace(`Fetched [${response.records.length}] entity records`);
  return response;
};

const buildSourceFieldsJson = (fields: EuidSourceFields): string => {
  const properties = Object.keys(fields)
    .map((type) => {
      if (type === 'all') {
        return fields.all.map(
          (field) =>
            `CASE(${field} IS NOT NULL, ${concatJsonObjectPropertyEsqlExprSafe(field, field)}, "")`
        );
      } else if (type === 'generic') {
        // Generic entities don't have a type prefix in their EUID,
        // so use a negative condition to match them
        const notTypedCondition = TYPED_ENTITY_PREFIXES.map(
          (p) => `NOT STARTS_WITH(entity.id, "${p}:")`
        ).join(' AND ');
        return fields[type as keyof EuidSourceFields].map(
          (field) => `CASE(${notTypedCondition} AND ${field} IS NOT NULL,
            ${concatJsonObjectPropertyEsqlExprSafe(field.replace('.target', ''), field)}, "")`
        );
      } else {
        const typeEuidFields = fields[type as keyof EuidSourceFields];
        return typeEuidFields.map(
          (field) => `CASE(STARTS_WITH(entity.id, "${type}:") AND ${field} IS NOT NULL,
            ${concatJsonObjectPropertyEsqlExprSafe(field.replace('.target', ''), field)}, "")`
        );
      }
    })
    .flat()
    .join(`, ${JSON_OBJECT_SEPARATOR},\n      `);
  return `
  REPLACE(
    REPLACE(
      REPLACE(CONCAT("\\"sourceFields\\":", ${JSON_OBJECT_START}, ${properties}, ${JSON_OBJECT_END}), "[,]+", ","),
    "\\\\{,", ${JSON_OBJECT_START}),
  ",}", ${JSON_OBJECT_END})`;
};

interface RelationshipGroup {
  actorIds: Set<string>;
  actorEntityType: string | null | undefined;
  actorEntitySubType: string | null | undefined;
  actorEntityName: string | string[] | null | undefined;
  actorHostIps: Set<string>;
  actorsDocData: Set<string>;
  relationship: string;
  targetType: string | null;
  targetSubType: string | null;
  badge: number;
  targetIds: Set<string>;
  targetsDocData: Set<string>;
}

/**
 * Groups per-triple relationship rows by (actorEntityType, actorEntitySubType, relationship,
 * targetType, targetSubType) — NOT by raw actorId. Two actors of the same type sharing the
 * same relationship and target type produce one relationship node instead of two.
 *
 * Actor type/sub_type and name come directly off the row (the entity store IS the actor source).
 * All aggregation (badge, actorIdsCount, targetIdsCount, targetIds collection, host IPs) is
 * computed in TypeScript.
 *
 * Does NOT rebuild docData — raw ESQL JSON strings are passed through as-is. Use
 * enrichRelationshipDocData afterwards to apply entity-store enrichment to docData payloads.
 */
export const regroupRelationships = (
  records: RelationshipEsqlRow[],
  enrichmentMap: Map<string, EntityEnrichmentFields>
): RelationshipEdge[] => {
  const groups = new Map<string, RelationshipGroup>();

  for (const record of records) {
    const actorId = record.actorId;
    if (!actorId) continue;
    const targetId = record.targetId;
    if (!targetId) continue;

    const targetEnrichment = enrichmentMap.get(targetId);
    const targetType = targetEnrichment?.type ?? null;
    const targetSubType = targetEnrichment?.subType ?? null;

    const groupKey = JSON.stringify([
      record.actorEntityType ?? null,
      record.actorEntitySubType ?? null,
      record.relationship,
      targetType,
      targetSubType,
    ]);

    let group = groups.get(groupKey);
    if (!group) {
      group = {
        actorIds: new Set(),
        actorEntityType: record.actorEntityType,
        actorEntitySubType: record.actorEntitySubType,
        actorEntityName: record.actorEntityName,
        actorHostIps: new Set(
          castArray(record.actorHostIps ?? []).filter((v): v is string => v != null)
        ),
        actorsDocData: record.actorDocData ? new Set([record.actorDocData]) : new Set(),
        relationship: record.relationship,
        targetType,
        targetSubType,
        badge: 0,
        targetIds: new Set(),
        targetsDocData: new Set(),
      };
      groups.set(groupKey, group);
    }

    group.actorIds.add(actorId);
    group.badge += 1;
    group.targetIds.add(targetId);
    if (record.targetDocData) group.targetsDocData.add(record.targetDocData);
    if (record.actorDocData) group.actorsDocData.add(record.actorDocData);
    for (const ip of castArray(record.actorHostIps ?? []).filter((v): v is string => v != null)) {
      group.actorHostIps.add(ip);
    }
  }

  return Array.from(groups.values()).map((group): RelationshipEdge => {
    const actorIds = [...group.actorIds].sort((a, b) => a.localeCompare(b));
    // Single actor: use raw entity ID (preserves rel(entity.id-relationship) format).
    // Multiple actors: hash of sorted IDs — consistent with actorNodeId/targetNodeId
    // grouping pattern in fetch_events_graph.ts.
    const actorKey = actorIds.length === 1 ? actorIds[0] : hashIds(actorIds);
    const actorNodeId = actorKey;

    const targetIds = [...group.targetIds].sort((a, b) => a.localeCompare(b));
    const targetNodeId =
      targetIds.length === 0 ? '' : targetIds.length === 1 ? targetIds[0] : hashIds(targetIds);

    const targetNames = targetIds
      .map((id) => enrichmentMap.get(id)?.name)
      .filter((n): n is string => n != null);
    const targetHostIps = [
      ...new Set(targetIds.flatMap((id) => enrichmentMap.get(id)?.hostIps ?? [])),
    ];
    const actorHostIps = [...group.actorHostIps];

    // relationshipNodeId drives rel(...) node ID in parse_records.ts.
    // Single actor: "entity.id-relationship" (unchanged format, no test regression).
    // Merged actors: "<hashIds(actorIds)>-relationship".
    const relationshipNodeId = `${actorKey}-${group.relationship}`;

    return {
      badge: group.badge,
      actorNodeId,
      actorIdsCount: actorIds.length,
      actorEntityType: group.actorEntityType,
      actorEntitySubType: group.actorEntitySubType,
      actorEntityName: group.actorEntityName,
      actorHostIps: actorHostIps.length > 0 ? actorHostIps : undefined,
      actorsDocData: [...group.actorsDocData],
      targetNodeId,
      targetIdsCount: targetIds.length,
      targetEntityType: group.targetType,
      targetEntitySubType: group.targetSubType,
      targetEntityName:
        targetNames.length === 0 ? null : targetNames.length === 1 ? targetNames[0] : targetNames,
      targetHostIps: targetHostIps.length > 0 ? targetHostIps : undefined,
      targetsDocData: [...group.targetsDocData],
      relationship: group.relationship,
      relationshipNodeId,
      actorIds,
      targetIds,
    };
  });
};

/**
 * Rebuilds targetsDocData for each relationship using entity store enrichment.
 * actorsDocData is intentionally left unchanged: relationship actor docData is already
 * built inline in the ES|QL query with full entity metadata (the actor IS the
 * entity-store source row). Only target entities need TypeScript-side enrichment.
 */
export const enrichRelationshipDocData = (
  relationships: RelationshipEdge[],
  enrichmentMap: Map<string, EntityEnrichmentFields>
): RelationshipEdge[] => {
  return relationships.map((rel) => ({
    ...rel,
    targetsDocData: rebuildDocData(rel.targetsDocData, enrichmentMap),
  }));
};

/**
 * Applies enrichment to entity records from the entity store.
 */
export const enrichEntityRecords = (
  records: EntityRecord[],
  enrichmentMap: Map<string, EntityEnrichmentFields>
): EntityRecord[] => {
  return records.map((record) => {
    const enrichment = enrichmentMap.get(record.id);
    if (!enrichment) return record;
    return {
      ...record,
      name: enrichment.name ?? record.name,
      type: enrichment.type ?? record.type,
      sub_type: enrichment.subType ?? record.sub_type,
    };
  });
};
