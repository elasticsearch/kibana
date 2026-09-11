/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  type ExecutionTerminatedEvent,
  EventActorType,
  TimelineEventType,
} from '@kbn/agent-builder-common/chat/timeline_events';

export const createExecutionTerminatedEvent = (
  overrides?: Partial<ExecutionTerminatedEvent>
): ExecutionTerminatedEvent => ({
  id: 'event-2',
  type: TimelineEventType.executionTerminated,
  created_at: '2026-09-03T11:17:39.852Z',
  actor: { type: EventActorType.agent, id: 'elastic-ai-agent' },
  execution_id: 'execution-1',
  trigger_event_id: 'event-1',
  data: {
    steps: [],
    model_usage: {
      connector_id: '.anthropic-claude-4.6-sonnet-chat_completion',
      llm_calls: 1,
      input_tokens: 100,
      output_tokens: 10,
      model: 'anthropic-claude-4.6-sonnet',
    },
    time_to_first_token: 500,
    time_to_last_token: 600,
    outcome: {
      type: 'responded',
      response: { message: 'Here is a summary of your active hosts.' },
    },
  },
  ...overrides,
});
