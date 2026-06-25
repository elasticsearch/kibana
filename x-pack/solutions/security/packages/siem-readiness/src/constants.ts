/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MainCategories } from './types';

export const GET_SIEM_READINESS_CATEGORIES_API_PATH = '/api/siem_readiness/get_categories';
export const GET_SIEM_READINESS_RETENTION_API_PATH = '/api/siem_readiness/get_retention';
export const GET_SIEM_READINESS_PIPELINES_API_PATH = '/api/siem_readiness/get_pipelines';
export const GET_INDEX_RESULTS_LATEST_API_PATH =
  '/internal/ecs_data_quality_dashboard/results_latest';
export const CATEGORY_ORDER = ['Endpoint', 'Identity', 'Network', 'Cloud', 'Application/SaaS'];
export const ALL_CATEGORIES = CATEGORY_ORDER as MainCategories[];
export const GET_SIEM_READINESS_MITRE_DATA_INDICES_DOCS_COUNT_API_PATH =
  '/api/siem_readiness/mitre_data_indices_docs_count';
export const CRITICAL_FAILURE_RATE_THRESHOLD = 1; // 1%

/**
 * Per-category silence threshold in milliseconds.
 *
 * These are bootstrap defaults used when the 7-day baseline is insufficient
 * (stream younger than 7 days or baseline7dAvg === null). Once a stream has
 * ≥ 7 days of history the volume-based signal takes over and these thresholds
 * serve only as a backstop for truly silent streams.
 */
export const SILENCE_THRESHOLD_MS: Record<MainCategories, number> = {
  Endpoint: 30 * 60 * 1000, // 30m
  Identity: 30 * 60 * 1000, // 30m
  Network: 30 * 60 * 1000, // 30m
  Cloud: 60 * 60 * 1000, // 1h  (control plane / audit logs)
  'Application/SaaS': 24 * 60 * 60 * 1000, // 24h (batch SaaS sources)
};

/** Fallback threshold for uncategorized streams */
export const SILENCE_THRESHOLD_DEFAULT_MS = 30 * 60 * 1000; // 30m

/**
 * How long a stream must be active before the volume-drop signal is trusted.
 * During this bootstrap window silence thresholds above are the primary signal.
 */
export const SILENCE_BOOTSTRAP_DAYS = 7;

export const VOLUME_DROP_WARNING_PCT = 50; // >50% drop → WARNING
export const VOLUME_DROP_CRITICAL_PCT = 90; // >90% drop → CRITICAL
