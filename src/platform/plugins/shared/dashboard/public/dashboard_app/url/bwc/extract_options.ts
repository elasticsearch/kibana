/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Writable } from '@kbn/utility-types';
import type { DashboardOptions } from '@kbn/as-code-dashboard-schema';

export function extractOptions(state: {
  [key: string]: unknown;
}): Partial<Writable<DashboardOptions>> {
  if (typeof state.options === 'object') {
    return state.options as Partial<Writable<DashboardOptions>>;
  }

  // <9.3 Options state spread directly into DashboardState
  const options: Partial<Writable<DashboardOptions>> = {};

  if (typeof state.hidePanelTitles === 'boolean') {
    options.hide_panel_titles = state.hidePanelTitles;
  }

  if (typeof state.useMargins === 'boolean') {
    options.use_margins = state.useMargins;
  }

  if (typeof state.syncColors === 'boolean') {
    options.sync_colors = state.syncColors;
  }

  if (typeof state.syncTooltips === 'boolean') {
    options.sync_tooltips = state.syncTooltips;
  }

  if (typeof state.syncCursor === 'boolean') {
    options.sync_cursor = state.syncCursor;
  }

  return options;
}
