/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type { DashboardCapabilities, DashboardLocatorParams } from './types';

export { DASHBOARD_API_PATH } from './constants';

export { getReferencesForPanelId, prefixReferencesFromPanel } from './reference_utils';

export { migrateLegacyQuery } from './migrate_legacy_query';
export { isDashboardSection } from './is_dashboard_section';
export { isDashboardPanel } from './is_dashboard_panel';
