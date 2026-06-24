/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { DASHBOARD_ATTACHMENT_TYPE, DASHBOARD_SO_TYPE } from '../../../../constants/attachments';
import { MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH } from '../../../../constants';
import { buildSavedObjectMetadataSchema, TimeRangeSchema } from '../saved_object/v2';

export const DashboardAttachmentMetadataSchema = buildSavedObjectMetadataSchema(DASHBOARD_SO_TYPE);

/**
 * Structural subset of the `DashboardAttachmentData` API shape from
 * `@kbn/agent-builder-dashboards-common`. Declared inline here (rather than
 * importing the upstream Zod schema as a value) so the public bundle doesn't
 * drag in the upstream package's converters and their transitive
 * `@kbn/lens-embeddable-utils` + `@kbn/lens-common` dependencies (~3.8 MB on
 * the eager `cases` page-load bundle).
 *
 * `.loose()` (passthrough) is used on purpose: the dashboard embed forwards
 * the whole blob to `attachmentDataToDashboardState`, which accepts any
 * fields the dashboard renderer understands. The listed fields below are the
 * minimum structural surface cases relies on / guards against drift, not an
 * exhaustive contract.
 *
 * The compile-time tripwire `DashboardConfigMatchesAttachmentData` lives in
 * `public/components/attachments/dashboard/dashboard_embed_attachment.tsx`
 * (where the upstream type is reachable) and fails typecheck if upstream
 * drops or renames any of the fields we forward here.
 */
export const DashboardConfigSchema = z
  .object({
    title: z.string().max(MAX_TITLE_LENGTH),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    panels: z.array(z.unknown()),
    query: z.record(z.string(), z.unknown()).optional(),
    time_range: z.record(z.string(), z.unknown()).optional(),
    refresh_interval: z.record(z.string(), z.unknown()).optional(),
    filters: z.array(z.unknown()).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
    pinned_panels: z.array(z.unknown()).optional(),
    access_control: z.record(z.string(), z.unknown()).optional(),
    project_routing: z.string().optional(),
  })
  .loose();

/**
 * `config` is required when `data` is present so the renderer can always embed
 * inline; `timeRange` is an optional override on top of the snapshot.
 */
export const DashboardAttachmentDataSchema = z
  .object({
    config: DashboardConfigSchema,
    timeRange: TimeRangeSchema.optional(),
  })
  .strict();

export const DashboardAttachmentPayloadSchema = z
  .object({
    type: z.literal(DASHBOARD_ATTACHMENT_TYPE),
    owner: z.string(),
    attachmentId: z.string(),
    metadata: DashboardAttachmentMetadataSchema,
    data: DashboardAttachmentDataSchema.optional(),
  })
  .strict();

export type DashboardConfig = z.infer<typeof DashboardConfigSchema>;
export type DashboardAttachmentData = z.infer<typeof DashboardAttachmentDataSchema>;
export type DashboardAttachmentMetadata = z.infer<typeof DashboardAttachmentMetadataSchema>;
export type DashboardAttachmentPayload = z.infer<typeof DashboardAttachmentPayloadSchema>;
