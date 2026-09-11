/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UnifiedAttachmentTypeSetup } from '@kbn/cases-plugin/server';
import { SECURITY_ATTACK_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { AttackAttachmentPayloadSchema } from '../../../common/cases/attachments/attack';

/**
 * Server-side attack attachment type registration.
 * Uses a zod schema (shared with the client) to validate the full payload.
 */
export const getAttackAttachmentType = (): UnifiedAttachmentTypeSetup => ({
  id: SECURITY_ATTACK_ATTACHMENT_TYPE,
  schema: AttackAttachmentPayloadSchema,
});
