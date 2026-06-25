/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import type { EuiSelectableOption, EuiSwitchEvent } from '@elastic/eui';
import {
  EuiToolTip,
  EuiFormRow,
  EuiSelectable,
  EuiSpacer,
  EuiButton,
  EuiCallOut,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSwitch,
  EuiTextArea,
  EuiText,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import { useIsMounted } from '@kbn/securitysolution-hook-utils';
import { i18n } from '@kbn/i18n';
import { ActionCreatedBy } from './action_created_by';
import { FormattedDate } from '../../../../common/components/formatted_date';
import { FormattedError } from '../../formatted_error';
import { useToasts } from '../../../../common/lib/kibana';
import { useSendCancelRequest } from '../../../hooks/response_actions/use_send_cancel_request';
import { CONSOLE_COMMANDS } from '../../../common/translations';
import type { CancelActionRequestBody } from '../../../../../common/api/endpoint';
import { canUserCancelCommand } from '../../../../../common/endpoint/service/authz/cancel_authz_utils';
import { OUTPUT_MESSAGES, TABLE_COLUMN_NAMES, UX_MESSAGES } from '../translations';
import { useTestIdGenerator } from '../../../hooks/use_test_id_generator';
import type { ActionDetails } from '../../../../../common/endpoint/types';
import { useUserPrivileges } from '../../../../common/components/user_privileges';

interface ResponseActionPendingInfo {
  hasMultiplePendingAgents: boolean;
  pendingAgentIds: string[];
}

const getResponseActionPendingInfo = (action: ActionDetails): ResponseActionPendingInfo => {
  const pendingAgentIds = action.agents.filter(
    (agentId) => !action.agentState[agentId].isCompleted
  );

  return {
    hasMultiplePendingAgents: pendingAgentIds.length > 1,
    pendingAgentIds,
  };
};

export interface CancelActionModalProps {
  action: ActionDetails;
  onClose: () => void;
  'data-test-subj'?: string;
}

export const CancelActionModal = memo<CancelActionModalProps>(
  ({ action, onClose, 'data-test-subj': dataTestSubj }) => {
    const isMultiAgentAction = useMemo(() => {
      return getResponseActionPendingInfo(action).hasMultiplePendingAgents;
    }, [action]);

    const getTestId = useTestIdGenerator(dataTestSubj);
    const authz = useUserPrivileges().endpointPrivileges;
    const isMounted = useIsMounted();
    const toast = useToasts();
    const { error, isLoading, mutateAsync: sendCancelRequest } = useSendCancelRequest();

    const [cancelApiBody, setCancelApiBody] = useState<
      CancelActionRequestBody & { parameters: { force?: boolean } }
    >({
      endpoint_ids: !isMultiAgentAction ? getResponseActionPendingInfo(action).pendingAgentIds : [],
      agent_type: action.agentType,
      parameters: {
        id: action.id,
        ...(action.agentType === 'endpoint' ? { force: false } : {}),
      },
      comment: '',
    });

    const isReadyForSubmit: boolean = useMemo(() => {
      if (action.isCompleted || isLoading) {
        return false;
      }

      return Boolean(cancelApiBody.endpoint_ids.length > 0 && cancelApiBody.parameters.id);
    }, [
      action.isCompleted,
      cancelApiBody.endpoint_ids.length,
      cancelApiBody.parameters.id,
      isLoading,
    ]);

    const notPermittedMessage: React.ReactNode | undefined = useMemo(() => {
      let msg: string = '';

      if (action.isCompleted) {
        msg = UX_MESSAGES.cancelActionModalActionAlreadyComplete;
      } else if (!canUserCancelCommand(authz, action.command)) {
        msg = UX_MESSAGES.cancelActionNotPermittedTooltip;
      }

      if (msg) {
        return <EuiCallOut announceOnMount color="warning" title={msg} />;
      }
    }, [action.command, action.isCompleted, authz]);

    const agentSelector = useMemo(() => {
      if (!isMultiAgentAction) {
        return <></>;
      }

      const selectionOptions = action.agents.reduce<EuiSelectableOption[]>((acc, agentId) => {
        if (action.agentState[agentId].isCompleted) {
          return acc;
        }

        acc.push({
          label: action.hosts[agentId].name || agentId,
          key: agentId,
          checked: cancelApiBody.endpoint_ids.includes(agentId) ? 'on' : undefined,
        });

        return acc;
      }, []);

      return (
        <EuiFormRow
          fullWidth
          label={UX_MESSAGES.cancelActionModalHostSelectorLabel}
          labelAppend={UX_MESSAGES.cancelActionModalHostSelectorCounter(
            cancelApiBody.endpoint_ids.length,
            selectionOptions.length
          )}
        >
          <EuiSelectable
            aria-label={UX_MESSAGES.cancelActionModalAgentSelectorLabel}
            options={selectionOptions}
            listProps={{ bordered: true }}
            onChange={(newOptions) => {
              setCancelApiBody((prevState) => ({
                ...prevState,
                endpoint_ids: newOptions.reduce<string[]>((acc, option) => {
                  if (option.checked === 'on' && option.key) {
                    acc.push(option.key);
                  }

                  return acc;
                }, []),
              }));
            }}
          >
            {(list) => list}
          </EuiSelectable>
        </EuiFormRow>
      );
    }, [
      action.agentState,
      action.agents,
      action.hosts,
      cancelApiBody.endpoint_ids,
      isMultiAgentAction,
    ]);

    const setCommentHandler = useCallback<React.ChangeEventHandler<HTMLTextAreaElement>>((ev) => {
      setCancelApiBody((prevState) => ({ ...prevState, comment: ev.target.value }));
    }, []);

    const setForceFlag = useCallback((ev: EuiSwitchEvent) => {
      setCancelApiBody((prevState) => ({
        ...prevState,
        parameters: {
          ...prevState.parameters,
          force: ev.target.checked,
        },
      }));
    }, []);

    const submitCancelAction = useCallback(() => {
      sendCancelRequest(cancelApiBody).then(() => {
        if (isMounted()) {
          toast.addSuccess(
            i18n.translate('xpack.securitySolution.cancelActionModal.successSubmitToastMessage', {
              defaultMessage:
                'Cancel action request sent. (Note that depending on your table filters, this new action may not be visible)',
            })
          );
          onClose();
        }
      });
    }, [cancelApiBody, isMounted, onClose, sendCancelRequest, toast]);

    return (
      <EuiModal
        data-test-subj={getTestId('cancelActionModal')}
        onClose={onClose}
        aria-label={UX_MESSAGES.cancelActionModalTitle}
      >
        <EuiModalHeader>
          <EuiModalHeaderTitle title={UX_MESSAGES.cancelActionModalTitle}>
            {UX_MESSAGES.cancelActionModalTitle}
          </EuiModalHeaderTitle>
        </EuiModalHeader>

        <EuiModalBody>
          {notPermittedMessage || (
            <>
              <EuiFormRow fullWidth>
                <EuiFlexGroup>
                  <EuiFlexItem>
                    <EuiFlexGroup direction="column" justifyContent="spaceBetween" gutterSize="xs">
                      <EuiFlexItem>
                        <EuiText size="xs">
                          <strong>{TABLE_COLUMN_NAMES.command}</strong>
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size="s">
                          <EuiToolTip content={action.command} anchorClassName="eui-textTruncate">
                            <EuiText
                              size="s"
                              className="eui-textTruncate eui-fullWidth"
                              data-test-subj={getTestId('actionCommand')}
                              tabIndex={0}
                            >
                              {action.command}
                            </EuiText>
                          </EuiToolTip>
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiFlexGroup direction="column" justifyContent="spaceBetween" gutterSize="xs">
                      <EuiFlexItem>
                        <EuiText size="xs">
                          <strong>{TABLE_COLUMN_NAMES.time}</strong>
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size="s">
                          <FormattedDate
                            fieldName={TABLE_COLUMN_NAMES.time}
                            value={action.startedAt}
                            className="eui-textTruncate"
                          />
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiFlexGroup
                      direction="column"
                      justifyContent="spaceBetween"
                      gutterSize="none"
                    >
                      <EuiFlexItem>
                        <EuiText size="xs">
                          <strong>{TABLE_COLUMN_NAMES.user}</strong>
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size="s">
                          <ActionCreatedBy action={action} data-test-subj={getTestId('user')} />
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFormRow>

              {!isMultiAgentAction && (
                <>
                  <EuiSpacer size="xs" />
                  <EuiFlexGroup gutterSize="xs" direction="column">
                    <EuiFlexItem>
                      <EuiText size="xs">
                        <strong>{OUTPUT_MESSAGES.expandSection.hostname}</strong>
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem className="eui-textTruncate">
                      <EuiText size="s" className="eui-textTruncate">
                        {action.hosts[cancelApiBody.endpoint_ids[0]]?.name ||
                          cancelApiBody.endpoint_ids[0]}
                      </EuiText>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </>
              )}

              <EuiSpacer />

              {agentSelector}

              <EuiFormRow fullWidth label={UX_MESSAGES.cancelActionModalCommentLabel}>
                <EuiTextArea
                  placeholder={UX_MESSAGES.cancelActionModalCommentFieldPlaceholder}
                  aria-label={UX_MESSAGES.cancelActionModalCommentLabel}
                  value={cancelApiBody.comment}
                  onChange={setCommentHandler}
                  fullWidth
                  compressed
                  disabled={isLoading}
                />
              </EuiFormRow>

              {action.agentType === 'endpoint' && (
                <>
                  <EuiFormRow fullWidth>
                    <EuiSwitch
                      compressed
                      label={CONSOLE_COMMANDS.cancel.forceArgInfo}
                      checked={Boolean(cancelApiBody.parameters.force)}
                      onChange={setForceFlag}
                      disabled={isLoading}
                    />
                  </EuiFormRow>
                </>
              )}

              {error && !isLoading && (
                <>
                  <EuiSpacer />
                  <EuiCallOut announceOnMount color="danger">
                    <FormattedError error={error} />
                  </EuiCallOut>
                </>
              )}
            </>
          )}
        </EuiModalBody>

        <EuiModalFooter>
          <EuiButton
            isDisabled={!isReadyForSubmit}
            onClick={submitCancelAction}
            fill
            isLoading={isLoading}
          >
            {UX_MESSAGES.cancelActionModalSubmitButonLabel}
          </EuiButton>
        </EuiModalFooter>
      </EuiModal>
    );
  }
);
CancelActionModal.displayName = 'CancelActionModal';
