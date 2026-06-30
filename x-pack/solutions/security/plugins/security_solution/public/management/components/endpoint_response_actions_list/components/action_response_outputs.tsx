/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable complexity */

import React, { memo, useMemo } from 'react';
import { EuiSpacer } from '@elastic/eui';
import { CancelActionResults } from '../../cancel_action_results';
import {
  isCancelAction,
  isExecuteAction,
  isGetFileAction,
  isMemoryDumpAction,
  isProcessesAction,
  isRunScriptAction,
  isUploadAction,
} from '../../../../../common/endpoint/service/response_actions/type_guards';
import { ResponseActionFileDownloadLink } from '../../response_action_file_download_link';
import { ExecuteActionHostResponse } from '../../endpoint_execute_action';
import { EndpointUploadActionResult } from '../../endpoint_upload_action_result';
import { RunningProcessesActionResults } from '../../running_processes_action_results';
import { RunscriptActionResult } from '../../runscript_action_result';
import { MemoryDumpResponseActionOutputResult } from '../../memory_dump_response_action_output_result';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP } from '../../../../../common/endpoint/service/response_actions/constants';
import type { ActionDetails, MaybeImmutable } from '../../../../../common/endpoint/types';
import { useTestIdGenerator } from '../../../hooks/use_test_id_generator';
import { OUTPUT_MESSAGES } from '../translations';
import { EndpointActionFailureMessage } from '../../endpoint_action_failure_message';

export interface ActionResponseOutputsProps {
  action: MaybeImmutable<ActionDetails>;
  'data-test-subj'?: string;
}

/**
 * Displays the response outputs for each of the agents that a response action was sent to
 */
export const ActionResponseOutputs = memo<ActionResponseOutputsProps>(
  ({ action, 'data-test-subj': dataTestSubj }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);

    const {
      canWriteFileOperations,
      canReadActionsLogManagement,
      canAccessEndpointActionsLogManagement,
    } = useUserPrivileges().endpointPrivileges;

    const hasMultipleAgents = useMemo(() => {
      return action.agents.length > 1;
    }, [action.agents.length]);

    const consoleCommandName = useMemo(() => {
      return RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP[action.command];
    }, [action.command]);

    return useMemo(() => {
      return (
        <div data-test-subj={getTestId()}>
          {action.agents.map((agentId) => {
            const { wasSuccessful, isCompleted, completedAt } = action.agentState[agentId] ?? {
              wasSuccessful: action.wasSuccessful,
              isCompleted: action.isCompleted,
              completedAt: action.completedAt,
            };
            const hostStatusMessage = !isCompleted
              ? OUTPUT_MESSAGES.isPending(consoleCommandName)
              : wasSuccessful
              ? OUTPUT_MESSAGES.wasSuccessful(consoleCommandName)
              : action.isExpired
              ? OUTPUT_MESSAGES.hasExpired(consoleCommandName)
              : OUTPUT_MESSAGES.hasFailed(consoleCommandName);
            const hostName = action.hosts[agentId]?.name ?? agentId;
            let hostOutput: React.ReactNode = null;

            if (isCompleted && wasSuccessful) {
              if (isGetFileAction(action)) {
                hostOutput = (
                  <ResponseActionFileDownloadLink
                    action={action}
                    agentId={agentId}
                    canAccessFileDownloadLink={canWriteFileOperations}
                    textSize="xs"
                    data-test-subj={getTestId('getFileDownloadLink')}
                  />
                );
              }

              if (isExecuteAction(action)) {
                hostOutput = (
                  <ExecuteActionHostResponse
                    action={action}
                    agentId={agentId}
                    canAccessFileDownloadLink={
                      canAccessEndpointActionsLogManagement || canReadActionsLogManagement
                    }
                    textSize="xs"
                    data-test-subj={getTestId('actionsLogTray')}
                  />
                );
              }

              if (isUploadAction(action)) {
                hostOutput = (
                  <EndpointUploadActionResult
                    action={action}
                    agentId={agentId}
                    data-test-subj={getTestId('uploadOutput')}
                    textSize="xs"
                  />
                );
              }

              if (isCancelAction(action)) {
                hostOutput = (
                  <CancelActionResults
                    action={action}
                    agentId={agentId}
                    data-test-subj={getTestId('cancelOutput')}
                    textSize="xs"
                  />
                );
              }
              if (isProcessesAction(action)) {
                hostOutput = (
                  <RunningProcessesActionResults
                    action={action}
                    agentId={agentId}
                    data-test-subj="processesOutput"
                    textSize="xs"
                  />
                );
              }

              if (isRunScriptAction(action)) {
                hostOutput = (
                  <RunscriptActionResult
                    action={action}
                    agentId={agentId}
                    data-test-subj={getTestId('actionsLogTray')}
                    textSize="xs"
                  />
                );
              }

              if (isMemoryDumpAction(action)) {
                hostOutput = (
                  <MemoryDumpResponseActionOutputResult
                    action={action}
                    agentId={agentId}
                    textSize="xs"
                    data-test-subj={getTestId('memoryDumpOutput')}
                  />
                );
              }

              // CrowdStrike Isolate/Release actions (runscript has its own output via RunscriptActionResult)
              if (action.agentType === 'crowdstrike' && !isRunScriptAction(action)) {
                hostOutput = <>{OUTPUT_MESSAGES.submittedSuccessfully(consoleCommandName)}</>;
              }
            }

            return (
              <div key={agentId} data-test-subj={getTestId(`${agentId}-output`)}>
                {hasMultipleAgents && (
                  <strong>
                    {hostName}
                    {': '}
                  </strong>
                )}
                {hostStatusMessage}

                {isCompleted && (
                  <div>
                    {hasMultipleAgents && (
                      <div>
                        {OUTPUT_MESSAGES.expandSection.completedAt} {completedAt}
                      </div>
                    )}
                    {wasSuccessful ? (
                      hostOutput
                    ) : (
                      <EndpointActionFailureMessage
                        action={action}
                        agentId={agentId}
                        data-test-subj={getTestId(`${agentId}-outputFailureMessage`)}
                      />
                    )}
                  </div>
                )}
                {hasMultipleAgents && <EuiSpacer size="l" />}
              </div>
            );
          })}
        </div>
      );
    }, [
      action,
      canAccessEndpointActionsLogManagement,
      canReadActionsLogManagement,
      canWriteFileOperations,
      consoleCommandName,
      getTestId,
      hasMultipleAgents,
    ]);
  }
);
ActionResponseOutputs.displayName = 'ActionResponseOutputs';
