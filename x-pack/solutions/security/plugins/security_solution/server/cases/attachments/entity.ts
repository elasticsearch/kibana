/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UnifiedAttachmentTypeSetup } from '@kbn/cases-plugin/server';
import { SECURITY_ENTITY_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { EntityAttachmentPayloadSchema } from '../../../common/cases/attachments/entity';

/**
 * Server-side entity attachment type registration.
 * Uses a zod schema (shared with the client) to validate the full payload.
 */
export const getEntityAttachmentType = (): UnifiedAttachmentTypeSetup => ({
  id: SECURITY_ENTITY_ATTACHMENT_TYPE,
  schema: EntityAttachmentPayloadSchema,
});
