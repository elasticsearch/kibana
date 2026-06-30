/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ESQLSearchResponse } from '@kbn/es-types';
import type { Condition } from '@kbn/streamlang';
import { entityStoreConditionToESQL as conditionToESQL } from '../../../common/esql/condition_to_esql';
import { HASH_ALG } from '../../../common/domain/euid';
import { recentData } from '../../../common/domain/definitions/esql';
import { esqlIsNotNullOrEmpty } from '../../../common/esql/strings';
import {
  type EntityDefinition,
  type EntityField,
  type EntityType,
} from '../../../common/domain/definitions/entity_schema';
import {
  getEuidEsqlEvaluation,
  getFieldEvaluationsEsqlFromDefinition,
} from '../../../common/domain/euid/esql';

import {
  buildExtractionSourceClause,
  buildLogPageProbeSourceClause,
  buildSetFieldsByCondition,
  buildSetFieldsByConditionAssignments,
  type PaginationParams,
  type PaginationFields,
  type LogSlicePaginationParams,
  ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD,
  ENGINE_METADATA_UNTYPED_ID_FIELD,
  ENGINE_METADATA_TYPE_FIELD,
  MAIN_ENTITY_ID_FIELD,
  ENTITY_NAME_FIELD,
  ENTITY_TYPE_FIELD,
  TIMESTAMP_FIELD,
  MAX_COLLECTED_VALUES_PER_FIELD,
  aggregationStats,
  fieldsToKeep,
  extractPaginationParams,
  buildPaginationSection,
  mapPostAggFilterFieldsToRecentForEsql,
  NULLIFY_UNMAPPED_FIELDS_SETTING,
} from './query_builder_commons';

export const HASHED_ID_FIELD = 'entity.hashedId';

export const MAIN_EXTRACTION_PAGINATION_FIELDS: PaginationFields = {
  timestampField: ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD,
  finalIdField: ENGINE_METADATA_UNTYPED_ID_FIELD,
  idFieldInQuery: recentData(ENGINE_METADATA_UNTYPED_ID_FIELD),
};

const FIELDS_TO_KEEP = [
  TIMESTAMP_FIELD,
  MAIN_ENTITY_ID_FIELD,
  ENTITY_NAME_FIELD,
  ENGINE_METADATA_UNTYPED_ID_FIELD,
  HASHED_ID_FIELD,
  ENGINE_METADATA_TYPE_FIELD,
  ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD,
];

interface LogsExtractionQueryParams {
  indexPatterns: string[];
  latestIndex: string;
  entityDefinition: EntityDefinition;
  docsLimit: number;
  fromDateISO: string;
  toDateISO: string;
  recoveryId?: string;
  pagination?: PaginationParams;
  logsPageCursorStart?: LogSlicePaginationParams;
  logsPageCursorEnd?: LogSlicePaginationParams;
}

export function buildRemainingLogsCountQuery(params: {
  indexPatterns: string[];
  type: EntityType;
  fromDateISO: string;
  toDateISO: string;
  logsPageCursorStart?: LogSlicePaginationParams;
}): string {
  return (
    `${NULLIFY_UNMAPPED_FIELDS_SETTING}\n` +
    buildLogPageProbeSourceClause(params) +
    `
  | STATS document_count = COUNT()`
  );
}

export function buildLogsExtractionEsqlQuery({
  indexPatterns,
  entityDefinition,
  fromDateISO,
  toDateISO,
  docsLimit,
  latestIndex,
  recoveryId,
  pagination,
  logsPageCursorStart,
  logsPageCursorEnd,
}: LogsExtractionQueryParams): string {
  const { fields, type, entityTypeFallback } = entityDefinition;

  const parts = [];

  parts.push(`${NULLIFY_UNMAPPED_FIELDS_SETTING}`);

  // FROM and WHERE
  parts.push(
    buildExtractionSourceClause({
      indexPatterns,
      type,
      fromDateISO,
      toDateISO,
      logsPageCursorStart,
      logsPageCursorEnd,
    })
  );

  // Single | EVAL stage: later assignments can reference columns from earlier ones.
  {
    const fieldEvalsEsql = getFieldEvaluationsEsqlFromDefinition(entityDefinition);
    const euidEsql = getEuidEsqlEvaluation(type, recentData(ENGINE_METADATA_UNTYPED_ID_FIELD), {
      withTypeId: false,
    });
    parts.push(`| EVAL ${fieldEvalsEsql ? `${fieldEvalsEsql},\n ${euidEsql}` : euidEsql}`);
  }

  if (entityDefinition.whenConditionTrueSetFieldsPreAgg?.length) {
    for (const entry of entityDefinition.whenConditionTrueSetFieldsPreAgg) {
      parts.push(buildSetFieldsByCondition(entry));
    }
  }

  // Main stats aggregation from incoming data
  parts.push(`| STATS
    ${ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD} = MIN(${TIMESTAMP_FIELD}),
    ${recentData('timestamp')} = MAX(${TIMESTAMP_FIELD}),
    ${aggregationStats(fields)}
    BY ${recentData(ENGINE_METADATA_UNTYPED_ID_FIELD)}`);

  // If there is no post aggregation filter we can paginate before the lookup join
  // and save some performance
  if (!entityDefinition.postAggFilter) {
    parts.push(
      ...buildPaginationSection(
        fromDateISO,
        docsLimit,
        MAIN_EXTRACTION_PAGINATION_FIELDS,
        pagination,
        recoveryId
      )
    );
  }

  // Builds the main entity id
  parts.push(
    `| EVAL ${recentData(MAIN_ENTITY_ID_FIELD)} = ${getMainEntityIdFromUntypedEsql(
      entityDefinition,
      recentData(ENGINE_METADATA_UNTYPED_ID_FIELD)
    )}`
  );

  // Lookup join to the latest index to perform data retention
  parts.push(`| LOOKUP JOIN ${latestIndex}
      ON ${recentData(MAIN_ENTITY_ID_FIELD)} == ${MAIN_ENTITY_ID_FIELD}`);

  if (entityDefinition.postAggFilter) {
    // If it has post aggregation filter, we filter it right after lookup join
    parts.push(
      buildPostAggFilter(
        mapPostAggFilterFieldsToRecentForEsql(entityDefinition.postAggFilter, entityDefinition)
      )
    );
    // then we can paginate after the post aggregation filter
    parts.push(
      ...buildPaginationSection(
        fromDateISO,
        docsLimit,
        MAIN_EXTRACTION_PAGINATION_FIELDS,
        pagination,
        recoveryId
      )
    );
  }

  if (entityDefinition.whenConditionTrueSetFieldsAfterStats?.length) {
    // Merge all post-STATS overrides into a single | EVAL stage.
    const postStatsAssignments = entityDefinition.whenConditionTrueSetFieldsAfterStats.map(
      (entry) =>
        buildSetFieldsByConditionAssignments(entry, {
          entityFields: fields,
          useRecentDataPrefix: true,
        })
    );
    parts.push(`| EVAL ${postStatsAssignments.join(',\n    ')}`);
  }

  // Perform the final merge of the fields between latest and recent data
  // and some custom field evaluations, like type and name fallback
  parts.push(`| EVAL ${mergedFieldStats(MAIN_ENTITY_ID_FIELD, fields)},
              ${customFieldEvalLogic(type, entityTypeFallback)}`);

  // Rename the fields to the final names
  parts.push(`| RENAME
    ${recentData(MAIN_ENTITY_ID_FIELD)} AS ${MAIN_ENTITY_ID_FIELD},
    ${recentData(ENGINE_METADATA_UNTYPED_ID_FIELD)} AS ${ENGINE_METADATA_UNTYPED_ID_FIELD}`);

  // keep recent data fields
  parts.push(`| KEEP ${fieldsToKeep(fields, FIELDS_TO_KEEP)}`);

  // join everything together
  return parts.join('\n');
}

export function extractMainPaginationParams(
  esqlResponse: ESQLSearchResponse,
  maxDocs: number
): PaginationParams | undefined {
  return extractPaginationParams(esqlResponse, maxDocs, MAIN_EXTRACTION_PAGINATION_FIELDS);
}

function mergedFieldStats(idFieldName: string, fields: EntityField[]): string {
  return fields
    .filter((field) => field.retention.operation !== 'managed')
    .map((field) => {
      const { retention, destination: dest } = field;
      const recentDest = recentData(dest);
      if (dest === idFieldName) {
        return null;
      }

      switch (retention.operation) {
        case 'collect_values':
          return `${dest} = MV_SLICE(MV_UNION(${recentDest}, ${dest}), 0, ${
            MAX_COLLECTED_VALUES_PER_FIELD - 1
          })`;
        case 'prefer_newest_value':
          return `${dest} = COALESCE(${recentDest}, ${dest})`;
        case 'prefer_oldest_value':
          return `${dest} = COALESCE(${dest}, ${recentDest})`;
        default:
          throw new Error('unknown field operation');
      }
    })
    .filter(Boolean)
    .join(',\n ');
}

function customFieldEvalLogic(type: EntityType, entityTypeFallback?: string): string {
  const evals = [
    `${TIMESTAMP_FIELD} = ${recentData('timestamp')}`,
    `${ENTITY_NAME_FIELD} = CASE(${esqlIsNotNullOrEmpty(
      ENTITY_NAME_FIELD
    )}, ${ENTITY_NAME_FIELD}, ${recentData(ENGINE_METADATA_UNTYPED_ID_FIELD)})`,
    `${ENGINE_METADATA_TYPE_FIELD} = "${type}"`,
    `${HASHED_ID_FIELD} = HASH("${HASH_ALG}", ${recentData(MAIN_ENTITY_ID_FIELD)})`,
  ];

  if (entityTypeFallback) {
    evals.push(`${ENTITY_TYPE_FIELD} = COALESCE(${ENTITY_TYPE_FIELD}, "${entityTypeFallback}")`);
  }

  return evals.join(',\n ');
}

function getMainEntityIdFromUntypedEsql(
  { identityField, type }: EntityDefinition,
  untypedIdExpression: string
): string {
  if (identityField.skipTypePrepend) {
    return untypedIdExpression;
  }
  return `CONCAT("${type}:", ${untypedIdExpression})`;
}

/** ESQL WHERE clause fragment after LOOKUP JOIN when entity definition has postAggFilter; otherwise empty. */
function buildPostAggFilter(postAggFilter: Condition): string {
  return `| WHERE ${conditionToESQL(postAggFilter)} `;
}
