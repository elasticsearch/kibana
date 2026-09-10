/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityStoreEuid } from '@kbn/entity-store/public';
import { buildAlertEuidPipeline } from './alert_euid_pipeline';

const alertsIndex = (spaceId: string) => `.alerts-security.alerts-${spaceId}`;

/**
 * Builds a single ES|QL query that counts distinct H/C-risk entities with at
 * least one alert in the last 24h, using a LOOKUP JOIN from alerts → entity-latest.
 *
 * Entity resolution uses kibana.alert.entity.id (stamped at enrichment time, #285223)
 * when present, falling back to derived EUID for older alerts. See alert_euid_pipeline.ts.
 * Multi-entity alerts produce one row per entity after MV_EXPAND, so both entities
 * are counted (more accurate than the previous single-entity-per-alert approach).
 */
export const buildEntitiesWithAlertsCountQuery = (
  euid: EntityStoreEuid,
  entitiesIndexName: string,
  spaceId: string
): string => {
  const parts: string[] = [];

  parts.push(`SET unmapped_fields="nullify";`);
  parts.push(`FROM ${alertsIndex(spaceId)}`);
  parts.push(`| WHERE @timestamp >= NOW() - 24h`);
  parts.push(...buildAlertEuidPipeline(euid));

  // RENAME @timestamp to avoid it being overwritten by entity-latest's own @timestamp
  // during the LOOKUP JOIN.
  parts.push(`| RENAME @timestamp AS event_timestamp`);
  parts.push(`| LOOKUP JOIN ${entitiesIndexName} ON entity.id`);
  parts.push(`| RENAME event_timestamp AS @timestamp`);

  parts.push(`| WHERE entity.risk.calculated_level IN ("High", "Critical")`);
  parts.push(
    `| EVAL effective_id = COALESCE(\`entity.relationships.resolution.resolved_to\`, entity.id)`
  );
  parts.push(`| STATS value = COUNT_DISTINCT(effective_id), entity_ids = VALUES(effective_id)`);

  return parts.join('\n');
};
