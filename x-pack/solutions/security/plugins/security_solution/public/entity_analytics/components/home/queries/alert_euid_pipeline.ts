/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityStoreEuid } from '@kbn/entity-store/public';

const ENTITY_TYPES = ['user', 'host', 'service'] as const;

/**
 * Returns ES|QL pipeline stages that resolve entity.id for alert documents.
 *
 * Fast path: reads from `kibana.alert.entity.id`, stamped at enrichment time (#285223).
 * Fallback: derives EUID from identity fields for alerts that predate the stamp.
 *
 * MV_EXPAND is required because `kibana.alert.entity.id` is string[] — a multi-entity
 * alert becomes one row per entity so the LOOKUP JOIN key is always scalar. For alerts
 * where the field is null (pre-#285223), MV_EXPAND produces one row with null and
 * COALESCE falls through to the derived EUID.
 */
export const buildAlertEuidPipeline = (euid: EntityStoreEuid): string[] => {
  const parts: string[] = [];

  for (const entityType of ENTITY_TYPES) {
    const fieldEvals = euid.esql.getFieldEvaluations(entityType);
    if (fieldEvals) {
      parts.push(`| EVAL ${fieldEvals}`);
    }
    parts.push(`| EVAL ${euid.esql.getEuidEvaluation(entityType, `${entityType}_euid`)}`);
  }

  parts.push(`| EVAL derived_euid = COALESCE(${ENTITY_TYPES.map((t) => `${t}_euid`).join(', ')})`);
  parts.push('| MV_EXPAND `kibana.alert.entity.id`');
  parts.push('| EVAL entity.id = COALESCE(`kibana.alert.entity.id`, derived_euid)');
  parts.push('| WHERE entity.id IS NOT NULL');

  return parts;
};
