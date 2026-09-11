/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  type ExecutionFailedEvent,
  EventActorType,
  TimelineEventType,
} from '@kbn/agent-builder-common/chat/timeline_events';
import { AgentBuilderErrorCode } from '@kbn/agent-builder-common/base/errors';

export const createExecutionFailedEvent = (
  overrides?: Partial<ExecutionFailedEvent>
): ExecutionFailedEvent => ({
  id: 'event-3',
  type: TimelineEventType.executionFailed,
  created_at: '2026-09-03T11:17:42.123Z',
  actor: { type: EventActorType.agent, id: 'elastic-ai-agent' },
  execution_id: 'execution-1',
  trigger_event_id: 'event-1',
  data: {
    error: {
      code: AgentBuilderErrorCode.agentExecutionError,
      message: 'The agent encountered an unexpected error and could not complete the run.',
    },
  },
  ...overrides,
});
