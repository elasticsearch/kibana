/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const VEGA_API_PATH = '/api/vega';

/** Used in response body `id` fields (create, read, update). */
export const VEGA_LIBRARY_ITEM_ID_DESCRIPTION =
  'The unique ID of the Vega library item, as returned by the create or search endpoints.';

/** Used in request params `id` fields (read, update, delete). */
export const VEGA_LIBRARY_ITEM_PARAMS_ID_DESCRIPTION =
  'The Vega library item ID, as returned by the create or search endpoints.';

export const PUBLIC_API_VERSION = '2023-10-31';

export const commonRouteConfig = {
  access: 'public',
  description:
    'This functionality is in technical preview and may be changed or removed in a future release. Elastic will work to fix any issues, but features in technical preview are not subject to the support SLA of official GA features.',
  options: {
    tags: ['oas-tag:Vega'],
    availability: {
      stability: 'experimental',
      since: '9.6.0',
    },
    // Remove when the VEGA_API_ENABLED_FLAG feature flag is removed.
    excludeFromOAS: true,
  },
  security: {
    authz: {
      enabled: false,
      reason: 'Relies on Saved Objects Client for authorization',
    },
  },
} as const;
