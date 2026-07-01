/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LINKS_API_PATH } from '../../common/constants';

export const commonRouteConfig = {
  access: 'public',
  description:
    'This functionality is in technical preview and may be changed or removed in a future release. Elastic will work to fix any issues, but features in technical preview are not subject to the support SLA of official GA features.',
  options: {
    tags: ['oas-tag:Links'],
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

export const LINKS_ID_DESCRIPTION =
  'The unique ID of the links library item, as returned by the create or search endpoints.' as const;

export const LINKS_CREATE_DESCRIPTION =
  'Creates a new links library item and returns its ID, full state, and metadata.' as const;

export const LINKS_DELETE_DESCRIPTION = 'Permanently deletes a links library item by ID.' as const;

export const LINKS_READ_DESCRIPTION =
  'Returns the complete state of a links library item by ID.' as const;

export const LINKS_SEARCH_DESCRIPTION =
  `Returns a paginated list of links library items. Each result includes title, description, and metadata. ` +
  `Use \`GET ${LINKS_API_PATH}/{id}\` to retrieve the complete state.`;

export const LINKS_UPDATE_DESCRIPTION =
  `Replaces the full state of a links library item. Partial updates are not supported.
To make incremental changes, retrieve the item first, modify the fields you need, then send the complete object back.

If no item exists with the specified ID, a new one is created.` as const;
