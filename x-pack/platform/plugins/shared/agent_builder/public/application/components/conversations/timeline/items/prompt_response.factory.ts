/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  type PromptResponseEvent,
  EventActorType,
  TimelineEventType,
} from '@kbn/agent-builder-common/chat/timeline_events';

export const createPromptResponseEvent = (
  overrides?: Partial<PromptResponseEvent>
): PromptResponseEvent => ({
  id: 'event-3',
  type: TimelineEventType.promptResponse,
  created_at: '2026-09-03T11:18:00.000Z',
  actor: { type: EventActorType.user, id: 'user-1', username: 'john.doe' },
  data: {
    prompt_requested_event_id: 'event-prompt-1',
    responses: {
      'prompt-1': { allow: true },
    },
  },
  ...overrides,
});
