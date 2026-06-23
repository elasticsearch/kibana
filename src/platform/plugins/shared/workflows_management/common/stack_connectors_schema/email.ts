/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * This was generated based on x-pack/platform/plugins/shared/stack_connectors/server/connector_types/email/schema.ts
 * and will be deprecated once connectors will expose their schemas
 */

import { z } from '@kbn/zod/v4';

export const EmailAttachmentSchema = z.object({
  filename: z.string().max(255).describe('Attachment file name'),
  content: z
    .string()
    .max(3 * 1024 * 1024)
    .describe('Attachment body (plain text or base64 when encoding is set)'),
  contentType: z.string().max(255).optional().describe('MIME type, e.g. text/csv'),
  encoding: z.string().max(20).optional().describe('Optional encoding, e.g. base64'),
});

// Email connector parameter schema
export const EmailParamsSchema = z.object({
  to: z.array(z.string()),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string(),
  message: z.string(),
  messageHTML: z.string().optional(),
  attachments: z.array(EmailAttachmentSchema).optional(),
});

// Email connector response schema
export const EmailResponseSchema = z.object({
  messageId: z.string(),
  accepted: z.array(z.string()),
  rejected: z.array(z.string()),
  pending: z.array(z.string()),
  response: z.string(),
});
