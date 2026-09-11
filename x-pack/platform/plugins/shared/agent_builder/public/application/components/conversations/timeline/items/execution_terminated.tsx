/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ExecutionTerminatedEvent } from '@kbn/agent-builder-common/chat/timeline_events';
import type { ConversationRound } from '@kbn/agent-builder-common';
import { ConversationRoundStatus } from '@kbn/agent-builder-common';
import { AgentResponse } from '../agent_response';

interface ExecutionTerminatedProps {
  event: ExecutionTerminatedEvent;
}

const toSyntheticRound = (
  event: ExecutionTerminatedEvent,
  steps: ConversationRound['steps']
): ConversationRound => ({
  id: event.execution_id ?? event.id,
  status: ConversationRoundStatus.completed,
  // input is not available in this event; stub required field
  input: { message: '' },
  steps,
  response: { message: '' },
  started_at: event.created_at,
  time_to_first_token: event.data.time_to_first_token,
  time_to_last_token: event.data.time_to_last_token,
  model_usage: event.data.model_usage,
  trace_id: event.data.trace_id,
});

/** Adapts a finished run (`execution_terminated`) to the shared `AgentResponse` bubble. */
export const ExecutionTerminated: React.FC<ExecutionTerminatedProps> = ({ event }) => {
  const { outcome } = event.data;
  // `steps` is typed as an array but can be absent on server-derived events for a stepless round.
  const steps = event.data.steps ?? [];

  if (outcome.type !== 'responded') {
    return null;
  }

  return (
    <AgentResponse
      steps={steps}
      response={outcome.response}
      isLoading={false}
      isLastRound={false}
      rawRound={toSyntheticRound(event, steps)}
    />
  );
};
