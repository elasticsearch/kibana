/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { notificationIdSchema } from '../../common/notification_schema';
import type { NotificationUnreadStatus } from '../../common/types';
import { getNotificationDataStreamClient } from '../storage/notification_data_stream';
import type { NotificationQueryDeps } from './query_notifications';
import { isReadAt, type NotificationReadState } from './read_state';

const unreadStatusSourceSchema = z.object({
  notification_id: notificationIdSchema,
  '@timestamp': z.iso.datetime(),
});

/**
 * Whether the caller has anything unread, for the bell badge dot.
 *
 * To show a number instead of a dot, pick a display cap, request `cap + overrideCount + 1` groups,
 * and count the unread ones instead of returning on the first. Reporting `min(count, cap)` plus a
 * `capped` flag lets the badge render "10+" without ever paying to count past the cap.
 */
export const queryUnreadStatus = async (
  { dataStreams, logger }: NotificationQueryDeps,
  readState: NotificationReadState
): Promise<NotificationUnreadStatus> => {
  const { overrides, readAllBefore } = readState;
  const client = await getNotificationDataStreamClient(dataStreams);
  const response = await client.search({
    // Encodes the read-state invariant that nothing at or before the marker can be unread, which
    // `isReadAt` still enforces per hit. An override can only postdate the marker, never precede
    // it. Pruning here is what makes polling cheap: `can_match` skips whole backing indices.
    query: { bool: { filter: [{ range: { '@timestamp': { gt: readAllBefore } } }] } },
    _source: ['notification_id', '@timestamp'],
    collapse: { field: 'notification_id' },
    sort: [{ '@timestamp': 'desc' }, { notification_id: 'asc' }],
    // Every collapsed group is a distinct id, so at most `overrideCount` of the newest groups can
    // turn out to be read. One more than that is enough to surface an unread group if one exists,
    // and is a single document in the steady state, since `_mark_all_read` clears the overrides.
    size: Object.keys(overrides).length + 1,
    track_total_hits: false,
  });

  for (const hit of response.hits.hits) {
    const parsed = unreadStatusSourceSchema.safeParse(hit._source);
    if (!parsed.success) {
      // The range filter already placed this hit past the read horizon, and without a
      // `notification_id` there is no override to check it against. A badge that wrongly shows a
      // dot costs the user one click; one that hides unread notifications is never noticed.
      logger.debug(`Treating malformed notification doc ${hit._id ?? 'unknown'} as unread.`);
      return { hasUnread: true };
    }
    const { notification_id: id, '@timestamp': timestamp } = parsed.data;
    if (!isReadAt(readState, id, timestamp)) {
      return { hasUnread: true };
    }
  }

  return { hasUnread: false };
};
