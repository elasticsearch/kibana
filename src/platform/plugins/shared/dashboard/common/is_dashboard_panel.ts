/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DashboardSection, DashboardPanel } from '@kbn/as-code-dashboard-schema';

/**
 * Type guard that checks if a widget is a {@link DashboardPanel}.
 *
 * @param widget - The widget to check, which can be either a {@link DashboardPanel} or {@link DashboardSection}.
 * @returns `true` if the widget is a {@link DashboardPanel}, `false` otherwise.
 */
export const isDashboardPanel = (
  widget: DashboardPanel | DashboardSection
): widget is DashboardPanel => {
  return 'config' in widget;
};
