/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod';
import type { getControlsGroupSchema } from '@kbn/controls-schemas';
import type { getDashboardDataSchema, getPanelSchema } from './schemas/dashboard_data';
import type { optionsSchema, panelGridSchema, getSectionSchema } from './schemas';

/** Input type for the Dashboard API request body (before parsing). Panels are loosely typed since they depend on registered embeddable schemas. */
export type DashboardApiDataInput = z.input<ReturnType<typeof getDashboardDataSchema>>;

/** Display options for a dashboard. */
export type DashboardOptions = z.output<typeof optionsSchema>;
/** Display options for a dashboard (input shape — fields with defaults are optional). */
export type DashboardOptionsInput = z.input<typeof optionsSchema>;
/** Grid position and size data for a panel. */
export type GridData = z.output<typeof panelGridSchema>;
/** Grid position and size data for a panel (input shape — fields with defaults are optional). */
export type GridDataInput = z.input<typeof panelGridSchema>;
/** A panel in a dashboard containing an embeddable visualization. */
export type DashboardPanel = z.output<ReturnType<typeof getPanelSchema>>;
/** A section in a dashboard that groups panels. */
export type DashboardSection = Omit<z.output<ReturnType<typeof getSectionSchema>>, 'panels'> & {
  panels: DashboardPanel[];
};
/** The complete state of a dashboard including panels, filters, and settings. */
export type DashboardState = z.output<ReturnType<typeof getDashboardDataSchema>>;
/** The complete state of a dashboard (input shape — fields with defaults are optional). */
export type DashboardStateInput = z.input<ReturnType<typeof getDashboardDataSchema>>;

export type DashboardPinnedPanelsState = z.output<ReturnType<typeof getControlsGroupSchema>>;
/** The input shape of pinned panels state (fields with defaults are optional). */
export type DashboardPinnedPanelsStateInput = z.input<ReturnType<typeof getControlsGroupSchema>>;
export type DashboardPinnedPanel = DashboardPinnedPanelsState[number];
export type DashboardPinnedPanelInput = NonNullable<DashboardPinnedPanelsStateInput>[number];
