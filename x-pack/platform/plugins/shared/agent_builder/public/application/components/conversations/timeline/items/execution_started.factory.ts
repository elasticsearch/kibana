/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  type ExecutionStartedEvent,
  EventActorType,
  TimelineEventType,
  TimelineTriggerType,
} from '@kbn/agent-builder-common/chat/timeline_events';

export const createExecutionStartedEvent = (
  overrides?: Partial<ExecutionStartedEvent>
): ExecutionStartedEvent => ({
  id: 'event-1',
  type: TimelineEventType.executionStarted,
  created_at: '2026-09-03T11:17:00.000Z',
  actor: { type: EventActorType.agent, id: 'elastic-ai-agent' },
  execution_id: 'execution-1',
  trigger_event_id: 'event-0',
  data: {
    trigger_type: TimelineTriggerType.userMessage,
  },
  ...overrides,
});
