/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Builds an ES|QL query that counts entities that crossed into High or Critical
 * risk since yesterday, using the risk score time-series history index.
 *
 * The risk score index uses type-specific field names (host.risk.calculated_level,
 * user.risk.calculated_level, service.risk.calculated_level). We COALESCE across
 * all three types and map levels to numbers so MAX() sorts correctly — MAX on the
 * raw keyword sorts lexicographically (Unknown > Medium > Low > High > Critical).
 *
 * An entity qualifies when:
 *   - today_level_num >= 3  (today is High or Critical)
 *   - yday_level_num < 3 OR yday_level_num IS NULL  (was not H/C yesterday)
 */
export const buildNewlyHighCriticalCountQuery = (
  spaceId: string,
  entitiesIndexName: string
): string => {
  const index = `risk-score.risk-score-${spaceId}`;
  return [
    `SET unmapped_fields="nullify";`,
    `FROM ${index}`,
    `| WHERE @timestamp >= NOW() - 48h`,
    `| EVAL entity_name = COALESCE(host.name, user.name, service.name)`,
    `| EVAL risk_level = COALESCE(host.risk.calculated_level, user.risk.calculated_level, service.risk.calculated_level)`,
    `| WHERE entity_name IS NOT NULL`,
    `| EVAL bucket = CASE(@timestamp >= NOW() - 24h, "today", "yday")`,
    `| EVAL level_num = CASE(risk_level == "Critical", 4, risk_level == "High", 3, risk_level == "Medium", 2, risk_level == "Low", 1, 0)`,
    `| STATS today_level_num = MAX(CASE(bucket == "today", level_num, null)), yday_level_num = MAX(CASE(bucket == "yday", level_num, null)) BY entity_name`,
    `| WHERE today_level_num >= 3 AND (yday_level_num IS NULL OR yday_level_num < 3)`,
    `| EVAL entity.id = entity_name`,
    `| LOOKUP JOIN ${entitiesIndexName} ON entity.id`,
    `| EVAL effective_id = COALESCE(\`entity.relationships.resolution.resolved_to\`, entity.id)`,
    `| STATS value = COUNT_DISTINCT(effective_id), entity_ids = VALUES(effective_id)`,
  ].join('\n');
};
