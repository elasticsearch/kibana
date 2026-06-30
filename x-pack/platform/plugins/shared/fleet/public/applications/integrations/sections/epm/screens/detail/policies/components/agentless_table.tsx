/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { HorizontalAlignment } from '@elastic/eui';
import { EuiBadge, EuiBasicTable, EuiFlexGroup, EuiFlexItem, EuiLink, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedRelative, FormattedMessage } from '@kbn/i18n-react';

import { useLocation } from 'react-router-dom';

import type {
  Agent,
  AgentPolicy,
  InMemoryPackagePolicy,
  PackagePolicy,
} from '../../../../../../types';
import type { AgentlessPolicyThroughput } from '../../../../../../../../../common/types/rest_spec/agentless_policy';
import {
  AGENTS_PREFIX,
  FLEET_CONNECTORS_PACKAGE,
  SO_SEARCH_LIMIT,
} from '../../../../../../../../../common/constants';
import type { usePagination } from '../../../../../../hooks';
import {
  useLink,
  sendGetAgents,
  useAuthz,
  useStartServices,
  useBulkGetAgentlessPolicyThroughput,
  useDiscoverLocator,
} from '../../../../../../hooks';
import { getAgentlessThroughputIndexPatterns } from '../../../../../../../../../common/services';
import {
  Loading,
  PackagePolicyActionsMenu,
  AgentlessEnrollmentFlyout,
} from '../../../../../../components';

import { Persona } from '../persona';
import { AgentHealth } from '../../../../../../../fleet/sections/agents/components';

import { PackagePolicyUpgradeCell } from './package_policy_upgrade_cell';
import { ThroughputCell } from './throughput_cell';
import { getConnectorsFromPackagePolicy, getSelectedInput } from './agentless_table_adapters';

const REFRESH_INTERVAL_MS = 30000;

const isConnectorPolicy = (packagePolicy: InMemoryPackagePolicy) =>
  packagePolicy.package?.name === FLEET_CONNECTORS_PACKAGE;

export const AgentlessPackagePoliciesTable = ({
  isLoading,
  packagePolicies,
  packagePoliciesTotal,
  refreshPackagePolicies,
  pagination,
  from,
}: {
  isLoading: boolean;
  packagePolicies: Array<{
    agentPolicies: AgentPolicy[];
    packagePolicy: InMemoryPackagePolicy;
    rowIndex: number;
  }>;
  packagePoliciesTotal: number;
  refreshPackagePolicies: () => void;
  pagination: ReturnType<typeof usePagination>;
  from?: 'installed-integrations';
}) => {
  const core = useStartServices();
  const { notifications } = core;
  const authz = useAuthz();
  const { getHref } = useLink();
  const [isAgentsLoading, setIsAgentsLoading] = useState<boolean>(false);
  const [agentsByPolicyId, setAgentsByPolicyId] = useState<Record<string, Agent>>({});
  const canReadAgents = authz.fleet.readAgents;

  // Collect ids for non-connector policies only; connectors don't ingest via agents
  const throughputPolicyIds = useMemo(
    () =>
      packagePolicies
        .filter(({ packagePolicy }) => !isConnectorPolicy(packagePolicy))
        .map(({ packagePolicy }) => packagePolicy.id),
    [packagePolicies]
  );
  const { data: throughputData, isLoading: isThroughputLoading } =
    useBulkGetAgentlessPolicyThroughput(throughputPolicyIds);
  const throughputByPolicyId = useMemo(
    () =>
      (throughputData?.items ?? []).reduce<Record<string, AgentlessPolicyThroughput>>(
        (acc, item) => {
          acc[item.policyId] = item;
          return acc;
        },
        {}
      ),
    [throughputData]
  );

  const hasNonConnectorPolicies = useMemo(
    () => packagePolicies.some(({ packagePolicy }) => !isConnectorPolicy(packagePolicy)),
    [packagePolicies]
  );

  const discoverLocator = useDiscoverLocator();
  const getThroughputDiscoverParams = useCallback(
    (packagePolicy: InMemoryPackagePolicy) => {
      const indexPatterns = getAgentlessThroughputIndexPatterns(packagePolicy);
      if (!discoverLocator || indexPatterns.length === 0) return undefined;
      const title = indexPatterns.join(',');
      const params = {
        dataViewSpec: {
          id: `fleet-agentless-throughput-${packagePolicy.id}`,
          name: title,
          title,
          timeFieldName: 'event.ingested',
        },
        timeRange: { from: 'now-24h', to: 'now' },
        query: { language: 'kuery', query: `agent.name: *${packagePolicy.id}*` },
      };
      return {
        href: discoverLocator.getRedirectUrl(params),
        navigate: () => discoverLocator.navigate(params),
      };
    },
    [discoverLocator]
  );

  // Kuery for all agents enrolled into the agent policies associated with the package policies
  // We use the first agent policy as agentless package policies have a 1:1 relationship with agent policies
  // Maximum # of agent policies is 50, based on the max page size in UI
  const agentsKuery = useMemo(() => {
    return packagePolicies
      .reduce((policyIds, { agentPolicies }) => {
        return [...policyIds, ...(agentPolicies[0] ? [agentPolicies[0]?.id] : [])];
      }, [] as string[])
      .map((policyId) => `${AGENTS_PREFIX}.policy_id: "${policyId}"`)
      .join(' or ');
  }, [packagePolicies]);

  // Fetch agents using above kuery, if the user has access to read agents
  // Polls every 30 seconds
  useEffect(() => {
    const fetchAgents = async () => {
      const { data: agentsData, error } = await sendGetAgents({
        perPage: SO_SEARCH_LIMIT,
        kuery: agentsKuery,
      });

      setAgentsByPolicyId(
        (agentsData?.items || []).reduce((acc, agent) => {
          if (agent.policy_id) {
            acc[agent.policy_id] = agent;
          }
          return acc;
        }, {} as Record<string, Agent>)
      );

      if (error) {
        notifications.toasts.addError(error, {
          title: i18n.translate(
            'xpack.fleet.epm.packageDetails.integrationList.agentlessStatusError',
            {
              defaultMessage: 'Error fetching agentless status information',
            }
          ),
        });
      }
      setIsAgentsLoading(false);
    };

    if (canReadAgents) {
      setIsAgentsLoading(true);
      fetchAgents();
      const interval = setInterval(() => {
        fetchAgents();
      }, REFRESH_INTERVAL_MS);
      return () => clearInterval(interval);
    }
  }, [agentsKuery, canReadAgents, notifications.toasts]);

  // Flyout state
  const { search } = useLocation();
  const queryParams = useMemo(() => new URLSearchParams(search), [search]);
  const [flyoutOpenForPolicyId, setFlyoutOpenForPolicyId] = useState<string>();
  const [flyoutPackagePolicy, setFlyoutPackagePolicy] = useState<PackagePolicy>();
  const [flyoutAgentPolicy, setFlyoutAgentPolicy] = useState<AgentPolicy>();
  useEffect(() => {
    // The agentless save flow sets openEnrollmentFlyout=<packagePolicyId> via
    // appendOnSaveQueryParamsToPath (AgentlessPolicy has no policy_ids, so
    // policy.id is used). Match on packagePolicy.id accordingly.
    // TODO: the flyout now takes a decoupled AgentlessEnrollmentFlyoutProps contract;
    // the remaining work is to source this table from the AgentlessPolicy API and map
    // AgentlessPolicy -> AgentlessEnrollmentFlyoutProps instead of PackagePolicy.
    const flyoutPolicyIdFromQuery = queryParams.get('openEnrollmentFlyout');
    if (flyoutPolicyIdFromQuery) {
      const pp = packagePolicies.find((p) => p.packagePolicy.id === flyoutPolicyIdFromQuery);
      if (pp) {
        setFlyoutOpenForPolicyId(flyoutPolicyIdFromQuery);
        setFlyoutPackagePolicy(pp.packagePolicy);
        setFlyoutAgentPolicy(pp.agentPolicies[0]);
      }
    }
  }, [packagePolicies, queryParams]);

  return (
    <>
      <EuiBasicTable<{
        agentPolicies: AgentPolicy[];
        packagePolicy: InMemoryPackagePolicy;
        rowIndex: number;
      }>
        items={packagePolicies || []}
        columns={[
          {
            field: 'packagePolicy.name',
            name: i18n.translate('xpack.fleet.epm.packageDetails.integrationList.name', {
              defaultMessage: 'Integration policy',
            }),
            render(_, { agentPolicies, packagePolicy }) {
              const editHref = getHref('integration_policy_edit', {
                packagePolicyId: packagePolicy.id,
              });
              return (
                <EuiLink
                  className="eui-textTruncate"
                  data-test-subj="agentlessIntegrationNameLink"
                  href={from ? `${editHref}?from=${from}` : editHref}
                >
                  {packagePolicy.name}
                </EuiLink>
              );
            },
          },
          {
            field: 'packagePolicy.package.version',
            name: i18n.translate('xpack.fleet.epm.packageDetails.integrationList.version', {
              defaultMessage: 'Version',
            }),
            render(_version, { agentPolicies, packagePolicy }) {
              return (
                <EuiFlexGroup gutterSize="s" alignItems="center" wrap={true}>
                  <EuiFlexItem grow={false}>
                    <EuiText
                      size="s"
                      className="eui-textNoWrap"
                      data-test-subj="packageVersionText"
                    >
                      <FormattedMessage
                        id="xpack.fleet.epm.packageDetails.integrationList.packageVersion"
                        defaultMessage="v{version}"
                        values={{ version: _version }}
                      />
                    </EuiText>
                  </EuiFlexItem>

                  <PackagePolicyUpgradeCell
                    packagePolicy={packagePolicy}
                    agentPolicies={agentPolicies}
                    from={from || 'integrations-policy-list'}
                  />
                </EuiFlexGroup>
              );
            },
          },
          {
            field: 'packagePolicy.updated_by',
            name: i18n.translate('xpack.fleet.epm.packageDetails.integrationList.updatedBy', {
              defaultMessage: 'Last updated by',
            }),
            truncateText: true,
            render(updatedBy: PackagePolicy['updated_by']) {
              return <Persona size="s" name={updatedBy} />;
            },
          },
          {
            field: 'packagePolicy.updated_at',
            name: i18n.translate('xpack.fleet.epm.packageDetails.integrationList.updatedAt', {
              defaultMessage: 'Last updated',
            }),
            truncateText: true,
            render(updatedAt: PackagePolicy['updated_at']) {
              return (
                <span className="eui-textTruncate" title={updatedAt}>
                  <FormattedRelative value={updatedAt} />
                </span>
              );
            },
          },
          ...(hasNonConnectorPolicies
            ? [
                {
                  field: '',
                  name: i18n.translate(
                    'xpack.fleet.epm.packageDetails.integrationList.throughput24h',
                    { defaultMessage: 'Throughput last 24h' }
                  ),
                  align: 'left' as HorizontalAlignment,
                  render({ packagePolicy }: { packagePolicy: InMemoryPackagePolicy }) {
                    return (
                      <ThroughputCell
                        data={throughputByPolicyId[packagePolicy.id]}
                        isLoading={isThroughputLoading}
                        discover={getThroughputDiscoverParams(packagePolicy)}
                      />
                    );
                  },
                },
              ]
            : []),
          ...(canReadAgents
            ? [
                {
                  field: '',
                  name: i18n.translate(
                    'xpack.fleet.epm.packageDetails.integrationList.agentlessStatus',
                    {
                      defaultMessage: 'Status',
                    }
                  ),
                  align: 'left' as HorizontalAlignment,
                  render({
                    agentPolicies,
                    packagePolicy,
                  }: {
                    agentPolicies: AgentPolicy[];
                    packagePolicy: InMemoryPackagePolicy;
                    rowIndex: number;
                  }) {
                    if (isAgentsLoading) {
                      return <Loading size="s" />;
                    }
                    // Use the first agent policy ID associated with the package policy
                    // because agentless package policies are only associated with one agent policy
                    const agentPolicy = agentPolicies[0];
                    const agent =
                      (agentPolicy?.id && agentsByPolicyId[agentPolicy.id]) || undefined;

                    // Status badge click handler
                    const statusBadgeProps = {
                      onClick: () => {
                        setFlyoutOpenForPolicyId(packagePolicy.id);
                        setFlyoutPackagePolicy(packagePolicy);
                        setFlyoutAgentPolicy(agentPolicy);
                      },
                      'data-test-subj': 'agentlessStatusBadge',
                      onClickAriaLabel: i18n.translate(
                        'xpack.fleet.epm.packageDetails.integrationList.agentlessStatusAriaLabel',
                        {
                          defaultMessage: 'Open status details',
                        }
                      ),
                    };

                    return agent ? (
                      <AgentHealth agent={agent} {...statusBadgeProps} />
                    ) : (
                      <EuiBadge color="default" {...statusBadgeProps}>
                        <FormattedMessage
                          id="xpack.fleet.packageDetails.integrationList.pendingAgentlessStatus"
                          defaultMessage="Pending"
                        />
                      </EuiBadge>
                    );
                  },
                },
              ]
            : []),
          {
            field: '',
            name: i18n.translate('xpack.fleet.epm.packageDetails.integrationList.actions', {
              defaultMessage: 'Actions',
            }),
            width: '8ch',
            align: 'right' as HorizontalAlignment,
            render({
              agentPolicies,
              packagePolicy,
            }: {
              agentPolicies: AgentPolicy[];
              packagePolicy: InMemoryPackagePolicy;
            }) {
              const agentPolicy = agentPolicies[0]; // TODO: handle multiple agent policies
              const upgradeFrom = from || 'integrations-policy-list';
              return (
                <PackagePolicyActionsMenu
                  agentPolicies={agentPolicies}
                  packagePolicy={packagePolicy}
                  showAddAgent={true}
                  upgradePackagePolicyHref={
                    agentPolicy
                      ? `${getHref('upgrade_package_policy', {
                          policyId: agentPolicy.id,
                          packagePolicyId: packagePolicy.id,
                        })}?from=${upgradeFrom}`
                      : undefined
                  }
                  from={from}
                />
              );
            },
          },
        ]}
        tableCaption={i18n.translate(
          'xpack.fleet.epm.packageDetails.integrationList.agentlessPoliciesTableCaption',
          {
            defaultMessage: 'Agentless integration policies',
          }
        )}
        loading={isLoading}
        data-test-subj="integrationPolicyTable"
        pagination={{
          pageIndex: pagination.pagination.currentPage - 1,
          pageSize: pagination.pagination.pageSize,
          totalItemCount: packagePoliciesTotal,
          pageSizeOptions: pagination.pageSizeOptions,
        }}
        onChange={({ page }: { page: { index: number; size: number } }) => {
          pagination.setPagination({
            currentPage: page.index + 1,
            pageSize: page.size,
          });
        }}
        noItemsMessage={
          isLoading ? (
            <FormattedMessage
              id="xpack.fleet.epm.packageDetails.integrationList.loadingPoliciesMessage"
              defaultMessage="Loading integration policies…"
            />
          ) : (
            <FormattedMessage
              id="xpack.fleet.epm.packageDetails.integrationList.noAgentlessPoliciesMessage"
              defaultMessage="No agentless integration policies"
            />
          )
        }
      />
      {flyoutOpenForPolicyId && flyoutPackagePolicy && (
        <AgentlessEnrollmentFlyout
          onClose={() => {
            setFlyoutOpenForPolicyId(undefined);
            setFlyoutPackagePolicy(undefined);
            setFlyoutAgentPolicy(undefined);
          }}
          policyId={flyoutPackagePolicy.policy_ids[0]}
          policyName={flyoutPackagePolicy.name}
          // package is always set for agentless policies (createAgentlessPolicy);
          // optional only on the general PackagePolicy type.
          packageInfo={{
            name: flyoutPackagePolicy.package!.name,
            version: flyoutPackagePolicy.package!.version,
          }}
          selectedInput={getSelectedInput(flyoutPackagePolicy)}
          agentPolicy={flyoutAgentPolicy}
          connectors={getConnectorsFromPackagePolicy(flyoutPackagePolicy)}
        />
      )}
    </>
  );
};
