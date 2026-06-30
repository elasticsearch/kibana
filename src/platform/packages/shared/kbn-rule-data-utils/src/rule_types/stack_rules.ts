/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const STACK_ALERTS_FEATURE_ID = 'stackAlerts';
export const STACK_ALERTS_ONLY_FEATURE_ID = 'stackAlertsOnly';
export const ES_QUERY_ID = '.es-query';
export const ML_ANOMALY_DETECTION_RULE_TYPE_ID = 'xpack.ml.anomaly_detection_alert';

export const DEGRADED_DOCS_RULE_TYPE_ID = 'datasetQuality.degradedDocs';

/**
 * These rule types are not the only stack rules. There are more.
 * The variable holds all stack rule types that support multiple
 * consumers aka the "Role visibility" UX dropdown.
 */
export const STACK_RULE_TYPE_IDS_SUPPORTED_BY_OBSERVABILITY = [
  ES_QUERY_ID,
  ML_ANOMALY_DETECTION_RULE_TYPE_ID,
  DEGRADED_DOCS_RULE_TYPE_ID,
];
