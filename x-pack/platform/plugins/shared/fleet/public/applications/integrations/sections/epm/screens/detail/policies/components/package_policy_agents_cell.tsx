/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment, useState, useMemo } from 'react';

import {
  EuiButton,
  EuiLink,
  EuiPopover,
  EuiPopoverTitle,
  EuiHorizontalRule,
  EuiSpacer,
  EuiText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopoverFooter,
  EuiButtonEmpty,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { sortBy } from 'lodash';

import { LinkedAgentCount, AddAgentHelpPopover } from '../../../../../../components';
import type { AgentPolicy } from '../../../../../../types';
import { policyHasFleetServer } from '../../../../../../services';
import { useAuthz, useLink, useMultipleAgentPolicies } from '../../../../../../hooks';
import {
  PRIVILEGED_AGENT_KUERY,
  UNPRIVILEGED_AGENT_KUERY,
  AGENTS_PREFIX,
} from '../../../../../../constants';

const AddAgentButton = ({
  onAddAgent,
  canAddAgents,
  withPopover,
}: {
  onAddAgent: () => void;
  canAddAgents: boolean;
  withPopover?: boolean;
}) => {
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(true);
  const onAddAgentCloseHelp = () => {
    setIsHelpOpen(false);
    onAddAgent();
  };
  return withPopover ? (
    <AddAgentHelpPopover
      button={
        <EuiButton
          iconType="plusCircle"
          data-test-subj="addAgentButton"
          onClick={onAddAgentCloseHelp}
          size="s"
          isDisabled={!canAddAgents}
        >
          <FormattedMessage
            id="xpack.fleet.epm.packageDetails.integrationList.addAgent"
            defaultMessage="Add agent"
          />
        </EuiButton>
      }
      isOpen={isHelpOpen}
      closePopover={() => setIsHelpOpen(false)}
    />
  ) : (
    <EuiButton
      iconType="plusCircle"
      data-test-subj="addAgentButton"
      onClick={onAddAgent}
      size="s"
      isDisabled={!canAddAgents}
    >
      <FormattedMessage
        id="xpack.fleet.epm.packageDetails.integrationList.addAgent"
        defaultMessage="Add agent"
      />
    </EuiButton>
  );
};

export const PackagePolicyAgentsCell = ({
  agentPolicies,
  onAddAgent,
  hasHelpPopover = false,
}: {
  agentPolicies: AgentPolicy[];
  hasHelpPopover?: boolean;
  onAddAgent: () => void;
}) => {
  const { canUseMultipleAgentPolicies } = useMultipleAgentPolicies();

  const agentCount = agentPolicies.reduce((acc, curr) => {
    return (acc += curr?.agents || 0);
  }, 0);

  const canAddAgents = useAuthz().fleet.addAgents;
  const canAddFleetServers = useAuthz().fleet.addFleetServers;

  if (agentPolicies.length === 1 && agentPolicies[0].is_managed) {
    return (
      <LinkedAgentCount
        count={agentCount}
        agentPolicyId={agentPolicies[0].id}
        className="eui-textTruncate"
      />
    );
  }

  // If multiple agent policies are supported and there are agents assigned to more than one
  if (canUseMultipleAgentPolicies && agentCount > 0 && agentPolicies.length > 1) {
    return <AgentsCountBreakDown agentCount={agentCount} agentPolicies={agentPolicies} />;
  }

  const agentPolicy = agentPolicies[0];
  const canAddAgentsForPolicy = policyHasFleetServer(agentPolicy)
    ? canAddFleetServers
    : canAddAgents;
  if (agentCount > 0) {
    return (
      <LinkedAgentCount
        count={agentCount}
        agentPolicyId={agentPolicy.id}
        className="eui-textTruncate"
      />
    );
  } else {
    return (
      <AddAgentButton
        onAddAgent={onAddAgent}
        canAddAgents={canAddAgentsForPolicy}
        withPopover={hasHelpPopover}
      />
    );
  }
};

export const AgentsCountBreakDown = ({
  agentPolicies,
  agentCount,
  privilegeMode,
}: {
  agentPolicies: AgentPolicy[];
  agentCount: number;
  privilegeMode?: 'privileged' | 'unprivileged';
}) => {
  const { getHref } = useLink();
  const authz = useAuthz();

  const canReadAgents = authz.fleet.readAgents;

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const closePopover = () => setIsPopoverOpen(false);
  const popoverTitleId = useGeneratedHtmlId();

  const getKuery = (agentPolicyId: string) =>
    `${AGENTS_PREFIX}.policy_id : "${agentPolicyId}"${
      privilegeMode
        ? ` and ${
            privilegeMode === 'unprivileged' ? UNPRIVILEGED_AGENT_KUERY : PRIVILEGED_AGENT_KUERY
          }`
        : ''
    }`;
  const topFivePolicies = useMemo(
    () => sortBy(agentPolicies, 'agents').reverse().slice(0, 5),
    [agentPolicies]
  );

  return (
    <>
      <EuiPopover
        aria-labelledby={popoverTitleId}
        data-test-subj="agentCountsPopover"
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        anchorPosition="downCenter"
        button={
          <EuiButtonEmpty
            flush="left"
            onClick={() => setIsPopoverOpen(!isPopoverOpen)}
            data-test-subj="agentsCountsButton"
          >
            {agentCount}
          </EuiButtonEmpty>
        }
      >
        <EuiPopoverTitle id={popoverTitleId}>
          {i18n.translate('xpack.fleet.agentsCountsBreakdown.popover.title', {
            defaultMessage: 'Agents breakdown',
          })}
        </EuiPopoverTitle>
        <div style={{ minWidth: 300 }}>
          <EuiText size="xs">
            <b>
              {i18n.translate('xpack.fleet.agentsCountsBreakdown.popover.heading', {
                defaultMessage: 'Top values',
              })}
            </b>
          </EuiText>
          <EuiSpacer size="m" />
          {topFivePolicies.map((agentPolicy) => (
            <Fragment key={agentPolicy.id}>
              <EuiFlexGroup justifyContent="spaceBetween">
                <EuiFlexItem grow={false}>
                  <EuiText size="s" key={agentPolicy.id}>
                    {agentPolicy.name}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  {agentPolicy?.agents && agentPolicy.agents > 0 ? (
                    <EuiLink
                      href={getHref('agent_list', {
                        kuery: getKuery(agentPolicy.id),
                        showInactive: true,
                      })}
                    >
                      {agentPolicy.agents}
                    </EuiLink>
                  ) : (
                    0
                  )}
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiHorizontalRule margin="xs" />
            </Fragment>
          ))}
          <EuiSpacer size="s" />
          {agentCount > 0 ? (
            <EuiPopoverFooter>
              <EuiButton
                fullWidth
                size="s"
                data-test-subj="agentsCountsBreakdownPopoverButton"
                href={getHref('agent_list', { showInactive: true })}
                isDisabled={!canReadAgents}
              >
                {i18n.translate('xpack.fleet.agentsCountsBreakdown.popover.button', {
                  defaultMessage: 'View all {agentCount, plural, one {# agent} other {# agents}}',
                  values: { agentCount },
                })}
              </EuiButton>
            </EuiPopoverFooter>
          ) : null}
        </div>
      </EuiPopover>
    </>
  );
};
