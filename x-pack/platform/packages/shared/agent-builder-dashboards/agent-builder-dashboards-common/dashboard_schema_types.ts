/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

// ============================================================================
// Panel Grid Schema - ideally we should import the schema from dashboard schemas, but they use config-schema library
// which is not compatible with Zod, so we duplicate the relevant parts here for validation of attachment data.
// ============================================================================

/**
 * Grid dimensions (in dashboard grid units) for layout.
 * Dashboard grid is 48 columns wide; height is in same units.
 */
export const panelGridSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().int().min(1).max(48),
  h: z.number().int().min(1),
});

// ============================================================================
// Panel Schema
// ============================================================================

/**
 * Zod schema for dashboard panel entries.
 * The `type` field contains the actual embeddable type.
 */
const attachmentPanelSchema = z.object({
  type: z.string(),
  id: z.string(),
  config: z.record(z.string(), z.unknown()),
  grid: panelGridSchema,
});

export type AttachmentPanel = z.infer<typeof attachmentPanelSchema>;

// ============================================================================
// Section Schema
// ============================================================================

export const sectionGridSchema = z.object({
  y: z.number().int().min(0).describe('Section position in outer dashboard grid coordinates.'),
});

const dashboardSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  collapsed: z.boolean(),
  grid: sectionGridSchema,
  panels: z.array(attachmentPanelSchema),
});

export type DashboardSection = z.infer<typeof dashboardSectionSchema>;

export const isSection = (
  widget: AttachmentPanel | DashboardSection
): widget is DashboardSection => {
  return 'panels' in widget;
};

// ============================================================================
// Query Schema
// ============================================================================

const querySchema = z.object({
  expression: z.union([z.string(), z.record(z.string(), z.unknown())]),
  language: z.string(),
});

// ============================================================================
// Time Range Schema
// ============================================================================

export const timeRangeSchema = z.object({
  from: z
    .string()
    .max(100)
    .describe(
      'Start of the time range. Use Kibana date math for relative ranges (e.g. "now-30m", "now-24h", "now-90d") or ISO 8601 strings for absolute dates (e.g. "2024-05-20T00:00:00.000Z").'
    ),
  to: z
    .string()
    .max(100)
    .describe(
      'End of the time range. Use "now" for the current time, or an ISO 8601 string for an absolute end date (e.g. "2024-05-24T23:59:59.999Z").'
    ),
  mode: z
    .union([z.literal('absolute'), z.literal('relative')])
    .optional()
    .describe(
      'Optional mode hint. Use "relative" when from/to use date math expressions, "absolute" when using exact ISO 8601 timestamps.'
    ),
});

// ============================================================================
// Refresh Interval Schema
// ============================================================================

const refreshIntervalSchema = z.object({
  pause: z.boolean(),
  value: z.number(),
});

// ============================================================================
// Dashboard Options Schema
// ============================================================================

const optionsSchema = z.object({
  auto_apply_filters: z.boolean().optional(),
  hide_panel_titles: z.boolean().optional(),
  hide_panel_borders: z.boolean().optional(),
  use_margins: z.boolean().optional(),
  sync_colors: z.boolean().optional(),
  sync_tooltips: z.boolean().optional(),
  sync_cursor: z.boolean().optional(),
});

// ============================================================================
// Access Control Schema
// ============================================================================

const accessControlSchema = z
  .object({
    access_mode: z.union([z.literal('write_restricted'), z.literal('default')]).optional(),
  })
  .optional();

// ============================================================================
// Filter Schema
// ============================================================================

// Filters have complex union types that are difficult to express precisely in Zod.
const filterSchema = z.record(z.string(), z.unknown());

// ============================================================================
// Pinned Panels (Controls) Schema
// ============================================================================

// Controls have complex union types. We use a permissive schema here.
const pinnedControlSchema = z.record(z.string(), z.unknown());
const pinnedPanelsSchema = z.array(pinnedControlSchema);

// ============================================================================
// Dashboard Attachment Data Schema (matches DashboardState)
// ============================================================================

/**
 * Zod schema for dashboard attachment data.
 * This schema matches the structure of DashboardState from @kbn/dashboard-plugin.
 */
export const dashboardAttachmentDataSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  panels: z.array(z.union([attachmentPanelSchema, dashboardSectionSchema])),
  query: querySchema.optional(),
  time_range: timeRangeSchema.optional(),
  refresh_interval: refreshIntervalSchema.optional(),
  filters: z.array(filterSchema).optional(),
  options: optionsSchema.optional(),
  tags: z.array(z.string()).optional(),
  pinned_panels: pinnedPanelsSchema.optional(),
  access_control: accessControlSchema.optional(),
  project_routing: z.string().optional(),
});

export type DashboardAttachmentData = z.infer<typeof dashboardAttachmentDataSchema>;
