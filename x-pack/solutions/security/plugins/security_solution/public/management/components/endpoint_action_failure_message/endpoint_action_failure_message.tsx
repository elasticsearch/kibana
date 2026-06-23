/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import { EuiSpacer } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { UX_MESSAGES } from '../endpoint_response_actions_list/translations';
import { getEmptyValue } from '../../../common/components/empty_value';
import { endpointActionResponseCodes } from '../endpoint_responder/lib/endpoint_action_response_codes';
import type { ActionDetails, MaybeImmutable } from '../../../../common/endpoint/types';
import { KeyValueDisplay } from '../key_value_display';
import { useTestIdGenerator } from '../../hooks/use_test_id_generator';

const emptyValue = getEmptyValue();

const ERROR_INFO_LABELS = Object.freeze<Record<string, string>>({
  errors: i18n.translate('xpack.securitySolution.endpointActionFailureMessage.errors', {
    defaultMessage: 'Errors',
  }),
  host: i18n.translate('xpack.securitySolution.endpointActionFailureMessage.host', {
    defaultMessage: 'Host',
  }),
});

interface EndpointActionFailureMessageProps {
  action: MaybeImmutable<ActionDetails>;
  /** If defined, then only errors for the given agent id will be returned */
  agentId?: string;
  'data-test-subj'?: string;
}

interface AgentErrorInfo {
  name: string;
  errors: string[];
  wasCanceled: boolean;
  cancelType: string; // Either `manual` or `action`
  cancelActionId: string; // value may be an empty string
}

// logic for determining agent host/errors info
const getAgentErrors = (action: MaybeImmutable<ActionDetails>, agentId?: string) => {
  const allAgentErrors: Array<AgentErrorInfo> = [];

  if (action.outputs || (action.errors && action.errors.length)) {
    const agentList = agentId ? [agentId] : action.agents;

    for (const agent of agentList) {
      const endpointAgentOutput = action.outputs?.[agent];
      const agentState = action.agentState[agent];
      const hasErrors = agentState && agentState.errors;
      const hasOutputCode: boolean =
        !!endpointAgentOutput &&
        endpointAgentOutput.type === 'json' &&
        !!endpointAgentOutput.content &&
        !!endpointAgentOutput.content.code;

      const agentErrorInfo: AgentErrorInfo = {
        name: '',
        errors: [],
        wasCanceled: agentState?.wasCanceled ?? action.wasCanceled,
        cancelType: endpointAgentOutput?.content?.canceled_by || '',
        cancelActionId: endpointAgentOutput?.content?.canceled_id || '',
      };

      if (
        hasOutputCode &&
        !!endpointAgentOutput &&
        !!endpointActionResponseCodes[endpointAgentOutput.content.code]
      ) {
        agentErrorInfo.errors.push(endpointActionResponseCodes[endpointAgentOutput.content.code]);
      }

      if (hasErrors) {
        const errorMessages: string[] = [...new Set(agentState.errors)];
        agentErrorInfo.errors.push(...errorMessages);
      }

      if (agentErrorInfo.errors.length) {
        agentErrorInfo.name =
          action.hosts[agent]?.name || `${agent} (${UX_MESSAGES.unenrolled.host})`;
      }

      if (agentErrorInfo.errors.length) {
        allAgentErrors.push(agentErrorInfo);
      }
    }
  }

  return allAgentErrors;
};

export const EndpointActionFailureMessage = memo<EndpointActionFailureMessageProps>(
  ({ action, agentId, 'data-test-subj': dataTestSubj }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);
    const allAgentErrors = useMemo(() => getAgentErrors(action, agentId), [action, agentId]);
    const errorCount = useMemo(
      () => allAgentErrors.map((agentErrorInfo) => agentErrorInfo.errors).flat().length,
      [allAgentErrors]
    );
    const isMultiAgentAction = Boolean(errorCount && !agentId && action.agents.length > 1);
    const isPendingOrSuccessful: boolean = useMemo(() => {
      const actionInfoState = agentId ? action.agentState[agentId] : action;
      return !actionInfoState.isCompleted || actionInfoState.wasSuccessful;
    }, [action, agentId]);

    if (isPendingOrSuccessful) {
      return null;
    }

    return (
      <div data-test-subj={getTestId('response-action-failure-info')}>
        <FormattedMessage
          id="xpack.securitySolution.endpointResponseActions.actionError.errorMessage"
          defaultMessage="The following { errorCount, plural, =1 {error was} other {errors were}} encountered:"
          values={{ errorCount }}
        />

        <EuiSpacer size="s" />

        <>
          {!errorCount ? (
            action.wasCanceled ? (
              <CanceledMessage
                cancelActionId=""
                cancelType="action"
                data-test-subj={getTestId('canceledMessage')}
              />
            ) : (
              <FormattedMessage
                id="xpack.securitySolution.endpointActionFailureMessage.unknownFailure"
                defaultMessage="An unknown error occurred"
              />
            )
          ) : isMultiAgentAction ? (
            allAgentErrors.map((agentErrorInfo) => (
              <div key={agentErrorInfo.name}>
                <KeyValueDisplay
                  name={ERROR_INFO_LABELS.host}
                  value={agentErrorInfo.name.length ? agentErrorInfo.name : emptyValue}
                />
                <KeyValueDisplay
                  name={ERROR_INFO_LABELS.errors}
                  value={
                    <>
                      {agentErrorInfo.wasCanceled && (
                        <CanceledMessage
                          cancelType={agentErrorInfo.cancelType || 'action'}
                          cancelActionId={agentErrorInfo.cancelActionId}
                          data-test-subj={getTestId('canceledMessage')}
                        />
                      )}
                      {agentErrorInfo.errors.join(' | ')}
                    </>
                  }
                />
                <EuiSpacer size="s" />
              </div>
            ))
          ) : (
            <>
              {allAgentErrors[0].wasCanceled && (
                <CanceledMessage
                  cancelType={allAgentErrors[0].cancelType || 'action'}
                  cancelActionId={allAgentErrors[0].cancelActionId}
                  data-test-subj={getTestId('canceledMessage')}
                />
              )}
              {allAgentErrors[0].errors.join(' | ')}
            </>
          )}
        </>
      </div>
    );
  }
);
EndpointActionFailureMessage.displayName = 'EndpointActionFailureMessage';

/** @private */
interface CanceledMessageProps {
  cancelType: string;
  cancelActionId: string; // Could be an empty string.
  'data-test-subj'?: string;
}

/** @private */
const CanceledMessage = memo<CanceledMessageProps>(
  ({ cancelType, cancelActionId, 'data-test-subj': dataTestSubj }) => {
    if (!cancelType && !cancelActionId) {
      return null;
    }

    return (
      <div data-test-subj={dataTestSubj}>
        <FormattedMessage
          id="xpack.securitySolution.endpointActionFailureMessage.canceledMessage"
          defaultMessage="Canceled {cancelType, select, manual {manually on the host} other {{hasCancelActionId, select, true {by action id: {cancelActionId}} other {}}}}"
          values={{ cancelType, hasCancelActionId: !!cancelActionId, cancelActionId }}
        />
      </div>
    );
  }
);
CanceledMessage.displayName = 'CanceledMessage';
