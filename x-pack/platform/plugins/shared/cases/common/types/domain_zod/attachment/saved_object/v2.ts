/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import {
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  DISCOVER_SESSION_SO_TYPE,
} from '../../../../constants/attachments';
import { MAX_TITLE_LENGTH } from '../../../../constants';

export interface SavedObjectReferenceMetadata {
  title: string;
  soType: string;
}

export const TimeRangeSchema = z.object({ from: z.string(), to: z.string() }).strict();

export const buildSavedObjectMetadataSchema = <SoType extends string>(soType: SoType) =>
  z
    .object({
      title: z.string().max(MAX_TITLE_LENGTH),
      soType: z.literal(soType),
    })
    .strict();

/**
 * Reference-typed payload schemas for general saved-object attachments. Each
 * payload carries the SO id in `attachmentId`, plus title and `soType` in
 * metadata.
 */
export const buildSavedObjectPayloadSchema = <AttachmentType extends string, SoType extends string>(
  attachmentType: AttachmentType,
  soType: SoType
) =>
  z
    .object({
      type: z.literal(attachmentType),
      owner: z.string(),
      attachmentId: z.string(),
      metadata: buildSavedObjectMetadataSchema(soType),
    })
    .strict();

export const DiscoverSessionAttachmentPayloadSchema = buildSavedObjectPayloadSchema(
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  DISCOVER_SESSION_SO_TYPE
);
export type DiscoverSessionAttachmentPayload = z.infer<
  typeof DiscoverSessionAttachmentPayloadSchema
>;
