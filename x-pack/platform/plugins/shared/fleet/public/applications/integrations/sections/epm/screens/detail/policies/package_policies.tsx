/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Redirect, useLocation } from 'react-router-dom';
import {
  EuiAccordion,
  EuiFlexGroup,
  EuiFlexItem,
  EuiNotificationBadge,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import { FormattedMessage } from '@kbn/i18n-react';

import { InstallStatus } from '../../../../../types';
import type {
  AgentPolicy,
  GetAgentPoliciesResponseItem,
  InMemoryPackagePolicy,
  PackageInfo,
  PackagePolicy,
  PackagePolicyPackage,
} from '../../../../../types';
import {
  useLink,
  useGetPackageInstallStatus,
  AgentPolicyRefreshContext,
  useIsPackagePolicyUpgradable,
  usePagination,
} from '../../../../../hooks';
import { PACKAGE_POLICY_SAVED_OBJECT_TYPE } from '../../../../../constants';
import { SideBarColumn } from '../../../components/side_bar_column';

import { useAgentless } from '../../../../../../fleet/sections/agent_policy/create_package_policy_page/single_page_layout/hooks/setup_technology';

import { usePackagePoliciesWithAgentPolicy } from './use_package_policies_with_agent_policy';
import { AgentBasedPackagePoliciesTable } from './components/agent_based_table';
import { AgentlessPackagePoliciesTable } from './components/agentless_table';

export const PackagePoliciesPage = ({
  packageInfo,
  embedded,
}: {
  packageInfo: PackageInfo;
  embedded?: boolean;
}) => {
  const { name, version, type } = packageInfo;

  const { search } = useLocation();
  const queryParams = useMemo(() => new URLSearchParams(search), [search]);
  const addAgentToPolicyIdFromParams = useMemo(
    () => queryParams.get('addAgentToPolicyId'),
    [queryParams]
  );
  const showAddAgentHelpForPolicyId = useMemo(
    () => queryParams.get('showAddAgentHelpForPolicyId'),
    [queryParams]
  );
  const { getPath } = useLink();
  const getPackageInstallStatus = useGetPackageInstallStatus();
  const packageInstallStatus = getPackageInstallStatus(name);

  const {
    isPackagePolicyUpgradable,
    getPackagePolicyUpgradeReview,
    getKeepPoliciesUpToDate,
    getUpgradeVersion,
  } = useIsPackagePolicyUpgradable();
  const { getAgentlessStatusForPackage } = useAgentless();
  const canHaveAgentlessPolicies = useMemo(
    () => getAgentlessStatusForPackage(packageInfo).isAgentless,
    [getAgentlessStatusForPackage, packageInfo]
  );

  // Helper function to map raw policies data for consumption by the table
  const mapPoliciesData = useCallback(
    (
      {
        agentPolicies,
        packagePolicy,
      }: { agentPolicies: AgentPolicy[]; packagePolicy: PackagePolicy },
      index: number
    ): { agentPolicies: AgentPolicy[]; packagePolicy: InMemoryPackagePolicy; rowIndex: number } => {
      return {
        agentPolicies,
        packagePolicy: {
          ...packagePolicy,
          package: {
            ...(packagePolicy?.package as PackagePolicyPackage),
            type,
          },
          hasUpgrade: isPackagePolicyUpgradable(packagePolicy),
          upgradeVersion: getUpgradeVersion(packagePolicy),
          pendingUpgradeReview: getPackagePolicyUpgradeReview(packagePolicy),
          keepPoliciesUpToDate: getKeepPoliciesUpToDate(packagePolicy),
        },
        rowIndex: index,
      };
    },
    [
      isPackagePolicyUpgradable,
      getUpgradeVersion,
      getPackagePolicyUpgradeReview,
      getKeepPoliciesUpToDate,
      type,
    ]
  );

  // States and data for agent-based policies table
  // If agentless is not supported or not an agentless integration, skip the
  // conditional in the kuery
  const {
    pagination: agentBasedPagination,
    pageSizeOptions: agentBasedPageSizeOptions,
    setPagination: agentBasedSetPagination,
  } = usePagination();
  const [agentBasedPackageAndAgentPolicies, setAgentBasedPackageAndAgentPolicies] = useState<
    Array<{
      agentPolicies: GetAgentPoliciesResponseItem[];
      packagePolicy: InMemoryPackagePolicy;
      rowIndex: number;
    }>
  >([]);
  const {
    data: agentBasedData,
    isLoading: agentBasedIsLoading,
    resendRequest: refreshAgentBasedPolicies,
  } = usePackagePoliciesWithAgentPolicy({
    page: agentBasedPagination.currentPage,
    perPage: agentBasedPagination.pageSize,
    kuery: `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name: "${name}" ${
      canHaveAgentlessPolicies
        ? `AND NOT ${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.supports_agentless: true`
        : ``
    }`,
  });
  useEffect(() => {
    const mappedPoliciesData = !agentBasedData?.items
      ? []
      : agentBasedData.items.map(mapPoliciesData);
    setAgentBasedPackageAndAgentPolicies(mappedPoliciesData);
  }, [agentBasedData, mapPoliciesData]);

  // States and data for agentless policies table
  // If agentless is not supported or not an agentless integration, this block and
  // initial request is unnessary but reduces code complexity
  const {
    pagination: agentlessPagination,
    pageSizeOptions: agentlessPageSizeOptions,
    setPagination: agentlessSetPagination,
  } = usePagination();
  const [agentlessPackageAndAgentPolicies, setAgentlessPackageAndAgentPolicies] = useState<
    Array<{
      agentPolicies: GetAgentPoliciesResponseItem[];
      packagePolicy: InMemoryPackagePolicy;
      rowIndex: number;
    }>
  >([]);
  const {
    data: agentlessData,
    isLoading: agentlessIsLoading,
    resendRequest: refreshAgentlessPolicies,
  } = usePackagePoliciesWithAgentPolicy({
    page: agentlessPagination.currentPage,
    perPage: agentlessPagination.pageSize,
    kuery: `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name: "${name}" AND ${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.supports_agentless: true`,
  });
  useEffect(() => {
    setAgentlessPackageAndAgentPolicies(
      !agentlessData?.items ? [] : agentlessData.items.map(mapPoliciesData)
    );
  }, [agentlessData, mapPoliciesData]);

  // if they arrive at this page and the package is not installed, send them to overview
  // this happens if they arrive with a direct url or they uninstall while on this tab
  // Check `addAgentToPolicyIdFromParams` otherwise right after installing a new integration the flyout won't open
  if (
    packageInstallStatus &&
    packageInstallStatus.status !== InstallStatus.installed &&
    !addAgentToPolicyIdFromParams
  ) {
    return (
      <Redirect to={getPath('integration_details_overview', { pkgkey: `${name}-${version}` })} />
    );
  }

  return (
    <AgentPolicyRefreshContext.Provider
      value={{
        refresh: () => {
          refreshAgentBasedPolicies();
          refreshAgentlessPolicies();
        },
      }}
    >
      <EuiFlexGroup alignItems="flexStart">
        {embedded ? null : <SideBarColumn grow={1} />}
        <EuiFlexItem grow={7}>
          {!canHaveAgentlessPolicies ? (
            <AgentBasedPackagePoliciesTable
              isLoading={agentBasedIsLoading}
              packagePolicies={agentBasedPackageAndAgentPolicies}
              packagePoliciesTotal={agentBasedData?.total ?? 0}
              refreshPackagePolicies={refreshAgentBasedPolicies}
              pagination={{
                pagination: agentBasedPagination,
                pageSizeOptions: agentBasedPageSizeOptions,
                setPagination: agentBasedSetPagination,
              }}
              addAgentToPolicyIdFromParams={addAgentToPolicyIdFromParams}
              showAddAgentHelpForPolicyId={showAddAgentHelpForPolicyId}
              from={embedded ? 'installed-integrations' : undefined}
            />
          ) : (
            <>
              <EuiAccordion
                id="agentBasedAccordion"
                initialIsOpen={true}
                buttonContent={
                  <EuiFlexGroup
                    justifyContent="center"
                    alignItems="center"
                    gutterSize="s"
                    responsive={false}
                  >
                    <EuiFlexItem grow={false}>
                      <EuiText size="m">
                        <h4>
                          <FormattedMessage
                            id="xpack.fleet.epm.packageDetails.integrationList.agentlessHeader"
                            defaultMessage="Elastic Managed Integration"
                          />
                        </h4>
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiNotificationBadge color="subdued" size="m">
                        <h4>{agentlessData?.total ?? 0}</h4>
                      </EuiNotificationBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                }
              >
                <EuiSpacer size="m" />
                <EuiPanel hasBorder={true} hasShadow={false}>
                  <AgentlessPackagePoliciesTable
                    isLoading={agentlessIsLoading}
                    packagePolicies={agentlessPackageAndAgentPolicies}
                    packagePoliciesTotal={agentlessData?.total ?? 0}
                    refreshPackagePolicies={refreshAgentlessPolicies}
                    pagination={{
                      pagination: agentlessPagination,
                      pageSizeOptions: agentlessPageSizeOptions,
                      setPagination: agentlessSetPagination,
                    }}
                    from={embedded ? 'installed-integrations' : undefined}
                  />
                </EuiPanel>
              </EuiAccordion>
              <EuiSpacer size="l" />
              <EuiAccordion
                id="agentBasedAccordion"
                initialIsOpen={true}
                buttonContent={
                  <EuiFlexGroup
                    justifyContent="center"
                    alignItems="center"
                    gutterSize="s"
                    responsive={false}
                  >
                    <EuiFlexItem grow={false}>
                      <EuiText size="m">
                        <h4>
                          <FormattedMessage
                            id="xpack.fleet.epm.packageDetails.integrationList.agentBasedHeader"
                            defaultMessage="Agent-based"
                          />
                        </h4>
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiNotificationBadge color="subdued" size="m">
                        <h4>{agentBasedData?.total ?? 0}</h4>
                      </EuiNotificationBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                }
              >
                <EuiSpacer size="m" />
                <EuiPanel hasBorder={true} hasShadow={false}>
                  <AgentBasedPackagePoliciesTable
                    isLoading={agentBasedIsLoading}
                    packagePolicies={agentBasedPackageAndAgentPolicies}
                    packagePoliciesTotal={agentBasedData?.total ?? 0}
                    refreshPackagePolicies={refreshAgentBasedPolicies}
                    pagination={{
                      pagination: agentBasedPagination,
                      pageSizeOptions: agentBasedPageSizeOptions,
                      setPagination: agentBasedSetPagination,
                    }}
                    addAgentToPolicyIdFromParams={addAgentToPolicyIdFromParams}
                    showAddAgentHelpForPolicyId={showAddAgentHelpForPolicyId}
                    from={embedded ? 'installed-integrations' : undefined}
                  />
                </EuiPanel>
              </EuiAccordion>
            </>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </AgentPolicyRefreshContext.Provider>
  );
};
