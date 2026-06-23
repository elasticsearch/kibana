/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ReactEventHandler } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Redirect, useLocation, useParams, useHistory } from 'react-router-dom';
import { Routes, Route } from '@kbn/shared-ux-router';

import styled from 'styled-components';
import {
  EuiBadge,
  EuiCallOut,
  EuiDescriptionList,
  EuiDescriptionListDescription,
  EuiDescriptionListTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSelect,
  EuiSpacer,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import semverLt from 'semver/functions/lt';

import { getDeferredInstallationsCnt } from '../../../../../../services/has_deferred_installations';

import {
  isPackagePrerelease,
  splitPkgKey,
  packageToPackagePolicyInputs,
} from '../../../../../../../common/services';
import { getPackageReleaseLabel } from '../../../../../../../common/services/package_prerelease';
import {
  getAgentlessRelease,
  isOnlyAgentlessIntegration,
} from '../../../../../../../common/services/agentless_policy_helper';
import { HIDDEN_API_REFERENCE_PACKAGES } from '../../../../../../../common/constants';

import {
  useGetPackageInstallStatus,
  useSetPackageInstallStatus,
  useUIExtension,
  useBreadcrumbs,
  useStartServices,
  useAuthz,
  usePermissionCheckQuery,
  useIntegrationsStateContext,
  useGetSettingsQuery,
} from '../../../../hooks';
import { useAgentless } from '../../../../../fleet/sections/agent_policy/create_package_policy_page/single_page_layout/hooks/setup_technology';
import { INTEGRATIONS_ROUTING_PATHS } from '../../../../constants';
import { useGetPackageInfoByKeyQuery, useLink, useAgentPolicyContext } from '../../../../hooks';
import { ExperimentalFeaturesService, pkgKeyFromPackageInfo } from '../../../../services';
import type { PackageInfo } from '../../../../types';
import { InstallStatus } from '../../../../types';
import { Error, Loading, HeaderReleaseBadge } from '../../../../components';
import type { WithHeaderLayoutProps } from '../../../../layouts';
import { WithHeaderLayout } from '../../../../layouts';
import { SideBarColumn } from '../../components/side_bar_column';
import { PermissionsError } from '../../../../layouts';

import { wrapTitleWithDeprecated } from '../../components/utils';

import { DeferredAssetsWarning } from './assets/deferred_assets_warning';

import { getInstallPkgRouteOptions } from './utils';
import {
  BackLink,
  IntegrationPolicyCount,
  UpdateIcon,
  IconPanel,
  LoadingIconPanel,
  MiniIcon,
  AddIntegrationButton,
  AddIntegrationButtonDisabledReason,
  EditIntegrationButton,
} from './components';
import { ALERTING_ASSET_TYPES, AlertingPage } from './alerting';
import { AssetsPage } from './assets';
import { OverviewPage } from './overview';
import { PackagePoliciesPage } from './policies';
import { SettingsPage } from './settings';
import { CustomViewPage } from './custom';
import { DocumentationPage, hasDocumentation } from './documentation';
import { Configs } from './configs';

import type { InstallPkgRouteOptions } from './utils/get_install_route_options';
import { InstallButton } from './settings/install_button';
import { EditIntegrationFlyout } from './components/edit_integration_flyout';
import { ErrorIconPanel } from './components/icon_panel';

export type DetailViewPanelName =
  | 'overview'
  | 'policies'
  | 'assets'
  | 'alerting'
  | 'settings'
  | 'custom'
  | 'api-reference'
  | 'configs';

export interface DetailParams {
  pkgkey: string;
  panel?: DetailViewPanelName;
}
const CUSTOM_INTEGRATION_SOURCES = ['custom', 'upload'];
const Divider = styled.div`
  width: 0;
  height: 100%;
  border-left: ${(props) => props.theme.eui.euiBorderThin};
`;

// Allows child text to be truncated
const FlexItemWithMinWidth = styled(EuiFlexItem)`
  min-width: 0px;
`;

// to limit size of iconpanel, making the header too big
const FlexItemWithMaxHeight = styled(EuiFlexItem)`
  @media (min-width: 768px) {
    max-height: 60px;
  }
`;

function Breadcrumbs({ packageTitle }: { packageTitle: string }) {
  useBreadcrumbs('integration_details_overview', { pkgTitle: packageTitle });
  return null;
}

export function Detail() {
  const theme = useEuiTheme();
  const { getId: getAgentPolicyId } = useAgentPolicyContext();
  const { getFromIntegrations } = useIntegrationsStateContext();
  const { pkgkey, panel } = useParams<DetailParams>();
  const { getHref, getPath } = useLink();
  const history = useHistory();
  const { pathname, search, hash } = useLocation();
  const { getAgentlessStatusForPackage } = useAgentless();
  const queryParams = useMemo(() => new URLSearchParams(search), [search]);
  const integration = useMemo(() => queryParams.get('integration'), [queryParams]);
  const prerelease = useMemo(() => Boolean(queryParams.get('prerelease')), [queryParams]);
  /** Users from Security and Observability Solution onboarding pages will have returnAppId and returnPath
   ** in the query params to redirect back to the onboarding page after adding an integration
   */
  const returnAppId = useMemo(() => queryParams.get('returnAppId'), [queryParams]);
  const returnPath = useMemo(() => queryParams.get('returnPath'), [queryParams]);

  const authz = useAuthz();
  const canAddAgent = authz.fleet.addAgents;
  const canInstallPackages = authz.integrations.installPackages;
  const canReadPackageSettings = authz.integrations.readPackageSettings;
  const canReadIntegrationPolicies = authz.integrations.readIntegrationPolicies;

  const {
    data: permissionCheck,
    error: permissionCheckError,
    isLoading: isPermissionCheckLoading,
  } = usePermissionCheckQuery();
  const missingSecurityConfiguration =
    !permissionCheck?.success && permissionCheckError === 'MISSING_SECURITY';
  const userCanInstallPackages = canInstallPackages && permissionCheck?.success;

  const services = useStartServices();
  const agentPolicyIdFromContext = getAgentPolicyId();
  // edit readme state

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCustomPackage, setIsCustomPackage] = useState(false);

  // Package info state
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null);
  const setPackageInstallStatus = useSetPackageInstallStatus();
  const getPackageInstallStatus = useGetPackageInstallStatus();

  const CustomAssets = useUIExtension(packageInfo?.name ?? '', 'package-detail-assets');

  const packageInstallStatus = useMemo(() => {
    if (packageInfo === null || !packageInfo.name) {
      return undefined;
    }
    return getPackageInstallStatus(packageInfo?.name)?.status;
  }, [packageInfo, getPackageInstallStatus]);
  const isInstalled = useMemo(
    () =>
      packageInstallStatus === InstallStatus.installed ||
      packageInstallStatus === InstallStatus.reinstalling,
    [packageInstallStatus]
  );

  const updateAvailable =
    packageInfo &&
    'installationInfo' in packageInfo &&
    packageInfo.installationInfo?.version &&
    semverLt(packageInfo.installationInfo.version, packageInfo.latestVersion);

  const isViewingOldPackage =
    packageInfo && semverLt(packageInfo.version, packageInfo.latestVersion);

  const isViewingDifferentVersion =
    isInstalled &&
    packageInfo &&
    'installationInfo' in packageInfo &&
    packageInfo.installationInfo?.version &&
    packageInfo.version !== packageInfo.installationInfo.version;

  const isViewingUnavailableVersion = Boolean(
    isViewingDifferentVersion || (!isInstalled && isViewingOldPackage)
  );

  const addIntegrationDisabledReason: AddIntegrationButtonDisabledReason | undefined =
    isViewingUnavailableVersion
      ? isInstalled
        ? AddIntegrationButtonDisabledReason.VERSION_MISMATCH
        : AddIntegrationButtonDisabledReason.OUTDATED_VERSION
      : !userCanInstallPackages
      ? missingSecurityConfiguration
        ? AddIntegrationButtonDisabledReason.MISSING_SECURITY
        : AddIntegrationButtonDisabledReason.MISSING_PRIVILEGES
      : undefined;

  const [prereleaseIntegrationsEnabled, setPrereleaseIntegrationsEnabled] = React.useState<
    boolean | undefined
  >();

  const { data: settings, isInitialLoading: isSettingsInitialLoading } = useGetSettingsQuery({
    enabled: authz.fleet.readSettings,
  });

  useEffect(() => {
    const isEnabled = Boolean(settings?.item.prerelease_integrations_enabled) || prerelease;
    setPrereleaseIntegrationsEnabled(isEnabled);
  }, [settings?.item.prerelease_integrations_enabled, prerelease]);

  const { pkgName, pkgVersion } = splitPkgKey(pkgkey);
  // Fetch package info
  const {
    data: packageInfoData,
    error: packageInfoError,
    isLoading: packageInfoLoading,
    isFetchedAfterMount: packageInfoIsFetchedAfterMount,
    refetch: refetchPackageInfo,
  } = useGetPackageInfoByKeyQuery(
    pkgName,
    pkgVersion,
    {
      prerelease: prereleaseIntegrationsEnabled,
      withMetadata: true,
    },
    {
      enabled: !authz.fleet.readSettings || !isSettingsInitialLoading, // Load only after settings are loaded
      refetchOnMount: 'always',
    }
  );

  // The no-version endpoint returns the installed version when the package is installed,
  // not the latest available. Use packageInfo.latestVersion (always registry-sourced) as
  // the primary source for both GA and prerelease latest versions.

  // When prerelease is disabled, packageInfo.latestVersion is the latest GA.
  // When prerelease is enabled and a newer prerelease exists, packageInfo.latestVersion
  // is that prerelease — fall back to the GA query's latestVersion in that case.
  // Both queries use a specific version (pkgVersion from the URL) so the server returns
  // registry data rather than the installed version.
  const { data: packageInfoLatestGAData } = useGetPackageInfoByKeyQuery(
    pkgName,
    pkgVersion,
    { prerelease: false },
    { enabled: Boolean(pkgVersion), refetchOnMount: 'always' }
  );

  const { data: packageInfoLatestPrereleaseData } = useGetPackageInfoByKeyQuery(
    pkgName,
    pkgVersion,
    { prerelease: true },
    { enabled: Boolean(pkgVersion), refetchOnMount: 'always' }
  );

  const latestGAVersion = useMemo(() => {
    if (packageInfo?.latestVersion && !isPackagePrerelease(packageInfo.latestVersion)) {
      return packageInfo.latestVersion;
    }
    // packageInfo.latestVersion is a prerelease (prerelease enabled + newer prerelease exists):
    // use the GA query's latestVersion as fallback.
    const ver = packageInfoLatestGAData?.item?.latestVersion;
    if (ver && !isPackagePrerelease(ver)) {
      return ver;
    }
    return undefined;
  }, [packageInfo?.latestVersion, packageInfoLatestGAData?.item?.latestVersion]);

  const latestPrereleaseVersion = useMemo(() => {
    const ver = packageInfoLatestPrereleaseData?.item?.latestVersion;
    if (ver && isPackagePrerelease(ver)) {
      return ver;
    }
    return undefined;
  }, [packageInfoLatestPrereleaseData?.item?.latestVersion]);

  // Refresh package info when status change
  const [oldPackageInstallStatus, setOldPackageStatus] = useState(packageInstallStatus);

  useEffect(() => {
    if (oldPackageInstallStatus === 'installed' && packageInstallStatus === 'not_installed') {
      setOldPackageStatus(packageInstallStatus);
      refetchPackageInfo();
    }
    if (packageInstallStatus === 'not_installed') {
      setOldPackageStatus(packageInstallStatus);
    }
    if (oldPackageInstallStatus === 'not_installed' && packageInstallStatus === 'installed') {
      setOldPackageStatus(packageInstallStatus);
      refetchPackageInfo();
    }
  }, [packageInstallStatus, oldPackageInstallStatus, refetchPackageInfo]);

  const isLoading =
    packageInfoLoading || isPermissionCheckLoading || !packageInfoIsFetchedAfterMount;

  const showCustomTab =
    useUIExtension(packageInfoData?.item?.name ?? '', 'package-detail-custom') !== undefined;

  // Only show config tab if package has `inputs`
  const showConfigTab =
    canAddAgent && (packageInfo ? packageToPackagePolicyInputs(packageInfo).length > 0 : false);

  // Only show API references tab if it is allowed & has documentation to show
  const showDocumentationTab =
    !HIDDEN_API_REFERENCE_PACKAGES.includes(pkgName) &&
    packageInfo &&
    hasDocumentation({ packageInfo, integration });

  const { enableIntegrationInactivityAlerting } = ExperimentalFeaturesService.get();
  const hasArchiveAlertingAssets = Object.keys(packageInfo?.assets?.kibana ?? {}).some((type) =>
    (ALERTING_ASSET_TYPES as string[]).includes(type)
  );
  const pkgInstallationInfo =
    packageInfo && 'installationInfo' in packageInfo ? packageInfo.installationInfo : undefined;
  const hasInstalledAlertingAssets = (pkgInstallationInfo?.installed_kibana ?? []).some((asset) =>
    (ALERTING_ASSET_TYPES as string[]).includes(asset.type)
  );
  const showAlertingTab =
    hasArchiveAlertingAssets ||
    hasInstalledAlertingAssets ||
    (isInstalled && packageInfo?.type === 'integration' && enableIntegrationInactivityAlerting);

  // Track install status state
  useEffect(() => {
    if (packageInfoIsFetchedAfterMount && packageInfoData?.item) {
      const packageInfoResponse = packageInfoData.item;
      setPackageInfo(packageInfoResponse);
      setIsCustomPackage(
        (packageInfoResponse?.installationInfo?.install_source &&
          CUSTOM_INTEGRATION_SOURCES.includes(
            packageInfoResponse.installationInfo?.install_source
          )) ??
          false
      );
      let installedVersion;
      const { name } = packageInfoData.item;
      if ('installationInfo' in packageInfoResponse) {
        installedVersion = packageInfoResponse.installationInfo?.version;
      }
      const status: InstallStatus = packageInfoResponse?.status as any;
      if (name) {
        setPackageInstallStatus({ name, status, version: installedVersion || null });
      }
    }
  }, [packageInfoData, packageInfoIsFetchedAfterMount, setPackageInstallStatus, setPackageInfo]);

  const integrationInfo = useMemo(
    () =>
      integration
        ? packageInfo?.policy_templates?.find(
            (policyTemplate) => policyTemplate.name === integration
          )
        : undefined,
    [integration, packageInfo]
  );

  const fromIntegrations = getFromIntegrations();

  const fromIntegrationsPath =
    fromIntegrations === 'updates_available'
      ? getPath('integrations_installed_updates_available')
      : fromIntegrations === 'installed'
      ? getPath('integrations_installed')
      : getPath('integrations_all');

  const numOfDeferredInstallations = useMemo(
    () => getDeferredInstallationsCnt(packageInfo),
    [packageInfo]
  );

  const integrationName = integration ?? undefined;

  const releaseLabel = useMemo(() => {
    if (packageInfo && isOnlyAgentlessIntegration(packageInfo, integrationName)) {
      const release = getAgentlessRelease(packageInfo, integrationName);
      if (release !== undefined) return release;
    }
    return getPackageReleaseLabel(packageInfo?.version ?? '');
  }, [packageInfo, integrationName]);

  const headerLeftContent = useMemo(
    () => (
      <EuiFlexGroup direction="column" gutterSize="m" data-test-subj="headerLeft">
        <EuiFlexItem>
          {/* Allows button to break out of full width */}
          <div>
            <BackLink queryParams={queryParams} integrationsPath={fromIntegrationsPath} />
          </div>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="l">
            <FlexItemWithMaxHeight grow={false}>
              {packageInfoError ? (
                <ErrorIconPanel />
              ) : isLoading || !packageInfo ? (
                <LoadingIconPanel />
              ) : (
                <IconPanel
                  packageName={packageInfo.name}
                  integrationName={integrationInfo?.name}
                  version={packageInfo.version}
                  icons={integrationInfo?.icons || packageInfo.icons}
                />
              )}
            </FlexItemWithMaxHeight>
            <FlexItemWithMinWidth grow={true}>
              {packageInfo ? (
                <EuiFlexGroup direction="column" justifyContent="flexStart" gutterSize="xs">
                  <EuiFlexItem grow={false}>
                    <EuiText>
                      {/* Render space in place of package name while package info loads to prevent layout from jumping around */}
                      <h1>{wrapTitleWithDeprecated({ packageInfo, integrationInfo })}</h1>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiFlexGroup gutterSize="xs">
                      {packageInfo?.type === 'content' ? (
                        <EuiFlexItem grow={false}>
                          <EuiBadge color="default">
                            {i18n.translate('xpack.fleet.epm.contentPackageBadgeLabel', {
                              defaultMessage: 'Content only',
                            })}
                          </EuiBadge>
                        </EuiFlexItem>
                      ) : (
                        <EuiFlexItem grow={false}>
                          <EuiBadge color="default">
                            {i18n.translate('xpack.fleet.epm.elasticAgentBadgeLabel', {
                              defaultMessage: 'Elastic Agent',
                            })}
                          </EuiBadge>
                        </EuiFlexItem>
                      )}
                      {releaseLabel !== 'ga' ? (
                        <EuiFlexItem grow={false}>
                          <HeaderReleaseBadge release={releaseLabel} />
                        </EuiFlexItem>
                      ) : null}
                    </EuiFlexGroup>
                  </EuiFlexItem>
                </EuiFlexGroup>
              ) : null}
            </FlexItemWithMinWidth>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    [
      integrationInfo,
      isLoading,
      packageInfo,
      fromIntegrationsPath,
      queryParams,
      packageInfoError,
      releaseLabel,
    ]
  );

  const handleEditIntegrationClick = useCallback<ReactEventHandler>((ev) => {
    setIsEditOpen(true);
  }, []);
  const handleAddIntegrationPolicyClick = useCallback<ReactEventHandler>(
    (ev) => {
      ev.preventDefault();
      // The object below, given to `createHref` is explicitly accessing keys of `location` in order
      // to ensure that dependencies to this `useCallback` is set correctly (because `location` is mutable)
      const currentPath = history.createHref({
        pathname,
        search,
        hash,
      });

      const agentlessStatus = getAgentlessStatusForPackage(
        packageInfo ?? undefined,
        integration ?? undefined
      );

      const defaultNavigateOptions: InstallPkgRouteOptions = getInstallPkgRouteOptions({
        agentPolicyId: agentPolicyIdFromContext,
        currentPath,
        integration,
        pkgkey,
        prerelease,
        isAgentlessIntegration: agentlessStatus.isAgentless,
      });

      /** Users from Security and Observability Solution onboarding pages will have returnAppId and returnPath
       ** in the query params to redirect back to the onboarding page after adding an integration
       */
      const navigateOptions: InstallPkgRouteOptions =
        returnAppId && returnPath
          ? [
              defaultNavigateOptions[0],
              {
                ...defaultNavigateOptions[1],
                state: {
                  ...(defaultNavigateOptions[1]?.state ?? {}),
                  onCancelNavigateTo: [returnAppId, { path: returnPath }],
                  onCancelUrl: services.application.getUrlForApp(returnAppId, { path: returnPath }),
                  onSaveNavigateTo: [returnAppId, { path: returnPath }],
                },
              },
            ]
          : defaultNavigateOptions;

      services.application.navigateToApp(...navigateOptions);
    },
    [
      history,
      pathname,
      search,
      hash,
      agentPolicyIdFromContext,
      integration,
      pkgkey,
      prerelease,
      getAgentlessStatusForPackage,
      packageInfo,
      returnAppId,
      returnPath,
      services.application,
    ]
  );

  const installedVersion =
    packageInfo && 'installationInfo' in packageInfo
      ? packageInfo.installationInfo?.version
      : undefined;

  const versionOptions = useMemo(() => {
    const options: Array<{ value: string; text: string }> = [];
    if (latestPrereleaseVersion && latestPrereleaseVersion !== latestGAVersion) {
      options.push({ value: latestPrereleaseVersion, text: latestPrereleaseVersion });
    }
    if (latestGAVersion) {
      options.push({ value: latestGAVersion, text: latestGAVersion });
    }
    if (
      installedVersion &&
      installedVersion !== latestGAVersion &&
      installedVersion !== latestPrereleaseVersion
    ) {
      options.push({ value: installedVersion, text: installedVersion });
    }
    // Include the currently viewed version if it isn't already listed (e.g. old pinned URL)
    if (packageInfo?.version && !options.some((o) => o.value === packageInfo.version)) {
      options.push({ value: packageInfo.version, text: packageInfo.version });
    }
    return options;
  }, [latestPrereleaseVersion, latestGAVersion, installedVersion, packageInfo?.version]);

  const showVersionSelect = Boolean(latestGAVersion) && versionOptions.length > 1;

  const versionLabel = i18n.translate('xpack.fleet.epm.versionLabel', {
    defaultMessage: 'Version',
  });

  const onVersionChange = useCallback(
    (version: string, packageName: string) => {
      const path = getPath('integration_details_overview', {
        pkgkey: `${packageName}-${version}`,
      });
      history.push(path);
    },
    [getPath, history]
  );

  const headerRightContent = useMemo(
    () =>
      packageInfo ? (
        <>
          <EuiSpacer size="l" />
          <EuiFlexGroup justifyContent="flexEnd" direction="row">
            {[
              {
                label: showVersionSelect ? undefined : versionLabel,
                content: (
                  <EuiFlexGroup gutterSize="s" alignItems="center">
                    <EuiFlexItem>
                      {showVersionSelect ? (
                        <EuiSelect
                          data-test-subj="versionSelect"
                          prepend={versionLabel}
                          options={versionOptions}
                          value={packageInfo.version}
                          aria-label={versionLabel}
                          onChange={(event) =>
                            onVersionChange(event.target.value, packageInfo.name)
                          }
                        />
                      ) : (
                        <div data-test-subj="versionText">{packageInfo.version}</div>
                      )}
                    </EuiFlexItem>
                    {updateAvailable ? (
                      <EuiFlexItem grow={false}>
                        <UpdateIcon />
                      </EuiFlexItem>
                    ) : null}
                  </EuiFlexGroup>
                ),
              },
              ...(isInstalled && packageInfo.type !== 'content'
                ? [
                    { isDivider: true },
                    {
                      label: i18n.translate('xpack.fleet.epm.policiesCountLabel', {
                        defaultMessage: 'Policies',
                      }),
                      'data-test-subj': 'policyCount',
                      content: <IntegrationPolicyCount packageName={packageInfo.name} />,
                    },
                  ]
                : []),
              ...(packageInfo.type === 'content'
                ? !isInstalled
                  ? [{ isDivider: true }, { content: <InstallButton {...packageInfo} /> }]
                  : [] // if content package is already installed, don't show install button in header
                : [
                    { isDivider: true },
                    {
                      content: (
                        <EuiFlexGroup justifyContent="center" alignItems="center" gutterSize="s">
                          {isCustomPackage && (
                            <EuiFlexItem grow={false}>
                              <EditIntegrationButton
                                handleEditIntegrationClick={handleEditIntegrationClick}
                              />
                            </EuiFlexItem>
                          )}
                          <EuiFlexItem grow={false}>
                            <AddIntegrationButton
                              disabledReason={addIntegrationDisabledReason}
                              href={getHref('add_integration_to_policy', {
                                pkgkey,
                                ...(integration ? { integration } : {}),
                                ...(agentPolicyIdFromContext
                                  ? { agentPolicyId: agentPolicyIdFromContext }
                                  : {}),
                              })}
                              packageName={wrapTitleWithDeprecated({
                                packageInfo,
                                integrationInfo,
                              })}
                              onClick={handleAddIntegrationPolicyClick}
                            />
                          </EuiFlexItem>
                        </EuiFlexGroup>
                      ),
                    },
                  ]),
            ].map((item, index) => (
              <EuiFlexItem grow={false} key={index} data-test-subj={item['data-test-subj']}>
                {item.isDivider ?? false ? (
                  <Divider />
                ) : item.label ? (
                  <EuiDescriptionList className="eui-textRight" compressed textStyle="reverse">
                    <EuiDescriptionListTitle>{item.label}</EuiDescriptionListTitle>
                    <EuiDescriptionListDescription>{item.content}</EuiDescriptionListDescription>
                  </EuiDescriptionList>
                ) : (
                  item.content
                )}
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </>
      ) : undefined,
    [
      packageInfo,
      showVersionSelect,
      versionLabel,
      versionOptions,
      updateAvailable,
      isInstalled,
      isCustomPackage,
      handleEditIntegrationClick,
      addIntegrationDisabledReason,
      getHref,
      pkgkey,
      integration,
      agentPolicyIdFromContext,
      integrationInfo,
      handleAddIntegrationPolicyClick,
      onVersionChange,
    ]
  );

  const headerTabs = useMemo<WithHeaderLayoutProps['tabs']>(() => {
    if (!packageInfo) {
      return [];
    }
    const packageInfoKey = pkgKeyFromPackageInfo(packageInfo);
    const pathValues = {
      pkgkey: packageInfoKey,
      ...(integration ? { integration } : {}),
      ...(returnAppId ? { returnAppId } : {}),
      ...(returnPath ? { returnPath } : {}),
    };

    const tabs: WithHeaderLayoutProps['tabs'] = [
      {
        id: 'overview',
        name: (
          <FormattedMessage
            id="xpack.fleet.epm.packageDetailsNav.overviewLinkText"
            defaultMessage="Overview"
          />
        ),
        isSelected: panel === 'overview',
        'data-test-subj': `tab-overview`,
        href: getHref('integration_details_overview', pathValues),
      },
    ];

    if (canReadIntegrationPolicies && isInstalled && packageInfo.type !== 'content') {
      tabs.push({
        id: 'policies',
        name: (
          <FormattedMessage
            id="xpack.fleet.epm.packageDetailsNav.packagePoliciesLinkText"
            defaultMessage="Integration policies"
          />
        ),
        isSelected: panel === 'policies',
        'data-test-subj': `tab-policies`,
        href: getHref('integration_details_policies', pathValues),
      });
    }

    if (isInstalled && (packageInfo.assets || CustomAssets)) {
      tabs.push({
        id: 'assets',
        name: (
          <div style={{ display: 'flex', textAlign: 'center' }}>
            <FormattedMessage
              id="xpack.fleet.epm.packageDetailsNav.packageAssetsLinkText"
              defaultMessage="Assets"
            />
            &nbsp;
            {numOfDeferredInstallations > 0 ? (
              <DeferredAssetsWarning numOfDeferredInstallations={numOfDeferredInstallations} />
            ) : null}
          </div>
        ),
        isSelected: panel === 'assets',
        'data-test-subj': `tab-assets`,
        href: getHref('integration_details_assets', pathValues),
      });
    }

    if (isInstalled && showAlertingTab) {
      tabs.push({
        id: 'alerting',
        name: (
          <FormattedMessage
            id="xpack.fleet.epm.packageDetailsNav.packageAlertingLinkText"
            defaultMessage="Alerting"
          />
        ),
        isSelected: panel === 'alerting',
        'data-test-subj': `tab-alerting`,
        href: getHref('integration_details_alerting', pathValues),
      });
    }

    if (canReadPackageSettings) {
      tabs.push({
        id: 'settings',
        name: (
          <FormattedMessage
            id="xpack.fleet.epm.packageDetailsNav.settingsLinkText"
            defaultMessage="Settings"
          />
        ),
        isSelected: panel === 'settings',
        'data-test-subj': `tab-settings`,
        href: getHref('integration_details_settings', pathValues),
      });
    }

    if (canReadPackageSettings && showConfigTab) {
      tabs.push({
        id: 'configs',
        name: (
          <FormattedMessage
            id="xpack.fleet.epm.packageDetailsNav.configsText"
            defaultMessage="Configs"
          />
        ),
        isSelected: panel === 'configs',
        'data-test-subj': `tab-configs`,
        href: getHref('integration_details_configs', pathValues),
      });
    }

    if (canReadPackageSettings && showCustomTab) {
      tabs.push({
        id: 'custom',
        name: (
          <FormattedMessage
            id="xpack.fleet.epm.packageDetailsNav.packageCustomLinkText"
            defaultMessage="Advanced"
          />
        ),
        isSelected: panel === 'custom',
        'data-test-subj': `tab-custom`,
        href: getHref('integration_details_custom', pathValues),
      });
    }

    if (showDocumentationTab) {
      tabs.push({
        id: 'api-reference',
        name: (
          <FormattedMessage
            id="xpack.fleet.epm.packageDetailsNav.documentationLinkText"
            defaultMessage="API reference"
          />
        ),
        isSelected: panel === 'api-reference',
        'data-test-subj': `tab-api-reference`,
        href: getHref('integration_details_api_reference', pathValues),
      });
    }

    return tabs;
  }, [
    packageInfo,
    returnAppId,
    returnPath,
    panel,
    getHref,
    integration,
    canReadIntegrationPolicies,
    isInstalled,
    CustomAssets,
    canReadPackageSettings,
    showConfigTab,
    showCustomTab,
    showDocumentationTab,
    numOfDeferredInstallations,
    showAlertingTab,
  ]);

  const securityCallout = missingSecurityConfiguration ? (
    <>
      <EuiCallOut
        announceOnMount
        color="warning"
        iconType="lock"
        title={
          <FormattedMessage
            id="xpack.fleet.epm.packageDetailsSecurityRequiredCalloutTitle"
            defaultMessage="Security needs to be enabled in order to add Elastic Agent integrations"
          />
        }
      >
        <FormattedMessage
          id="xpack.fleet.epm.packageDetailsSecurityRequiredCalloutDescription"
          defaultMessage="In order to fully use Fleet, you must enable Elasticsearch and Kibana security features.
        Follow the {guideLink} to enable security."
          values={{
            guideLink: (
              <a href={services.http.basePath.prepend('/app/fleet')}>
                <FormattedMessage
                  id="xpack.fleet.epm.packageDetailsSecurityRequiredCalloutDescriptionGuideLink"
                  defaultMessage="steps in this guide"
                />
              </a>
            ),
          }}
        />
      </EuiCallOut>
      <EuiSpacer />
    </>
  ) : undefined;

  return (
    <WithHeaderLayout
      leftColumn={headerLeftContent}
      rightColumn={headerRightContent}
      rightColumnGrow={false}
      topContent={securityCallout}
      tabs={headerTabs}
      tabsCss={`
        margin-left: calc(${theme.euiTheme.size.base} * 6 + ${theme.euiTheme.size.xl} * 2 +
          ${theme.euiTheme.size.l});
      `}
    >
      {integrationInfo || packageInfo ? (
        <Breadcrumbs packageTitle={wrapTitleWithDeprecated({ packageInfo, integrationInfo })} />
      ) : null}
      {packageInfoError ? (
        <EuiFlexGroup alignItems="flexStart">
          <SideBarColumn grow={1} />
          <EuiFlexItem>
            <Error
              title={
                <FormattedMessage
                  id="xpack.fleet.epm.loadingIntegrationErrorTitle"
                  defaultMessage="Error loading integration details"
                />
              }
              error={packageInfoError.message}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : isLoading || !packageInfo ? (
        <Loading />
      ) : (
        <Routes>
          <Route path={INTEGRATIONS_ROUTING_PATHS.integration_details_overview}>
            <OverviewPage
              packageInfo={packageInfo}
              integrationInfo={integrationInfo}
              latestGAVersion={latestGAVersion}
            />
          </Route>
          <Route path={INTEGRATIONS_ROUTING_PATHS.integration_details_settings}>
            <SettingsPage
              packageInfo={packageInfo}
              packageMetadata={packageInfoData?.metadata}
              startServices={services}
              isCustomPackage={isCustomPackage}
              integrationInfo={integrationInfo}
            />
          </Route>
          <Route path={INTEGRATIONS_ROUTING_PATHS.integration_details_assets}>
            <AssetsPage packageInfo={packageInfo} refetchPackageInfo={refetchPackageInfo} />
          </Route>
          <Route path={INTEGRATIONS_ROUTING_PATHS.integration_details_alerting}>
            <AlertingPage packageInfo={packageInfo} refetchPackageInfo={refetchPackageInfo} />
          </Route>
          <Route path={INTEGRATIONS_ROUTING_PATHS.integration_details_configs}>
            <Configs packageInfo={packageInfo} />
          </Route>
          <Route path={INTEGRATIONS_ROUTING_PATHS.integration_details_policies}>
            {canReadIntegrationPolicies ? (
              <PackagePoliciesPage packageInfo={packageInfo} />
            ) : (
              <PermissionsError
                error="MISSING_PRIVILEGES"
                requiredFleetRole="Agent Policies Read and Integrations Read"
                callingApplication="Integrations"
              />
            )}
          </Route>
          <Route path={INTEGRATIONS_ROUTING_PATHS.integration_details_custom}>
            <CustomViewPage packageInfo={packageInfo} />
          </Route>
          <Route path={INTEGRATIONS_ROUTING_PATHS.integration_details_api_reference}>
            <DocumentationPage packageInfo={packageInfo} integration={integrationInfo?.name} />
          </Route>
          <Redirect to={INTEGRATIONS_ROUTING_PATHS.integration_details_overview} />
        </Routes>
      )}
      {isEditOpen && (
        <EditIntegrationFlyout
          integrationName={wrapTitleWithDeprecated({
            packageInfo,
            integrationInfo,
            defaultTitle: 'Integration',
          })}
          onClose={() => setIsEditOpen(false)}
          packageInfo={packageInfo}
          setIsEditOpen={setIsEditOpen}
          integration={integration}
          services={services}
          existingCategories={packageInfo?.categories ?? []}
          onComplete={(urlParts) => {
            const path = getPath('integration_details_overview', urlParts);
            history.push(path);
          }}
          miniIcon={
            isLoading || !packageInfo ? (
              <Loading />
            ) : (
              <MiniIcon
                packageName={packageInfo?.name}
                integrationName={integrationInfo?.name}
                version={packageInfo?.version}
                icons={integrationInfo?.icons || packageInfo?.icons}
              />
            )
          }
        />
      )}
    </WithHeaderLayout>
  );
}
