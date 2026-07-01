/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

export const MONITOR_ATTACHMENT_TYPE = 'observability.synthetics.monitor' as const;

// Keep in sync with `ALLOWED_SCHEDULES_IN_MINUTES` in common/constants/monitor_defaults.ts.
export const ALLOWED_MONITOR_SCHEDULES_IN_MINUTES = [
  '1',
  '2',
  '3',
  '5',
  '10',
  '15',
  '20',
  '30',
  '60',
  '120',
  '240',
] as const;

export const monitorScheduleSchema = z.object({
  number: z.enum(ALLOWED_MONITOR_SCHEDULES_IN_MINUTES),
  unit: z.literal('m'),
});

export const monitorLocationSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  isServiceManaged: z.boolean().optional(),
});

export const monitorMetadataSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2048).optional(),
  tags: z.array(z.string().min(1).max(128)).max(20).optional(),
});

// `id` and `enabled` are optional so the same schema covers both lifecycles,
// distinguished by `attachment.origin`: drafts (unset) vs saved monitors (config_id).
export const monitorAttachmentDataSchema = z.object({
  id: z.string().optional(),
  type: z.literal('http'),
  metadata: monitorMetadataSchema,
  urls: z.string().url(),
  schedule: monitorScheduleSchema,
  locations: z.array(monitorLocationSchema).min(1),
  enabled: z.boolean().optional(),
});

export type MonitorAttachmentData = z.infer<typeof monitorAttachmentDataSchema>;
export type MonitorAttachmentSchedule = z.infer<typeof monitorScheduleSchema>;
export type MonitorAttachmentLocation = z.infer<typeof monitorLocationSchema>;
export type MonitorAttachmentMetadata = z.infer<typeof monitorMetadataSchema>;
