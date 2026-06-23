/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';

export const getNotificationsQuerySchema = schema.object({
  queryString: schema.maybe(
    schema.string({
      maxLength: 10000,
      meta: { description: 'Search string for the message content' },
    })
  ),
  sortField: schema.oneOf(
    [
      schema.literal('timestamp'),
      schema.literal('level'),
      schema.literal('job_type'),
      schema.literal('job_id'),
    ],
    {
      defaultValue: 'timestamp',
      meta: { description: 'Sort field' },
    }
  ),
  sortDirection: schema.oneOf([schema.literal('asc'), schema.literal('desc')], {
    defaultValue: 'desc',
    meta: { description: 'Sort direction' },
  }),
  earliest: schema.maybe(schema.string({ maxLength: 10000 })),
  latest: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const getNotificationsCountQuerySchema = schema.object({
  lastCheckedAt: schema.number(),
});

export type MessagesSearchParams = TypeOf<typeof getNotificationsQuerySchema>;

export type NotificationsCountParams = TypeOf<typeof getNotificationsCountQuerySchema>;
