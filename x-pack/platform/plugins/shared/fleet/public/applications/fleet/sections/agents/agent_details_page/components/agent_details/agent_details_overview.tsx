/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import styled from 'styled-components';
import {
  EuiDescriptionList,
  EuiDescriptionListTitle,
  EuiDescriptionListDescription,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiIcon,
  EuiSkeletonText,
  EuiToolTip,
  EuiButton,
  euiTextBreakWord,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/css';

import type { OutputsForAgentPolicy } from '../../../../../../../../server/types';

import type { Agent, AgentPolicy } from '../../../../../types';
import { useAgentVersion } from '../../../../../hooks';
import { hasVersionSuffix } from '../../../../../../../../common/services/version_specific_policies_utils';
import { isAgentUpgradeable } from '../../../../../services';
import { AgentPolicySummaryLine } from '../../../../../components';
import { AgentHealth } from '../../../components';
import { formatAgentCPU, formatAgentMemory } from '../../../services/agent_metrics';
import { AgentDashboardLink } from '../agent_dashboard_link';
import { AgentUpgradeStatus } from '../../../agent_list_page/components/agent_upgrade_status';
import { AgentPolicyOutputsSummary } from '../../../agent_list_page/components/agent_policy_outputs_summary';
import { formattedTime } from '../../../agent_list_page/components/agent_activity_flyout/helpers';
import { AgentEffectiveConfigFlyout } from '../agent_effective_config_flyout';

const EuiButtonCompressed = styled(EuiButton)`
  height: 32px;
`;

export const AgentDetailsOverviewSection: React.FunctionComponent<{
  agent: Agent;
  agentPolicy?: AgentPolicy;
  outputs?: OutputsForAgentPolicy;
}> = memo(({ agent, agentPolicy, outputs }) => {
  const latestAgentVersion = useAgentVersion();
  const [effectiveConfigFlyoutOpen, setEffectiveConfigFlyoutOpen] = React.useState(false);

  return (
    <EuiPanel>
      <EuiDescriptionList compressed>
        <EuiFlexGroup
          direction="column"
          gutterSize="m"
          data-test-subj="agentDetailsOverviewSection"
        >
          <EuiFlexGroup>
            <EuiFlexItem grow={5}>
              <EuiFlexGroup direction="column" gutterSize="m">
                {[
                  {
                    title: (
                      <EuiToolTip
                        content={
                          <FormattedMessage
                            id="xpack.fleet.agentDetails.cpuTooltip"
                            defaultMessage="Average CPU usage by Elastic Agent and reported Agent component processes over the last 5 minutes. This is process-level Agent/component CPU usage, not total host CPU usage. Values are not normalized by CPU core count and can exceed 100% on multi-core hosts."
                          />
                        }
                      >
                        <span tabIndex={0}>
                          <FormattedMessage
                            id="xpack.fleet.agentDetails.cpuTitle"
                            defaultMessage="CPU"
                          />
                          &nbsp;
                          <EuiIcon type="info" aria-hidden={true} />
                        </span>
                      </EuiToolTip>
                    ),
                    description: formatAgentCPU(agent.metrics, agentPolicy),
                  },
                  {
                    title: (
                      <EuiToolTip
                        content={
                          <FormattedMessage
                            id="xpack.fleet.agentDetails.memoryTooltip"
                            defaultMessage="Average memory usage in the last 5 minutes"
                          />
                        }
                      >
                        <span tabIndex={0}>
                          <FormattedMessage
                            id="xpack.fleet.agentDetails.memoryTitle"
                            defaultMessage="Memory"
                          />
                          &nbsp;
                          <EuiIcon type="info" aria-hidden={true} />
                        </span>
                      </EuiToolTip>
                    ),
                    description: formatAgentMemory(agent.metrics, agentPolicy),
                  },
                ].map(({ title, description }) => {
                  const tooltip =
                    typeof description === 'string' && description.length > 20 ? description : '';
                  return (
                    <EuiFlexGroup>
                      <EuiFlexItem grow={8}>
                        <EuiDescriptionListTitle>{title}</EuiDescriptionListTitle>
                      </EuiFlexItem>
                      <EuiFlexItem grow={4}>
                        <EuiToolTip position="top" content={tooltip}>
                          <EuiDescriptionListDescription className="eui-textTruncate">
                            {description}
                          </EuiDescriptionListDescription>
                        </EuiToolTip>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  );
                })}
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={5}>
              <EuiFlexGroup justifyContent="flexStart" direction="column" alignItems="flexEnd">
                <EuiFlexItem grow={false}>
                  <AgentDashboardLink agent={agent} agentPolicy={agentPolicy} />
                </EuiFlexItem>
                {agent.type === 'OPAMP' && (
                  <EuiFlexItem grow={false}>
                    <EuiButtonCompressed onClick={() => setEffectiveConfigFlyoutOpen(true)}>
                      {' '}
                      <FormattedMessage
                        id="xpack.fleet.agentDetails.viewEffectiveConfigButtonLabel"
                        defaultMessage="View Collector Configuration"
                      />
                    </EuiButtonCompressed>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
          {[
            {
              title: i18n.translate('xpack.fleet.agentDetails.statusLabel', {
                defaultMessage: 'Status',
              }),
              description: <AgentHealth agent={agent} fromDetails={true} />,
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.lastActivityLabel', {
                defaultMessage: 'Last activity',
              }),
              description: agent.last_checkin ? formattedTime(agent.last_checkin) : '-',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.lastCheckinMessageLabel', {
                defaultMessage: 'Last checkin message',
              }),
              description: agent.last_checkin_message ? agent.last_checkin_message : '-',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.agentIdLabel', {
                defaultMessage: 'Agent ID',
              }),
              description: agent.id,
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.agentPolicyLabel', {
                defaultMessage: 'Agent policy',
              }),
              description: agentPolicy ? (
                <AgentPolicySummaryLine
                  policy={agentPolicy}
                  agent={agent}
                  showPolicyId
                  isVersionSpecific={hasVersionSuffix(agent.policy_id ?? '')}
                />
              ) : (
                <EuiSkeletonText lines={1} />
              ),
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.versionLabel', {
                defaultMessage: 'Agent version',
              }),
              description:
                typeof agent.local_metadata?.elastic?.agent?.version === 'string' ? (
                  <EuiFlexGroup
                    gutterSize="s"
                    alignItems="center"
                    css={css`
                      min-width: 0;
                    `}
                  >
                    <EuiFlexItem grow={false} className="eui-textNoWrap">
                      {agent.local_metadata.elastic.agent.version}
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <AgentUpgradeStatus
                        isAgentUpgradable={
                          !!(agentPolicy?.is_managed !== true && isAgentUpgradeable(agent))
                        }
                        agent={agent}
                        latestAgentVersion={latestAgentVersion}
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                ) : (
                  '-'
                ),
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.hostNameLabel', {
                defaultMessage: 'Host name',
              }),
              description:
                typeof agent.local_metadata?.host?.hostname === 'string'
                  ? agent.local_metadata.host.hostname
                  : '-',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.hostIdLabel', {
                defaultMessage: 'Host ID',
              }),
              description:
                typeof agent.local_metadata?.host?.id === 'string'
                  ? agent.local_metadata.host.id
                  : '-',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.outputForMonitoringLabel', {
                defaultMessage: 'Output for integrations',
              }),
              description: outputs ? <AgentPolicyOutputsSummary outputs={outputs} /> : '-',
              hidden: agent.type === 'OPAMP',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.outputForMonitoringLabel', {
                defaultMessage: 'Output for monitoring',
              }),
              description: outputs ? (
                <AgentPolicyOutputsSummary outputs={outputs} isMonitoring={true} />
              ) : (
                '-'
              ),
              hidden: agent.type === 'OPAMP',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.logLevel', {
                defaultMessage: 'Logging level',
              }),
              description:
                typeof agent.local_metadata?.elastic?.agent?.log_level === 'string'
                  ? agent.local_metadata.elastic.agent.log_level
                  : '-',
              hidden: agent.type === 'OPAMP',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.privilegeModeLabel', {
                defaultMessage: 'Privilege mode',
              }),
              description:
                agent?.local_metadata.elastic?.agent.unprivileged === true ? (
                  <FormattedMessage
                    id="xpack.fleet.agentDetails.privilegeModeUnprivilegedText"
                    defaultMessage="Running as non-root"
                  />
                ) : (
                  <FormattedMessage
                    id="xpack.fleet.agentDetails.privilegeModePrivilegedText"
                    defaultMessage="Running as root"
                  />
                ),
              hidden: agent.type === 'OPAMP',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.releaseLabel', {
                defaultMessage: 'Agent release',
              }),
              description:
                typeof agent.local_metadata?.elastic?.agent?.snapshot === 'boolean'
                  ? agent.local_metadata.elastic.agent.snapshot === true
                    ? 'snapshot'
                    : 'stable'
                  : '-',
              hidden: agent.type === 'OPAMP',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.platformLabel', {
                defaultMessage: 'Platform',
              }),
              description:
                typeof agent.local_metadata?.os?.platform === 'string'
                  ? agent.local_metadata.os.platform
                  : '-',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.monitorLogsLabel', {
                defaultMessage: 'Monitor logs',
              }),
              description: Array.isArray(agentPolicy?.monitoring_enabled) ? (
                agentPolicy?.monitoring_enabled?.includes('logs') ? (
                  <FormattedMessage
                    id="xpack.fleet.agentList.monitorLogsEnabledText"
                    defaultMessage="Enabled"
                  />
                ) : (
                  <FormattedMessage
                    id="xpack.fleet.agentList.monitorLogsDisabledText"
                    defaultMessage="Disabled"
                  />
                )
              ) : (
                <EuiSkeletonText lines={1} />
              ),
              hidden: agent.type === 'OPAMP',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.monitorMetricsLabel', {
                defaultMessage: 'Monitor metrics',
              }),
              description: Array.isArray(agentPolicy?.monitoring_enabled) ? (
                agentPolicy?.monitoring_enabled?.includes('metrics') ? (
                  <FormattedMessage
                    id="xpack.fleet.agentList.monitorMetricsEnabledText"
                    defaultMessage="Enabled"
                  />
                ) : (
                  <FormattedMessage
                    id="xpack.fleet.agentList.monitorMetricsDisabledText"
                    defaultMessage="Disabled"
                  />
                )
              ) : (
                <EuiSkeletonText lines={1} />
              ),
              hidden: agent.type === 'OPAMP',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.tagsLabel', {
                defaultMessage: 'Tags',
              }),
              description: (agent.tags ?? []).length > 0 ? agent.tags!.join(', ') : '-',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.platformLabel', {
                defaultMessage: 'FIPS mode',
              }),
              description:
                agent.local_metadata.elastic?.agent.fips === true ? (
                  <FormattedMessage
                    id="xpack.fleet.agentDetails.fipsModeCompliantText"
                    defaultMessage="Enabled"
                  />
                ) : (
                  <FormattedMessage
                    id="xpack.fleet.agentDetails.privilegeModePrivilegedText"
                    defaultMessage="Not enabled"
                  />
                ),
              hidden: agent.type === 'OPAMP',
            },
            {
              title: i18n.translate('xpack.fleet.agentDetails.capabilitiesLabel', {
                defaultMessage: 'Collector capabilities',
              }),
              description: (
                <EuiFlexGroup direction="column" alignItems="flexStart" justifyContent="flexStart">
                  {agent.capabilities?.sort().map((capability) => (
                    <EuiFlexItem grow={false} key={capability}>
                      <EuiDescriptionListDescription
                        css={`
                          ${euiTextBreakWord()};
                        `}
                      >
                        {capability}
                      </EuiDescriptionListDescription>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              ),
              hidden: !Array.isArray(agent.capabilities),
            },
          ]
            .filter(({ hidden }) => !hidden)
            .map(({ title, description }) => {
              return (
                <EuiFlexGroup>
                  <EuiFlexItem grow={3}>
                    <EuiDescriptionListTitle>{title}</EuiDescriptionListTitle>
                  </EuiFlexItem>
                  <EuiFlexItem grow={7}>
                    <EuiDescriptionListDescription>{description}</EuiDescriptionListDescription>
                  </EuiFlexItem>
                </EuiFlexGroup>
              );
            })}
        </EuiFlexGroup>
      </EuiDescriptionList>
      {effectiveConfigFlyoutOpen && (
        <AgentEffectiveConfigFlyout
          agent={agent}
          onClose={() => setEffectiveConfigFlyoutOpen(false)}
        />
      )}
    </EuiPanel>
  );
});
