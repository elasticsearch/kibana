/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { SECURITY_ENTITY_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { EntityType } from '@kbn/entity-store/common';

const EntityAttachmentMetadataSchema = z
  .object({
    /** Human-readable entity name, used as the link label in the attachment view. */
    entityName: z.string().max(256),
    /** The kind of entity (user, host, service, generic). */
    entityType: EntityType,
    /** Optional risk score (0-100) captured at attach time. */
    riskScore: z.number().optional(),
    /** Optional risk level (e.g. Low, Moderate, High, Critical) captured at attach time. */
    riskLevel: z.string().max(50).optional(),
  })
  .strict();

export const EntityAttachmentPayloadSchema = z
  .object({
    type: z.literal(SECURITY_ENTITY_ATTACHMENT_TYPE),
    owner: z.string().max(100),
    /**
     * The canonical entity id (EUID) from the entity store, e.g.
     * `user:alice@host@namespace`. Stored verbatim so the attachment view can
     * resolve the entity with a single `terms` query on `entity.id` instead of
     * OR-ing a raw identity value across every candidate ECS field.
     */
    attachmentId: z.string().max(1000),
    metadata: EntityAttachmentMetadataSchema,
  })
  .strict();

export type EntityAttachmentPayload = z.infer<typeof EntityAttachmentPayloadSchema>;
export type EntityAttachmentMetadata = z.infer<typeof EntityAttachmentMetadataSchema>;
