/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const HIGH_CRITICAL_SCORE_THRESHOLD = 70;

export const buildHcCountQueryBody = (watchlistId?: string): string =>
  `| WHERE entity.EngineMetadata.Type IN ("user", "host", "service")
  AND entity.risk.calculated_score_norm >= ${HIGH_CRITICAL_SCORE_THRESHOLD}${
    watchlistId ? ` AND MV_CONTAINS(entity.attributes.watchlists, "${watchlistId}")` : ''
  }
| STATS count = COUNT(*)`;
