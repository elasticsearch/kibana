/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityStoreEuid } from '@kbn/entity-store/public';

const ML_ANOMALIES_INDEX = '.ml-anomalies-shared*';
const ENTITY_TYPES = ['user', 'host', 'service'] as const;

/**
 * Builds a single ES|QL query that counts distinct entities with at least one
 * ML anomaly record in the last 24h, using a LOOKUP JOIN from anomalies →
 * entity-latest on the typed EUID (entity.id). Mirrors the anomalies panel pattern.
 */
export const buildEntitiesWithAnomaliesCountQuery = (
  euid: EntityStoreEuid,
  entitiesIndexName: string
): string => {
  const parts: string[] = [];

  parts.push(`SET unmapped_fields="nullify";`);
  parts.push(`FROM ${ML_ANOMALIES_INDEX}`);
  parts.push(
    `| WHERE result_type == "record" AND is_interim == false AND record_score >= 1 AND @timestamp >= NOW() - 24h`
  );

  for (const entityType of ENTITY_TYPES) {
    const fieldEvals = euid.esql.getFieldEvaluations(entityType);
    if (fieldEvals) {
      parts.push(`| EVAL ${fieldEvals}`);
    }
    parts.push(`| EVAL ${euid.esql.getEuidEvaluation(entityType, `${entityType}_euid`)}`);
  }

  parts.push(`| EVAL entity.id = COALESCE(${ENTITY_TYPES.map((t) => `${t}_euid`).join(', ')})`);
  parts.push(`| WHERE entity.id IS NOT NULL`);

  parts.push(`| RENAME @timestamp AS event_timestamp`);
  parts.push(`| LOOKUP JOIN ${entitiesIndexName} ON entity.id`);
  parts.push(`| RENAME event_timestamp AS @timestamp`);

  parts.push(`| WHERE entity.name IS NOT NULL`);
  parts.push(
    `| EVAL effective_id = COALESCE(\`entity.relationships.resolution.resolved_to\`, entity.id)`
  );
  parts.push(`| STATS value = COUNT_DISTINCT(effective_id), entity_ids = VALUES(effective_id)`);

  return parts.join('\n');
};
