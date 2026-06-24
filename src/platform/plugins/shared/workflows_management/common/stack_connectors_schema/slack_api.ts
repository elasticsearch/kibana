/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * This was generated based on x-pack/platform/plugins/shared/stack_connectors/server/connector_types/slack_api/schema.ts
 * and will be deprecated once connectors will expose their schemas
 */

import { z } from '@kbn/zod/v4';

// Slack API connector response schema
export const SlackApiResponseSchema = z.object({
  ok: z.boolean(),
  channel: z.string().optional(),
  ts: z.string().optional(),
  message: z
    .object({
      text: z.string(),
      user: z.string(),
      ts: z.string(),
      type: z.string(),
    })
    .optional(),
  channels: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        is_channel: z.boolean(),
        is_archived: z.boolean(),
      })
    )
    .optional(),
  members: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        real_name: z.string().optional(),
      })
    )
    .optional(),
  error: z.string().optional(),
});
