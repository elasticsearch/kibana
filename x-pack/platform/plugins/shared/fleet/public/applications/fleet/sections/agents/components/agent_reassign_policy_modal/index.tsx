/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiConfirmModal,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiComboBox,
  EuiFormRow,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';

import type { Agent } from '../../../../types';
import {
  sendPostAgentReassign,
  sendPostBulkAgentReassign,
  useStartServices,
  useGetAgentPolicies,
} from '../../../../hooks';
import { AgentPolicyPackageBadges } from '../../../../components';
import { SO_SEARCH_LIMIT } from '../../../../constants';

interface Props {
  onClose: () => void;
  agents: Agent[] | string;
}

export const AgentReassignAgentPolicyModal: React.FunctionComponent<Props> = ({
  onClose,
  agents,
}) => {
  const modalTitleId = useGeneratedHtmlId();

  const { notifications } = useStartServices();
  const isSingleAgent = Array.isArray(agents) && agents.length === 1;

  const agentPoliciesRequest = useGetAgentPolicies({
    page: 1,
    perPage: SO_SEARCH_LIMIT,
  });

  const agentPolicies = useMemo(
    () =>
      agentPoliciesRequest.data
        ? agentPoliciesRequest.data.items.filter((policy) => policy && !policy.is_managed)
        : [],
    [agentPoliciesRequest.data]
  );

  const [selectedAgentPolicyId, setSelectedAgentPolicyId] = useState<string | undefined>(
    isSingleAgent ? (agents[0] as Agent).policy_id : undefined
  );

  const hasInitialized = useRef(!!selectedAgentPolicyId);

  // Select the first policy if no policy is selected on initial load. Not after though, as it will overwrite the selected policy. This is now handled in the onChange
  useEffect(() => {
    if (!hasInitialized.current && !selectedAgentPolicyId && agentPolicies.length) {
      setSelectedAgentPolicyId(agentPolicies[0]?.id);
      hasInitialized.current = true;
    }
  }, [agentPolicies, selectedAgentPolicyId]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasInvalidPolicySearch, setHasInvalidPolicySearch] = useState(false);
  async function onSubmit() {
    try {
      setIsSubmitting(true);
      if (!selectedAgentPolicyId) {
        throw new Error('No selected agent policy id');
      }
      const res = isSingleAgent
        ? await sendPostAgentReassign((agents[0] as Agent).id, {
            policy_id: selectedAgentPolicyId,
          })
        : await sendPostBulkAgentReassign({
            policy_id: selectedAgentPolicyId,
            agents: Array.isArray(agents) ? agents.map((agent) => agent.id) : agents,
            includeInactive: true,
          });
      if (res.error) {
        throw res.error;
      }
      setIsSubmitting(false);
      const successMessage = isSingleAgent
        ? i18n.translate('xpack.fleet.agentReassignPolicy.successSingleNotificationTitle', {
            defaultMessage: 'Reassigning agent policy',
          })
        : i18n.translate('xpack.fleet.agentReassignPolicy.successBulkNotificationTitle', {
            defaultMessage: 'Agent policy reassignment in progress',
          });
      notifications.toasts.addSuccess(successMessage);
      onClose();
    } catch (error) {
      setIsSubmitting(false);
      notifications.toasts.addError(error, {
        title: 'Unable to reassign agent policy',
      });
    }
  }

  return (
    <EuiConfirmModal
      data-test-subj="agentReassignPolicyModal"
      title={
        <FormattedMessage
          id="xpack.fleet.agentReassignPolicy.flyoutTitle"
          defaultMessage="Assign new agent policy"
        />
      }
      onCancel={onClose}
      onConfirm={onSubmit}
      cancelButtonText={
        <FormattedMessage
          id="xpack.fleet.agentReassignPolicy.cancelButtonLabel"
          defaultMessage="Cancel"
        />
      }
      confirmButtonDisabled={
        isSubmitting ||
        !selectedAgentPolicyId ||
        hasInvalidPolicySearch ||
        (isSingleAgent && selectedAgentPolicyId === (agents[0] as Agent).policy_id)
      }
      confirmButtonText={
        <FormattedMessage
          id="xpack.fleet.agentReassignPolicy.continueButtonLabel"
          defaultMessage="Assign policy"
        />
      }
      buttonColor="primary"
      aria-labelledby={modalTitleId}
      titleProps={{ id: modalTitleId }}
    >
      <p>
        <FormattedMessage
          id="xpack.fleet.agentReassignPolicy.flyoutDescription"
          defaultMessage="Choose a new agent policy to assign the selected {count, plural, one {agent} other {agents}} to."
          values={{
            count: isSingleAgent ? 1 : 0,
          }}
        />
      </p>
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiFormRow
            fullWidth
            label={i18n.translate('xpack.fleet.agentReassignPolicy.selectPolicyLabel', {
              defaultMessage: 'Agent policy',
            })}
          >
            <EuiComboBox
              fullWidth
              isLoading={agentPoliciesRequest.isLoading}
              options={agentPolicies.map((agentPolicy) => ({
                key: agentPolicy.id,
                label: agentPolicy.name,
              }))}
              singleSelection
              isInvalid={hasInvalidPolicySearch}
              onChange={(newOptions) => {
                if (newOptions.length) {
                  setSelectedAgentPolicyId(newOptions[0].key);
                } else {
                  setSelectedAgentPolicyId(undefined);
                }
              }}
              onSearchChange={(value, hasMatchingOptions) => {
                setHasInvalidPolicySearch(!!value && !hasMatchingOptions);
              }}
              selectedOptions={
                selectedAgentPolicyId
                  ? [
                      {
                        key: selectedAgentPolicyId,
                        label:
                          agentPolicies.find(
                            (agentPolicy) => agentPolicy.id === selectedAgentPolicyId
                          )?.name || '',
                      },
                    ]
                  : []
              }
              isClearable={true}
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />
      <EuiFlexGroup>
        <EuiFlexItem>
          {selectedAgentPolicyId && (
            <AgentPolicyPackageBadges agentPolicyId={selectedAgentPolicyId} />
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiConfirmModal>
  );
};
