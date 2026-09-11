/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { INTERNAL_RISK_SCORE_URL, PUBLIC_RISK_SCORE_URL } from '../risk_score/constants';
export const RISK_ENGINE_URL = `${INTERNAL_RISK_SCORE_URL}/engine` as const;
export const RISK_ENGINE_STATUS_URL = `${RISK_ENGINE_URL}/status` as const;
export const RISK_ENGINE_INIT_URL = `${RISK_ENGINE_URL}/init` as const;
export const RISK_ENGINE_ENABLE_URL = `${RISK_ENGINE_URL}/enable` as const;
export const RISK_ENGINE_DISABLE_URL = `${RISK_ENGINE_URL}/disable` as const;
export const RISK_ENGINE_PRIVILEGES_URL = `${RISK_ENGINE_URL}/privileges` as const;
export const RISK_ENGINE_SETTINGS_URL = `${RISK_ENGINE_URL}/settings` as const;

// Public Risk Score routes
export const PUBLIC_RISK_ENGINE_URL = `${PUBLIC_RISK_SCORE_URL}/engine` as const;
export const RISK_ENGINE_SCHEDULE_NOW_URL = `${PUBLIC_RISK_ENGINE_URL}/schedule_now` as const;
export const RISK_ENGINE_CLEANUP_URL = `${PUBLIC_RISK_ENGINE_URL}/dangerously_delete_data` as const;
export const RISK_ENGINE_CONFIGURE_SO_URL =
  `${PUBLIC_RISK_ENGINE_URL}/saved_object/configure` as const;

type ClusterPrivilege = 'manage_index_templates' | 'manage_transform' | 'manage_ingest_pipelines';
// These are the required privileges to install the risk engine - enabling and running require less privileges
// However, we check the full set for simplicity, since the UI does not distinguish between installing and enabling
export const TO_RUN_RISK_ENGINE_REQUIRED_ES_CLUSTER_PRIVILEGES = [
  'manage_transform',
] as ClusterPrivilege[];

export const TO_ENABLE_RISK_ENGINE_REQUIRED_ES_CLUSTER_PRIVILEGES = [
  'manage_index_templates',
  'manage_transform',
  'manage_ingest_pipelines',
] satisfies ClusterPrivilege[];

export const RISK_SCORE_INDEX_PATTERN = 'risk-score.risk-score-*';

export type RiskEngineIndexPrivilege = 'read' | 'write';

export const RISK_ENGINE_REQUIRED_ES_INDEX_PRIVILEGES = Object.freeze({
  [RISK_SCORE_INDEX_PATTERN]: ['read', 'write'] as RiskEngineIndexPrivilege[],
});
