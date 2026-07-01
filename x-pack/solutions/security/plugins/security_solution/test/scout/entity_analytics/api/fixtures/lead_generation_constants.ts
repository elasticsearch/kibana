/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-security';

const LEADS_BASE = 'internal/entity_analytics/leads';

/**
 * Lead Generation API routes (no leading slash — apiClient convention).
 */
export const LEAD_GENERATION_ROUTES = {
  GET_LEADS: LEADS_BASE,
  GENERATE: `${LEADS_BASE}/generate`,
  STATUS: `${LEADS_BASE}/status`,
  DISMISS: (id: string) => `${LEADS_BASE}/${id}/_dismiss`,
  BULK_UPDATE: `${LEADS_BASE}/bulk_update`,
  ENABLE: `${LEADS_BASE}/enable`,
  DISABLE: `${LEADS_BASE}/disable`,
  PRIVILEGES: `${LEADS_BASE}/privileges`,
} as const;

/**
 * Required headers for internal (version 1) endpoints.
 */
export const INTERNAL_HEADERS = {
  'kbn-xsrf': 'some-xsrf-token',
  'x-elastic-internal-origin': 'Kibana',
  'Content-Type': 'application/json;charset=UTF-8',
  'elastic-api-version': '1',
} as const;

/**
 * Tags: stateful classic only — tests are LLM-free and focus on persistence plumbing.
 * No serverless security target because the `leadGenerationEnabled` experimental flag
 * requires the `evals_lead_generation` server config set (stateful classic only).
 */
export const LEAD_GENERATION_TAGS = [...tags.stateful.classic];
