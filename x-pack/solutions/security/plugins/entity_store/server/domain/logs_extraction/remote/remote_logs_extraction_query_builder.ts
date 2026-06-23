/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ESQLSearchResponse } from '@kbn/es-types';
import type { EntityDefinition } from '../../../../common/domain/definitions/entity_schema';
import {
  getEuidEsqlEvaluation,
  getFieldEvaluationsEsqlFromDefinition,
} from '../../../../common/domain/euid/esql';
import type { PaginationFields } from '../query_builder_commons';
import {
  buildExtractionSourceClause,
  buildSetFieldsByCondition,
  buildSetFieldsByConditionAssignments,
  type PaginationParams,
  type LogSlicePaginationParams,
  ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD,
  MAIN_ENTITY_ID_FIELD,
  NULLIFY_UNMAPPED_FIELDS_SETTING,
  TIMESTAMP_FIELD,
  aggregationStats,
  fieldsToKeep,
  extractPaginationParams,
  buildPaginationSection,
} from '../query_builder_commons';

const REMOTE_FIELDS_TO_KEEP = [
  TIMESTAMP_FIELD,
  MAIN_ENTITY_ID_FIELD,
  ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD,
];

export const REMOTE_PAGINATION_FIELDS: PaginationFields = {
  timestampField: ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD,
  finalIdField: MAIN_ENTITY_ID_FIELD,
  idFieldInQuery: MAIN_ENTITY_ID_FIELD,
};

export interface RemoteLogsExtractionQueryParams {
  indexPatterns: string[];
  entityDefinition: EntityDefinition;
  fromDateISO: string;
  toDateISO: string;
  docsLimit: number;
  recoveryId?: string;
  pagination?: PaginationParams;
  logsPageCursorStart?: LogSlicePaginationParams;
  logsPageCursorEnd?: LogSlicePaginationParams;
}

/**
 * Builds ESQL for remote extraction: same aggregation as main but no LOOKUP JOIN.
 * Writes partial entities to updates with @timestamp = nowISO so the next run intakes them.
 */
export function buildRemoteLogsExtractionEsqlQuery({
  indexPatterns,
  entityDefinition,
  fromDateISO,
  toDateISO,
  docsLimit,
  recoveryId,
  pagination,
  logsPageCursorStart,
  logsPageCursorEnd,
}: RemoteLogsExtractionQueryParams): string {
  const { fields, type } = entityDefinition;

  const parts = [];

  // Because we don't have updates on remote clusters, we need to nullify the unmapped fields
  parts.push(NULLIFY_UNMAPPED_FIELDS_SETTING);

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
    const euidEsql = getEuidEsqlEvaluation(type, MAIN_ENTITY_ID_FIELD);
    parts.push(`| EVAL ${fieldEvalsEsql ? `${fieldEvalsEsql},\n ${euidEsql}` : euidEsql}`);
  }

  if (entityDefinition.whenConditionTrueSetFieldsPreAgg?.length) {
    for (const entry of entityDefinition.whenConditionTrueSetFieldsPreAgg) {
      parts.push(buildSetFieldsByCondition(entry));
    }
  }

  // Main stats aggregation from incoming data
  parts.push(`| STATS
    ${TIMESTAMP_FIELD} = MAX(${TIMESTAMP_FIELD}),
    ${ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD} = MIN(${TIMESTAMP_FIELD}),
    ${aggregationStats(fields, false)}
    BY ${MAIN_ENTITY_ID_FIELD}`);

  if (entityDefinition.whenConditionTrueSetFieldsAfterStats?.length) {
    // Merge all post-STATS overrides into a single | EVAL stage.
    const postStatsAssignments = entityDefinition.whenConditionTrueSetFieldsAfterStats.map(
      (entry) =>
        buildSetFieldsByConditionAssignments(entry, {
          entityFields: fields,
          useRecentDataPrefix: false,
        })
    );
    parts.push(`| EVAL ${postStatsAssignments.join(',\n    ')}`);
  }

  // Keep fields
  parts.push(`| KEEP ${fieldsToKeep(fields, REMOTE_FIELDS_TO_KEEP)}`);

  // Paginate
  parts.push(
    ...buildPaginationSection(
      fromDateISO,
      docsLimit,
      REMOTE_PAGINATION_FIELDS,
      pagination,
      recoveryId
    )
  );

  return parts.join('\n');
}

export function extractRemotePaginationParams(
  esqlResponse: ESQLSearchResponse,
  maxDocs: number
): PaginationParams | undefined {
  return extractPaginationParams(esqlResponse, maxDocs, REMOTE_PAGINATION_FIELDS);
}
