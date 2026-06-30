/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const PUBLIC_API_VERSION = '2023-10-31';

export const commonRouteConfig = {
  access: 'public',
  description:
    'This functionality is in technical preview and may be changed or removed in a future release. Elastic will work to fix any issues, but features in technical preview are not subject to the support SLA of official GA features.',
  options: {
    tags: ['oas-tag:Markdowns'],
    availability: {
      stability: 'experimental',
      since: '9.5.0',
    },
  },
  security: {
    authz: {
      enabled: false,
      reason: 'Relies on Saved Objects Client for authorization',
    },
  },
} as const;
