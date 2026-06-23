/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const DASHBOARD_OPERATION_FAILURE_TYPES = {
  addSection: 'add_section',
  addPanels: 'add_panels',
  editPanels: 'edit_panels',
  updatePanelLayouts: 'update_panel_layouts',
} as const;

export type DashboardOperationFailureType =
  (typeof DASHBOARD_OPERATION_FAILURE_TYPES)[keyof typeof DASHBOARD_OPERATION_FAILURE_TYPES];
