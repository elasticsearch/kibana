/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  type UserMessageEvent,
  EventActorType,
  TimelineEventType,
} from '@kbn/agent-builder-common/chat/timeline_events';

export const createUserMessageEvent = (
  overrides?: Partial<UserMessageEvent>
): UserMessageEvent => ({
  id: 'event-1',
  type: TimelineEventType.userMessage,
  created_at: '2025-01-01T00:00:00.000Z',
  actor: { type: EventActorType.user, id: 'user-1' },
  data: { message: 'How many active hosts do I have right now?' },
  ...overrides,
});
