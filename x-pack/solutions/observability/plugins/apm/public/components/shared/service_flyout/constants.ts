/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const SERVICE_FLYOUT_SOURCES = {
  serviceMap: 'service_map',
  dashboardEmbeddable: 'dashboard_embeddable',
  alertDetails: 'alert_details',
} as const;

export type ServiceFlyoutSource =
  (typeof SERVICE_FLYOUT_SOURCES)[keyof typeof SERVICE_FLYOUT_SOURCES];
