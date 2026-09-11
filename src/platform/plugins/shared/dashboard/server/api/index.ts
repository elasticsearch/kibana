/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { registerRoutes } from './register_routes';

export type { DashboardCreateResponseBody } from './create';
export type { DashboardSanitizeResponseBody } from './sanitize';
export type { DashboardReadResponseBody } from './read';
export type { DashboardSearchRequestParams, DashboardSearchResponseBody } from './search';
export type { DashboardUpdateResponseBody } from './update';

export { create } from './create/create';
export { read } from './read/read';
export { update } from './update/update';
export { deleteDashboard } from './delete/delete';
export { sanitize } from './sanitize/sanitize';
