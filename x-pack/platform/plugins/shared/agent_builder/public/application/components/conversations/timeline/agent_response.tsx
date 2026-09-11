/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import type {
  AssistantResponse,
  ConversationRound,
  ConversationRoundStep,
} from '@kbn/agent-builder-common';
import { RoundResponse } from '../conversation_rounds/round_response/round_response';
import { RoundEvents } from '../conversation_rounds/round_events/round_events';

interface AgentResponseProps {
  steps: ConversationRoundStep[];
  response: AssistantResponse;
  isLoading: boolean;
  isLastRound: boolean;
  /** The round shape the response actions still expect. Faked by callers until events are grouped. */
  rawRound: ConversationRound;
  /** Reasoning shown live while streaming, never a persisted step. */
  transientReasoning?: string;
}

/** The assistant's turn: shared presenter for both the finished run and the in-flight one. */
export const AgentResponse: React.FC<AgentResponseProps> = ({
  steps,
  response,
  isLoading,
  isLastRound,
  rawRound,
  transientReasoning,
}) => (
  <EuiFlexGroup direction="column" gutterSize="s">
    {steps.length > 0 && (
      <EuiFlexItem grow={false}>
        <RoundEvents steps={steps} />
      </EuiFlexItem>
    )}
    {transientReasoning && (
      <EuiFlexItem grow={false}>
        <EuiText color="subdued" size="s">
          <p>{transientReasoning}</p>
        </EuiText>
      </EuiFlexItem>
    )}
    <EuiFlexItem grow={false}>
      <RoundResponse
        response={response}
        steps={steps}
        isLoading={isLoading}
        hasError={false}
        isLastRound={isLastRound}
        rawRound={rawRound}
      />
    </EuiFlexItem>
  </EuiFlexGroup>
);
