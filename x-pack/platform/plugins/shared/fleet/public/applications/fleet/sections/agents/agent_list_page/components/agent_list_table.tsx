/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useCallback, useMemo } from 'react';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { type CriteriaWithPagination } from '@elastic/eui';
import {
  EuiBasicTable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedDate, FormattedMessage, FormattedRelative } from '@kbn/i18n-react';
import { css } from '@emotion/css';

import type { Agent, AgentPolicy } from '../../../../types';
import { isAgentUpgradeable } from '../../../../services';
import { AgentHealth } from '../../components';

import type { Pagination } from '../../../../hooks';
import { useAgentVersion } from '../../../../hooks';
import { useLink, useAuthz } from '../../../../hooks';

import { AgentPolicySummaryLine } from '../../../../../../components';
import { Tags } from '../../components/tags';
import type { AgentMetrics } from '../../../../../../../common/types';
import { formatAgentCPU, formatAgentMemory } from '../../services/agent_metrics';

import {
  hasVersionSuffix,
  removeVersionSuffixFromPolicyId,
} from '../../../../../../../common/services/version_specific_policies_utils';

import { isAgentSelectable as isAgentSelectableService } from '../../services/is_agent_selectable';

import { AgentUpgradeStatus } from './agent_upgrade_status';

import { EmptyPrompt } from './empty_prompt';

const AGENTS_TABLE_FIELDS = {
  ACTIVE: 'active',
  HOSTNAME: 'local_metadata.host.hostname',
  POLICY: 'policy_id',
  METRICS: 'metrics',
  VERSION: 'local_metadata.elastic.agent.version',
  LAST_CHECKIN: 'last_checkin',
};

function safeMetadata(val: any) {
  if (typeof val !== 'string') {
    return '-';
  }
  return val;
}

// Per-row cells are memoized so EuiBasicTable's re-renders (e.g. on selection
// change) can skip cells whose inputs are unchanged. Each cell receives only
// the primitives or stable references it needs, so shallow prop comparison
// is meaningful.

const StatusCell = React.memo<{ agent: Agent }>(({ agent }) => <AgentHealth agent={agent} />);

const HostCell = React.memo<{ host: string; tags: string[]; href: string }>(
  ({ host, tags, href }) => (
    <EuiFlexGroup gutterSize="none" direction="column">
      <EuiFlexItem grow={false}>
        <EuiLink href={href}>{safeMetadata(host)}</EuiLink>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <Tags tags={tags} color="subdued" size="xs" />
      </EuiFlexItem>
    </EuiFlexGroup>
  )
);

const PolicyCell = React.memo<{
  agent: Agent;
  agentPolicy: AgentPolicy | undefined;
  isVersionSpecific: boolean;
}>(({ agent, agentPolicy, isVersionSpecific }) =>
  agentPolicy ? (
    <AgentPolicySummaryLine
      policy={agentPolicy}
      agent={agent}
      showPolicyId
      isVersionSpecific={isVersionSpecific}
    />
  ) : null
);

const CpuCell = React.memo<{ agent: Agent; agentPolicy: AgentPolicy | undefined }>(
  ({ agent, agentPolicy }) => <>{formatAgentCPU(agent.metrics, agentPolicy)}</>
);

const MemoryCell = React.memo<{ agent: Agent; agentPolicy: AgentPolicy | undefined }>(
  ({ agent, agentPolicy }) => <>{formatAgentMemory(agent.metrics, agentPolicy)}</>
);

const LastCheckinCell = React.memo<{ lastCheckin: string | undefined }>(({ lastCheckin }) =>
  lastCheckin ? (
    <EuiToolTip
      content={
        <FormattedMessage
          id="xpack.fleet.agentList.lastActivityTooltip"
          defaultMessage="Last checked in at {lastCheckin}"
          values={{
            lastCheckin: (
              <FormattedDate
                value={lastCheckin}
                year="numeric"
                month="short"
                day="2-digit"
                timeZoneName="short"
                hour="numeric"
                minute="numeric"
              />
            ),
          }}
        />
      }
    >
      <span tabIndex={0}>
        <FormattedRelative value={lastCheckin} />
      </span>
    </EuiToolTip>
  ) : null
);

const VersionCell = React.memo<{
  agent: Agent;
  version: string;
  isAgentUpgradable: boolean;
  latestAgentVersion: string | undefined;
}>(({ agent, version, isAgentUpgradable, latestAgentVersion }) => (
  <EuiFlexGroup
    gutterSize="none"
    css={css`
      min-width: 0;
    `}
    direction="column"
  >
    <EuiFlexItem grow={false}>
      <EuiFlexGroup gutterSize="s" alignItems="center" wrap>
        <EuiFlexItem grow={false}>
          <EuiText size="s" className="eui-textNoWrap">
            {safeMetadata(version)}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <AgentUpgradeStatus
            isAgentUpgradable={isAgentUpgradable}
            agent={agent}
            latestAgentVersion={latestAgentVersion}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
  </EuiFlexGroup>
));

interface Props {
  agents: Agent[];
  isLoading: boolean;
  agentPoliciesIndexedById: Record<string, AgentPolicy>;
  renderActions: (a: Agent) => JSX.Element;
  sortField: keyof Agent;
  sortOrder: 'asc' | 'desc';
  onSelectionChange: (agents: Agent[]) => void;
  selected: Agent[];
  showUpgradeable: boolean;
  totalAgents?: number;
  pagination: Pagination;
  onTableChange: (criteria: CriteriaWithPagination<Agent>) => void;
  pageSizeOptions: number[];
  isUsingFilter: boolean;
  setEnrollmentFlyoutState: (
    value: React.SetStateAction<{
      isOpen: boolean;
      selectedPolicyId?: string | undefined;
    }>
  ) => void;
  clearFilters: () => void;
  queryHasChanged: boolean;
}

export const AgentListTable: React.FC<Props> = (props: Props) => {
  const {
    agents,
    isLoading,
    agentPoliciesIndexedById,
    renderActions,
    sortField,
    sortOrder,
    onTableChange,
    onSelectionChange,
    selected,
    totalAgents = 0,
    showUpgradeable,
    pagination,
    pageSizeOptions,
    isUsingFilter,
    setEnrollmentFlyoutState,
    clearFilters,
    queryHasChanged,
  } = props;

  const authz = useAuthz();
  const { getHref } = useLink();
  const latestAgentVersion = useAgentVersion();

  const isAgentSelectable = useCallback(
    (agent: Agent) => isAgentSelectableService(agent, agentPoliciesIndexedById),
    [agentPoliciesIndexedById]
  );

  const agentsShown = useMemo(() => {
    return totalAgents
      ? showUpgradeable
        ? agents.filter((agent) => isAgentSelectable(agent) && isAgentUpgradeable(agent))
        : agents
      : [];
  }, [agents, isAgentSelectable, showUpgradeable, totalAgents]);

  const noItemsMessage =
    isLoading && queryHasChanged ? (
      <FormattedMessage
        id="xpack.fleet.agentList.loadingAgentsMessage"
        defaultMessage="Loading agents…"
      />
    ) : isUsingFilter ? (
      <FormattedMessage
        id="xpack.fleet.agentList.noFilteredAgentsPrompt"
        defaultMessage="No agents found. {clearFiltersLink}"
        values={{
          clearFiltersLink: (
            <EuiLink onClick={() => clearFilters()}>
              <FormattedMessage
                id="xpack.fleet.agentList.clearFiltersLinkText"
                defaultMessage="Reset filters"
              />
            </EuiLink>
          ),
        }}
      />
    ) : (
      <EmptyPrompt
        hasFleetAddAgentsPrivileges={authz.fleet.addAgents}
        setEnrollmentFlyoutState={setEnrollmentFlyoutState}
      />
    );

  const sorting = {
    sort: {
      field: sortField,
      direction: sortOrder,
    },
  };

  const columns: Array<EuiBasicTableColumn<Agent>> = [
    {
      field: AGENTS_TABLE_FIELDS.ACTIVE,
      sortable: false,
      width: '85px',
      name: i18n.translate('xpack.fleet.agentList.statusColumnTitle', {
        defaultMessage: 'Status',
      }),
      render: (active: boolean, agent: any) => <StatusCell agent={agent} />,
    },
    {
      field: AGENTS_TABLE_FIELDS.HOSTNAME,
      sortable: true,
      name: i18n.translate('xpack.fleet.agentList.hostColumnTitle', {
        defaultMessage: 'Host',
      }),
      width: '185px',
      render: (host: string, agent: Agent) => (
        <HostCell
          host={host}
          tags={agent.tags ?? []}
          href={getHref('agent_details', { agentId: agent.id })}
        />
      ),
    },
    {
      field: AGENTS_TABLE_FIELDS.POLICY,
      sortable: true,
      truncateText: true,
      name: i18n.translate('xpack.fleet.agentList.policyColumnTitle', {
        defaultMessage: 'Agent policy',
      }),
      width: '220px',
      render: (policyId: string, agent: Agent) => (
        <PolicyCell
          agent={agent}
          agentPolicy={agentPoliciesIndexedById[removeVersionSuffixFromPolicyId(policyId)]}
          isVersionSpecific={hasVersionSuffix(policyId)}
        />
      ),
    },

    {
      field: AGENTS_TABLE_FIELDS.METRICS,
      sortable: false,
      name: (
        <EuiToolTip
          content={
            <FormattedMessage
              id="xpack.fleet.agentList.cpuTooltip"
              defaultMessage="Average CPU usage by Elastic Agent and reported Agent component processes over the last 5 minutes. This is process-level Agent/component CPU usage, not total host CPU usage. Values are not normalized by CPU core count and can exceed 100% on multi-core hosts."
            />
          }
        >
          <span tabIndex={0}>
            <FormattedMessage id="xpack.fleet.agentList.cpuTitle" defaultMessage="CPU" />
            &nbsp;
            <EuiIcon type="info" aria-hidden={true} />
          </span>
        </EuiToolTip>
      ),
      width: '75px',
      render: (metrics: AgentMetrics | undefined, agent: Agent) => (
        <CpuCell
          agent={agent}
          agentPolicy={
            agent.policy_id
              ? agentPoliciesIndexedById[removeVersionSuffixFromPolicyId(agent.policy_id)]
              : undefined
          }
        />
      ),
    },
    {
      field: AGENTS_TABLE_FIELDS.METRICS,
      sortable: false,
      name: (
        <EuiToolTip
          content={
            <FormattedMessage
              id="xpack.fleet.agentList.memoryTooltip"
              defaultMessage="Average memory usage in the last 5 minutes"
            />
          }
        >
          <span tabIndex={0}>
            <FormattedMessage id="xpack.fleet.agentList.memoryTitle" defaultMessage="Memory" />
            &nbsp;
            <EuiIcon type="info" aria-hidden={true} />
          </span>
        </EuiToolTip>
      ),
      width: '90px',
      render: (metrics: AgentMetrics | undefined, agent: Agent) => (
        <MemoryCell
          agent={agent}
          agentPolicy={
            agent.policy_id
              ? agentPoliciesIndexedById[removeVersionSuffixFromPolicyId(agent.policy_id)]
              : undefined
          }
        />
      ),
    },
    {
      field: AGENTS_TABLE_FIELDS.LAST_CHECKIN,
      sortable: true,
      name: i18n.translate('xpack.fleet.agentList.lastCheckinTitle', {
        defaultMessage: 'Last activity',
      }),
      width: '100px',
      render: (lastCheckin: string) => <LastCheckinCell lastCheckin={lastCheckin} />,
    },
    {
      field: AGENTS_TABLE_FIELDS.VERSION,
      sortable: true,
      width: '220px',
      name: i18n.translate('xpack.fleet.agentList.versionTitle', {
        defaultMessage: 'Version',
      }),
      render: (version: string, agent: Agent) => (
        <VersionCell
          agent={agent}
          version={version}
          isAgentUpgradable={!!(isAgentSelectable(agent) && isAgentUpgradeable(agent))}
          latestAgentVersion={latestAgentVersion}
        />
      ),
    },
    {
      name: i18n.translate('xpack.fleet.agentList.actionsColumnTitle', {
        defaultMessage: 'Actions',
      }),
      actions: [
        {
          render: renderActions,
        },
      ],
      width: '100px',
    },
  ];

  return (
    <EuiBasicTable<Agent>
      className="fleet__agentList__table"
      data-test-subj="fleetAgentListTable"
      tableCaption={i18n.translate('xpack.fleet.agentList.tableCaption', {
        defaultMessage: 'Fleet agents',
      })}
      loading={isLoading}
      noItemsMessage={noItemsMessage}
      items={agentsShown}
      itemId="id"
      columns={columns}
      pagination={{
        pageIndex: pagination.currentPage - 1,
        pageSize: pagination.pageSize,
        totalItemCount: totalAgents,
        pageSizeOptions,
      }}
      selection={{
        selected,
        onSelectionChange,
        selectable: isAgentSelectable,
        selectableMessage: (selectable, agent) => {
          if (selectable) return '';
          if (!agent.active) {
            return 'This agent is not active';
          }
          if (
            agent.policy_id &&
            agentPoliciesIndexedById[agent.policy_id].is_managed &&
            agent.type !== 'OPAMP'
          ) {
            return 'This action is not available for agents enrolled in an externally managed agent policy';
          }
          return '';
        },
      }}
      onChange={onTableChange}
      sorting={sorting}
    />
  );
};
