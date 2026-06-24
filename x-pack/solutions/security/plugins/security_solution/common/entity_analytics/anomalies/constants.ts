/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const ENTITY_ANOMALY_DEFAULT_LOOKBACK_DAYS = 30;

export const ENTITY_ANOMALY_DEFAULT_LOOKBACK = `${ENTITY_ANOMALY_DEFAULT_LOOKBACK_DAYS}d` as const;

export const ENTITY_ANOMALY_SUMMARY_INTERNAL_URL =
  '/internal/entity_analytics/entities/{entity_type}/{entity_id}/anomaly_summary';

export const ENTITY_ANOMALY_OVERVIEW_INTERNAL_URL =
  '/internal/entity_analytics/entities/{entity_type}/{entity_id}/anomaly_overview';
