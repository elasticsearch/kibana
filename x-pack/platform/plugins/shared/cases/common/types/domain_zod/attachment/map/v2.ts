/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { MAP_ATTACHMENT_TYPE, MAP_SO_TYPE } from '../../../../constants/attachments';
import { MAX_TITLE_LENGTH } from '../../../../constants';
import { buildSavedObjectMetadataSchema, TimeRangeSchema } from '../saved_object/v2';

export const MapAttachmentMetadataSchema = buildSavedObjectMetadataSchema(MAP_SO_TYPE);

/**
 * Structural subset of `MapAttributes` (the CM/REST format the maps content
 * client returns — parsed `layers`/`center`/`settings`). Declared as Zod here
 * (rather than importing `@kbn/maps-plugin/server` types) so this schema
 * stays usable from the `common/` layer and the public bundle. Field shapes
 * are intentionally loose — they're forwarded verbatim to the `<maps.Map />`
 * renderer, which is the authority on what it accepts.
 *
 * `.loose()` (passthrough) is used on purpose: the embeddable snapshot the
 * maps plugin produces at attach time includes runtime extras such as
 * `filters`, `query`, `refreshInterval`, `timeFilters`, and `openTOCDetails`
 * which the renderer needs but cases doesn't model explicitly. The listed
 * fields below are the ones cases relies on / guards against drift, not an
 * exhaustive contract.
 *
 * The compile-time tripwire `MapSnapshotMatchesMapAttributes` lives in
 * `public/components/attachments/map/map_embed_attachment.tsx` (where the
 * maps types are reachable) and fails typecheck if maps drops or renames any
 * of the fields we forward here.
 */
export const MapAttributesSnapshotSchema = z
  .object({
    title: z.string().max(MAX_TITLE_LENGTH).optional(),
    layers: z.array(z.unknown()).optional(),
    center: z.object({ lat: z.number(), lon: z.number() }).strict().optional(),
    zoom: z.number().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    isLayerTOCOpen: z.boolean().optional(),
  })
  .loose();

/**
 * `attributes` is required when `data` is present so the renderer can always
 * embed inline; `timeRange` is an optional override on top of the snapshot.
 */
export const MapAttachmentDataSchema = z
  .object({
    attributes: MapAttributesSnapshotSchema,
    timeRange: TimeRangeSchema.optional(),
  })
  .strict();

export const MapAttachmentPayloadSchema = z
  .object({
    type: z.literal(MAP_ATTACHMENT_TYPE),
    owner: z.string(),
    attachmentId: z.string(),
    metadata: MapAttachmentMetadataSchema,
    data: MapAttachmentDataSchema.optional(),
  })
  .strict();

export type MapAttributesSnapshot = z.infer<typeof MapAttributesSnapshotSchema>;
export type MapAttachmentMetadata = z.infer<typeof MapAttachmentMetadataSchema>;
export type MapAttachmentData = z.infer<typeof MapAttachmentDataSchema>;
export type MapAttachmentPayload = z.infer<typeof MapAttachmentPayloadSchema>;
