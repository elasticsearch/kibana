/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ConversationRound } from '@kbn/agent-builder-common';
import { ConversationRoundStatus } from '@kbn/agent-builder-common';
import { AgentResponse } from './agent_response';
import type { ActiveExecutionDraft } from '../../../../services/events/active_stream_state';

interface ActiveExecutionProps {
  activeExecution: ActiveExecutionDraft;
}

const toSyntheticRound = (activeExecution: ActiveExecutionDraft): ConversationRound => ({
  id: 'active',
  status: ConversationRoundStatus.inProgress,
  input: { message: '' },
  steps: activeExecution.steps,
  response: { message: activeExecution.message },
  started_at: new Date().toISOString(),
  time_to_first_token: activeExecution.timeToFirstToken ?? 0,
  time_to_last_token: 0,
  model_usage: {
    connector_id: '',
    llm_calls: 0,
    input_tokens: 0,
    output_tokens: 0,
    model: '',
  },
});

/** Adapts the in-flight run (no `execution_terminated` event yet) to the shared `AgentResponse` bubble. */
export const ActiveExecution: React.FC<ActiveExecutionProps> = ({ activeExecution }) => (
  <AgentResponse
    steps={activeExecution.steps}
    response={{ message: activeExecution.message }}
    isLoading
    isLastRound
    rawRound={toSyntheticRound(activeExecution)}
    transientReasoning={activeExecution.transientReasoning}
  />
);
