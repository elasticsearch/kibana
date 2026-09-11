/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const DASHBOARD_GRID_COLUMN_COUNT = 48;
export const DEFAULT_PANEL_WIDTH = DASHBOARD_GRID_COLUMN_COUNT / 2;
export const DEFAULT_PANEL_HEIGHT = 15;
export const MAX_PANELS = 1000;

export const DEFAULT_DASHBOARD_OPTIONS = {
  auto_apply_filters: true,
  hide_panel_borders: false,
  hide_panel_titles: false,
  sync_colors: false,
  sync_cursor: true,
  sync_tooltips: false,
  use_margins: true,
} as const;
