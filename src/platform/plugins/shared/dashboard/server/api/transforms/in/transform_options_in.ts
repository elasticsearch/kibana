/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DashboardState } from '@kbn/as-code-dashboard-schema';

const APIToSavedObjectOptionsKeys = {
  hide_panel_titles: 'hidePanelTitles',
  hide_panel_borders: 'hidePanelBorders',
  use_margins: 'useMargins',
  sync_colors: 'syncColors',
  sync_tooltips: 'syncTooltips',
  sync_cursor: 'syncCursor',
  auto_apply_filters: 'autoApplyFilters',
} as const;

export function transformOptionsIn(options: Partial<DashboardState['options']>): string {
  const apiOptions = options ?? {};
  const savedObjectOptions: { [key: string]: unknown } = {};

  Object.keys(apiOptions).forEach((key) => {
    const apiKey = key as keyof typeof apiOptions;
    const soKey = APIToSavedObjectOptionsKeys[apiKey];
    if (soKey) savedObjectOptions[soKey] = apiOptions[apiKey];
  });
  return JSON.stringify(savedObjectOptions);
}
