/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import type { EuiTextProps } from '@elastic/eui';
import { EuiText } from '@elastic/eui';
import type {
  ActionDetails,
  ActionResponseOutput,
  MaybeImmutable,
  ResponseActionCancelOutputContent,
} from '../../../../common/endpoint/types';
import { useTestIdGenerator } from '../../hooks/use_test_id_generator';
import { RESPONSE_ACTION_STATUS } from '../../common/translations';
import { EndpointActionFailureMessage } from '../endpoint_action_failure_message';
import { endpointActionResponseCodes } from '../endpoint_responder/lib/endpoint_action_response_codes';

export interface CancelActionResultsProps {
  action: MaybeImmutable<ActionDetails>;
  /**
   * The agent ID (from the list of agents the response action was sent to) to show results for.
   * Defaults to the first one on the list
   */
  agentId?: string;
  textSize?: EuiTextProps['size'];
  'data-test-subj'?: string;
}

export const CancelActionResults = memo<CancelActionResultsProps>(
  ({ action, agentId: _agentId, textSize = 's', 'data-test-subj': dataTestSubj }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);

    return useMemo(() => {
      const agentId = _agentId || action.agents[0];
      const agentActionState = action.agentState[agentId];
      const agentActionResult =
        action.outputs?.[agentId] ??
        ({
          wasSuccessful: action.wasSuccessful,
          isCompleted: action.isCompleted,
          completedAt: action.completedAt,
          content: { code: '' } as ResponseActionCancelOutputContent,
        } as unknown as ActionResponseOutput<ResponseActionCancelOutputContent>);

      if (!action.agents.includes(agentId)) {
        window.console.error(
          `CancelActionResults component called with agentId [${agentId}] not in action.agents`
        );
        return <div data-test-subj={getTestId()} />;
      }

      let result: React.ReactNode;

      if (!agentActionState.isCompleted) {
        result = (
          <span data-test-subj={getTestId('pending')}>{RESPONSE_ACTION_STATUS.pendingMessage}</span>
        );
      } else if (!agentActionState.wasSuccessful) {
        result = (
          <EndpointActionFailureMessage
            action={action}
            agentId={agentId}
            data-test-subj={getTestId('failure')}
          />
        );
      } else {
        const actionOutputCode = agentActionResult?.content?.code;

        result = (
          <span data-test-subj={getTestId('success')}>
            {(actionOutputCode && endpointActionResponseCodes[actionOutputCode]) ||
              RESPONSE_ACTION_STATUS.successMessage}
          </span>
        );
      }

      return (
        <EuiText data-test-subj={getTestId()} size={textSize}>
          {result}
        </EuiText>
      );
    }, [_agentId, action, getTestId, textSize]);
  }
);
CancelActionResults.displayName = 'CancelActionResults';
