/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import {
  monitorAttachmentDataSchema,
  monitorLocationSchema,
  monitorMetadataSchema,
  monitorScheduleSchema,
  type MonitorAttachmentData,
} from '../../../../common/agent_builder/attachments/monitor_attachment_schema';

export const setMetadataOperationSchema = monitorMetadataSchema
  .partial()
  .extend({ operation: z.literal('set_metadata') });

export const setUrlOperationSchema = z.object({
  operation: z.literal('set_url'),
  urls: z.string().url(),
});

export const setScheduleOperationSchema = monitorScheduleSchema.extend({
  operation: z.literal('set_schedule'),
});

export const setLocationsOperationSchema = z.object({
  operation: z.literal('set_locations'),
  locations: z.array(monitorLocationSchema).min(1),
});

export const validateOperationSchema = z.object({
  operation: z.literal('validate'),
});

export const monitorOperationSchema = z.discriminatedUnion('operation', [
  setMetadataOperationSchema,
  setUrlOperationSchema,
  setScheduleOperationSchema,
  setLocationsOperationSchema,
  validateOperationSchema,
]);

export type MonitorOperation = z.infer<typeof monitorOperationSchema>;

// Distinguished from generic errors so the caller can log at debug instead of warn.
export class MonitorOperationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MonitorOperationValidationError';
  }
}

export interface MonitorOperationsResult {
  data: Partial<MonitorAttachmentData>;
}

export const executeMonitorOperations = (
  data: Partial<MonitorAttachmentData>,
  operations: MonitorOperation[],
  { isNew = false }: { isNew?: boolean } = {}
): MonitorOperationsResult => {
  let next: Partial<MonitorAttachmentData> = { ...data };

  if (isNew && next.type === undefined) {
    next.type = 'http';
  }

  for (const op of operations) {
    switch (op.operation) {
      case 'set_metadata': {
        const mergedName = op.name ?? next.metadata?.name ?? '';
        next = {
          ...next,
          metadata: {
            ...next.metadata,
            name: mergedName,
            ...(op.description !== undefined ? { description: op.description } : {}),
            ...(op.tags !== undefined ? { tags: op.tags } : {}),
          },
        };
        break;
      }

      case 'set_url':
        next = { ...next, urls: op.urls };
        break;

      case 'set_schedule':
        next = { ...next, schedule: { number: op.number, unit: op.unit } };
        break;

      case 'set_locations':
        next = { ...next, locations: op.locations };
        break;

      case 'validate': {
        const result = monitorAttachmentDataSchema.safeParse(next);
        if (!result.success) {
          const issues = result.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('\n');
          throw new MonitorOperationValidationError(
            `Synthetics monitor is not ready to save:\n${issues}`
          );
        }
        break;
      }
    }
  }

  if (isNew && !next.metadata?.name) {
    throw new MonitorOperationValidationError(
      'A monitor name is required when creating a new monitor. Use a set_metadata operation with a name.'
    );
  }

  return { data: next };
};
