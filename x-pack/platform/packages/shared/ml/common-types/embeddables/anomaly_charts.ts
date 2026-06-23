/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Do not change constant values - part of public REST APIs
export const ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE = 'ml_anomaly_charts' as const;

export type AnomalyExplorerChartsEmbeddableType = typeof ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE;
