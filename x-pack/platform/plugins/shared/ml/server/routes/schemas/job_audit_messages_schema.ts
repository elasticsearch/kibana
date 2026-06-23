/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

export const jobAuditMessagesJobIdSchema = schema.object({
  jobId: schema.maybe(schema.string({ maxLength: 10000, meta: { description: 'Job ID' } })),
});

export const jobAuditMessagesQuerySchema = schema.object({
  from: schema.maybe(schema.string({ maxLength: 10000 })),
  start: schema.maybe(schema.string({ maxLength: 10000 })),
  end: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const clearJobAuditMessagesBodySchema = schema.object({
  jobId: schema.string({ maxLength: 10000 }),
  notificationIndices: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
});
