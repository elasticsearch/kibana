/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { SignificantEventStatus } from '@kbn/significant-events-schema';
import type { EventClient } from '../../../lib/significant_events/events';

export async function updateEventStatusToolHandler({
  eventClient,
  eventId,
  status,
}: {
  eventClient: EventClient;
  eventId: string;
  status: SignificantEventStatus;
}): Promise<{
  event_id: string;
  updated: number;
  ignored: number;
  status: SignificantEventStatus;
}> {
  const { hits } = await eventClient.findById(eventId);
  const latest = hits[hits.length - 1];

  if (!latest || latest.status === status) {
    return { event_id: eventId, updated: 0, ignored: 1, status };
  }

  const nextEventId = uuidv4();
  const now = new Date().toISOString();
  const updatedEvent = {
    ...latest,
    '@timestamp': now,
    created_at: now,
    event_id: nextEventId,
    previous_event_id: latest.event_id,
    status,
  };

  await eventClient.bulkCreate([updatedEvent], { throwOnFail: true });

  return { event_id: nextEventId, updated: 1, ignored: 0, status };
}
