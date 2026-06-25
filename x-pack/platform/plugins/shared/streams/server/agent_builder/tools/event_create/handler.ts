/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { SigEvent, SigEventStatus } from '@kbn/streams-schema';
import type { EventClient } from '../../../lib/sig_events/events';

export interface EventCreateInput {
  status?: SigEventStatus;
  title: string;
  summary: string;
  root_cause: string;
  stream_names: string[];
  criticality: number;
  confidence: number;
  recommendations: string[];
}

export async function createEventToolHandler({
  eventClient,
  eventInput,
}: {
  eventClient: EventClient;
  eventInput: EventCreateInput;
}): Promise<{ event_id: string; acknowledged: true }> {
  const now = new Date().toISOString();
  const eventId = uuidv4();

  const event: SigEvent = {
    '@timestamp': now,
    created_at: now,
    event_id: eventId,
    discovery_slug: `agent-event-${eventId.slice(0, 8)}`,
    status: eventInput.status ?? 'promoted',
    stream_names: eventInput.stream_names,
    title: eventInput.title,
    summary: eventInput.summary,
    root_cause: eventInput.root_cause,
    criticality: eventInput.criticality,
    confidence: eventInput.confidence,
    recommendations: eventInput.recommendations,
  };

  await eventClient.bulkCreate([event], { throwOnFail: true });
  return { event_id: eventId, acknowledged: true };
}
