/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SigEvent } from '@kbn/streams-schema';
import { FocusedSignificantEventService } from './focused_significant_event_service';

const createEvent = (discoverySlug: string): SigEvent => ({
  '@timestamp': '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  event_id: `event-${discoverySlug}`,
  discovery_slug: discoverySlug,
  stream_names: ['logs.payment'],
  title: `Event ${discoverySlug}`,
  summary: 'Summary',
  root_cause: 'Root cause',
  criticality: 90,
  confidence: 0.8,
  recommendations: [],
  status: 'promoted',
});

describe('FocusedSignificantEventService', () => {
  it('stores and clears the focused event', () => {
    const service = new FocusedSignificantEventService();
    const event = createEvent('payment-outage');

    service.setFocusedEvent(event);

    expect(service.getFocusedEvent()).toBe(event);

    service.clearFocusedEvent('payment-outage');

    expect(service.getFocusedEvent()).toBeUndefined();
  });

  it('does not clear a newer focused event with an older discovery slug', () => {
    const service = new FocusedSignificantEventService();
    const firstEvent = createEvent('first-event');
    const secondEvent = createEvent('second-event');

    service.setFocusedEvent(firstEvent);
    service.setFocusedEvent(secondEvent);
    service.clearFocusedEvent('first-event');

    expect(service.getFocusedEvent()).toBe(secondEvent);
  });
});
