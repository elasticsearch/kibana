/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import styled from 'styled-components';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiBottomBar,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCode,
  EuiErrorBoundary,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiOverlayMask,
  EuiSpacer,
  EuiSteps,
} from '@elastic/eui';
import type { EuiStepProps } from '@elastic/eui/src/components/steps/step';

import { useSpaceSettingsContext } from '../../../../../../hooks/use_space_settings_context';
import { SECRETS_MINIMUM_FLEET_SERVER_VERSION } from '../../../../../../../common/constants';

import {
  getNumTransformAssets,
  TransformInstallWithCurrentUserPermissionCallout,
} from '../../../../../../components/transform_install_as_current_user_callout';

import { useCancelAddPackagePolicy } from '../hooks';

import {
  checkIntegrationFipsLooseCompatibility,
  getInheritedNamespace,
  getRootPrivilegedDataStreams,
  isRootPrivilegesRequired,
} from '../../../../../../../common/services';
import type { NewAgentPolicy, PackagePolicyEditExtensionComponentProps } from '../../../../types';
import { SetupTechnology } from '../../../../types';
import { getAgentlessRelease } from '../../../../../../../common/services/agentless_policy_helper';
import {
  sendGetAgentStatus,
  useConfig,
  useFleetStatus,
  useGetPackageInfoByKeyQuery,
  useStartServices,
  useUIExtension,
  useAuthz,
  useBulkGetAgentPoliciesQuery,
} from '../../../../hooks';
import { useIncompatibleAgentVersionStatus } from '../../../../hooks/use_incompatible_agent_version_status';
import {
  DevtoolsRequestFlyoutButton,
  Error as ErrorComponent,
  ExtensionWrapper,
  Loading,
} from '../../../../components';

import {
  agentPolicyFormValidation,
  ConfirmDeployAgentPolicyModal,
  IncompatibleAgentVersionCallout,
} from '../../components';
import { ExperimentalFeaturesService, pkgKeyFromPackageInfo } from '../../../../services';

import type { CreatePackagePolicyParams } from '../types';

import {
  IntegrationBreadcrumb,
  SelectedPolicyTab,
  StepConfigurePackagePolicy,
  StepDefinePackagePolicy,
  StepSelectHosts,
} from '../components';

import {
  computeDefaultVarGroupSelections,
  type VarGroupSelection,
} from '../services/var_group_helpers';
import { applyNamespaceCustomizationChange } from '../services/apply_namespace_customization';

import { generateNewAgentPolicyWithDefaults } from '../../../../../../../common/services/generate_new_agent_policy';

import { packageHasAtLeastOneSecret } from '../utils';
import { CreatePackagePolicyFormProvider } from '../contexts/create_package_policy_form_context';

import { SetupTechnologySelector } from '../../../../../../services/setup_technology_selector';

import {
  AddIntegrationFlyoutConfigureHeader,
  CreatePackagePolicySinglePageLayout,
  PostInstallAddAgentModal,
} from './components';
import { useDevToolsRequest, useOnSubmit } from './hooks';
import { PostInstallCloudFormationModal } from './components/cloud_security_posture/post_install_cloud_formation_modal';
import { PostInstallGoogleCloudShellModal } from './components/cloud_security_posture/post_install_google_cloud_shell_modal';
import { PostInstallAzureArmTemplateModal } from './components/cloud_security_posture/post_install_azure_arm_template_modal';
import { RootPrivilegesCallout } from './root_callout';
import { useAgentless } from './hooks/setup_technology';

export const StepsWithLessPadding = styled(EuiSteps)`
  .euiStep__content {
    padding-top: ${(props) => props.theme.eui.euiSizeXS};
    padding-bottom: ${(props) => props.theme.eui.euiSizeM};
  }

  // compensating for EuiBottomBar hiding the content
  @media (max-width: ${(props) => props.theme.eui.euiBreakpoints.m}) {
    margin-bottom: 100px;
  }
`;

const CustomEuiBottomBar = styled(EuiBottomBar)`
  /* A relatively _low_ z-index value here to account for EuiComboBox popover that might appear under the bottom bar */
  z-index: 50;
`;

export const CreatePackagePolicySinglePage: CreatePackagePolicyParams = ({
  from,
  queryParamsPolicyId,
  prerelease,
  pkgName,
  pkgVersion,
  integration,
  pkgLabel,
  addIntegrationFlyoutProps,
  defaultPolicyData,
  noBreadcrumb,
}) => {
  const {
    agents: { enabled: isFleetEnabled },
  } = useConfig();
  const hasFleetAddAgentsPrivileges = useAuthz().fleet.addAgents;
  const fleetStatus = useFleetStatus();
  const { docLinks, notifications } = useStartServices();
  const spaceSettings = useSpaceSettingsContext();
  const [newAgentPolicy, setNewAgentPolicy] = useState<NewAgentPolicy>(
    generateNewAgentPolicyWithDefaults({
      name: 'Agent policy 1',
      namespace: spaceSettings.defaultNamespace,
    })
  );

  const [withSysMonitoring, setWithSysMonitoring] = useState<boolean>(true);
  /*
   * if there is no extension - will remain undefined
   * if there is an extension and it is loaded - will be set to true, otherwise false
   */
  const [isFleetExtensionLoaded, setIsFleetExtensionLoaded] = useState<boolean | undefined>(
    undefined
  );

  const validation = agentPolicyFormValidation(newAgentPolicy, {
    allowedNamespacePrefixes: spaceSettings.allowedNamespacePrefixes,
  });

  const [selectedPolicyTab, setSelectedPolicyTab] = useState<SelectedPolicyTab>(
    queryParamsPolicyId || (defaultPolicyData?.policy_ids?.length ?? 0) > 0
      ? SelectedPolicyTab.EXISTING
      : SelectedPolicyTab.NEW
  );

  const {
    data: packageInfoData,
    error: packageInfoError,
    isLoading: isPackageInfoLoading,
  } = useGetPackageInfoByKeyQuery(
    pkgName,
    pkgVersion,
    { full: true, prerelease },
    { enabled: !!pkgName }
  );
  const packageInfo = useMemo(() => {
    if (packageInfoData && packageInfoData.item) {
      return packageInfoData.item;
    }
  }, [packageInfoData]);

  const [agentCount, setAgentCount] = useState<number>(0);

  const [integrationToEnable, setIntegrationToEnable] = useState<string | undefined>(integration);
  const integrationInfo = useMemo(() => {
    return integrationToEnable
      ? packageInfo?.policy_templates?.find(
          (policyTemplate) => policyTemplate.name === integrationToEnable
        )
      : undefined;
  }, [integrationToEnable, packageInfo?.policy_templates]);

  const fipsCompatibleIntegration = useMemo(() => {
    return checkIntegrationFipsLooseCompatibility(pkgName, packageInfo);
  }, [packageInfo, pkgName]);

  const showSecretsDisabledCallout =
    !fleetStatus.isSecretsStorageEnabled &&
    packageInfo &&
    packageHasAtLeastOneSecret({ packageInfo });

  const isAddIntegrationFlyout = !!addIntegrationFlyoutProps;
  // Save package policy
  const {
    onSubmit,
    updatePackagePolicy,
    packagePolicy,
    agentPolicies,
    updateAgentPolicies,
    savedPackagePolicy,
    formState,
    setFormState,
    navigateAddAgent,
    navigateAddAgentHelp,
    setHasAgentPolicyError,
    validationResults,
    hasAgentPolicyError,
    isInitialized,
    handleSetupTechnologyChange,
    allowedSetupTechnologies,
    selectedSetupTechnology,
    defaultSetupTechnology,
    isAgentlessSelected,
    submitAttempted,
    createDatasetTemplates,
    setCreateDatasetTemplates,
  } = useOnSubmit({
    agentCount,
    packageInfo,
    newAgentPolicy,
    selectedPolicyTab,
    withSysMonitoring,
    queryParamsPolicyId,
    integrationToEnable,
    hasFleetAddAgentsPrivileges,
    setNewAgentPolicy,
    setSelectedPolicyTab,
    isAddIntegrationFlyout,
    defaultPolicyData,
  });

  if (addIntegrationFlyoutProps?.agentPolicy) {
    updateAgentPolicies([addIntegrationFlyoutProps?.agentPolicy]);
  }

  const setPolicyValidation = useCallback(
    (selectedTab: SelectedPolicyTab, updatedAgentPolicy: NewAgentPolicy) => {
      if (selectedTab === SelectedPolicyTab.NEW) {
        if (
          !updatedAgentPolicy.name ||
          updatedAgentPolicy.name.trim() === '' ||
          !updatedAgentPolicy.namespace ||
          updatedAgentPolicy.namespace.trim() === ''
        ) {
          setHasAgentPolicyError(true);
        } else {
          setHasAgentPolicyError(false);
        }
      }
    },
    [setHasAgentPolicyError]
  );

  // Derive var_group_selections from policy for StepConfigurePackagePolicy
  // Note: StepDefinePackagePolicy handles its own initialization and state management
  const { enableVarGroups } = ExperimentalFeaturesService.get();
  const varGroups =
    enableVarGroups && packageInfo?.var_groups ? packageInfo?.var_groups : undefined;
  const varGroupSelections = useMemo((): VarGroupSelection => {
    if (packagePolicy.var_group_selections) {
      return packagePolicy.var_group_selections;
    }
    return computeDefaultVarGroupSelections(varGroups, isAgentlessSelected);
  }, [packagePolicy.var_group_selections, varGroups, isAgentlessSelected]);

  const updateNewAgentPolicy = useCallback(
    (updatedFields: Partial<NewAgentPolicy>) => {
      const updatedAgentPolicy = {
        ...newAgentPolicy,
        ...updatedFields,
      };
      setNewAgentPolicy(updatedAgentPolicy);
      setPolicyValidation(selectedPolicyTab, updatedAgentPolicy);
    },
    [setNewAgentPolicy, setPolicyValidation, newAgentPolicy, selectedPolicyTab]
  );

  const updateSelectedPolicyTab = useCallback(
    (selectedTab: any) => {
      setSelectedPolicyTab(selectedTab);
      setPolicyValidation(selectedTab, newAgentPolicy);
    },
    [setSelectedPolicyTab, setPolicyValidation, newAgentPolicy]
  );

  // Namespace-level customization. Toggle state lives inside StepDefinePackagePolicy's hook;
  // the parent only tracks the latest value via ref for the deferred post-save update.
  const installedNamespaceCustomizationEnabledFor = useMemo(() => {
    if (packageInfo && 'installationInfo' in packageInfo) {
      return packageInfo.installationInfo?.namespace_customization_enabled_for ?? [];
    }
    return [];
  }, [packageInfo]);
  const namespaceCustomizationEnabledRef = useRef<boolean>(false);
  const namespaceCustomizationAppliedRef = useRef<string | undefined>(undefined);

  // After policy save: sync the package's namespace_customization_enabled_for list (deferred update).
  useEffect(() => {
    if (!savedPackagePolicy || !packageInfo) {
      return;
    }
    if (namespaceCustomizationAppliedRef.current === savedPackagePolicy.policy.id) {
      return;
    }
    namespaceCustomizationAppliedRef.current = savedPackagePolicy.policy.id;
    // Capture and reset the toggle value so stale state doesn't carry over if the form is reused.
    const wasEnabled = namespaceCustomizationEnabledRef.current;
    namespaceCustomizationEnabledRef.current = false;
    void applyNamespaceCustomizationChange(
      packageInfo.name,
      packageInfo.version,
      savedPackagePolicy.policy.namespace,
      wasEnabled,
      installedNamespaceCustomizationEnabledFor,
      notifications,
      packageInfo.title ?? packageInfo.name
    );
  }, [savedPackagePolicy, packageInfo, installedNamespaceCustomizationEnabledFor, notifications]);

  // Retrieve agent count
  const agentPolicyIds = agentPolicies.map((policy) => policy.id);

  const { cancelClickHandler, cancelUrl } = useCancelAddPackagePolicy({
    from,
    pkgkey: pkgVersion ? `${pkgName}-${pkgVersion}` : pkgName,
    agentPolicyId: agentPolicyIds[0],
  });
  useEffect(() => {
    const getAgentCount = async () => {
      let count = 0;
      for (const policyId of agentPolicyIds) {
        const { data } = await sendGetAgentStatus({ policyId });
        if (data?.results.active) {
          count += data.results.active;
        }
      }
      setAgentCount(count);
    };

    if (selectedPolicyTab === SelectedPolicyTab.NEW) {
      setAgentCount(0);
      return;
    }

    if (isFleetEnabled && agentPolicyIds.length > 0) {
      getAgentCount();
    }
  }, [agentPolicyIds, selectedPolicyTab, isFleetEnabled, agentPolicies]);

  const { data: agentPolicyData } = useBulkGetAgentPoliciesQuery(agentPolicyIds, { full: true });

  const fipsAgentsCount = useMemo(() => {
    if (!agentPolicyData?.items) return 0;

    return agentPolicyData.items.reduce((acc, item) => (acc += item.fips_agents || 0), 0);
  }, [agentPolicyData?.items]);

  const incompatibleAgentVersion = useIncompatibleAgentVersionStatus(
    packageInfo,
    agentPolicyData?.items
  );

  useEffect(() => {
    if (
      (integration || integrationToEnable) &&
      integrationToEnable !== integration &&
      addIntegrationFlyoutProps
    ) {
      setIntegrationToEnable(integration);
    }
  }, [integration, integrationToEnable, addIntegrationFlyoutProps]);

  useEffect(() => {
    if (addIntegrationFlyoutProps?.isSubmitted && formState !== 'LOADING') {
      setFormState('LOADING');
      onSubmit({ skipConfirmModal: true })
        .then(() => {
          addIntegrationFlyoutProps?.onSubmitCompleted();
        })
        .catch(() => {
          addIntegrationFlyoutProps?.onSubmitCompleted();
        })
        .finally(() => {
          addIntegrationFlyoutProps?.onSubmitCompleted();
        });
    }
  }, [addIntegrationFlyoutProps, onSubmit, setFormState, formState]);

  useEffect(() => {
    addIntegrationFlyoutProps?.updateHasErrors(
      Boolean(packageInfo && (formState === 'INVALID' || hasAgentPolicyError))
    );
  }, [packageInfo, formState, hasAgentPolicyError, addIntegrationFlyoutProps]);

  const handleExtensionViewOnChange = useCallback<
    PackagePolicyEditExtensionComponentProps['onChange']
  >(
    ({ isValid, updatedPolicy, isExtensionLoaded }) => {
      updatePackagePolicy(updatedPolicy);
      setIsFleetExtensionLoaded(isExtensionLoaded);

      if (isValid !== undefined) {
        setFormState(isValid ? 'VALID' : 'INVALID');
      }
    },
    [updatePackagePolicy, setFormState]
  );

  const { devtoolRequest, devtoolRequestDescription, showDevtoolsRequest } = useDevToolsRequest({
    newAgentPolicy,
    packagePolicy,
    selectedPolicyTab,
    withSysMonitoring,
    packageInfo,
    createDatasetTemplates,
  });

  const layoutProps = useMemo(
    () => ({
      from,
      cancelUrl,
      onCancel: cancelClickHandler,
      agentPolicies,
      packageInfo,
      integrationInfo,
      defaultPolicyData,
    }),
    [
      agentPolicies,
      cancelClickHandler,
      cancelUrl,
      from,
      integrationInfo,
      packageInfo,
      defaultPolicyData,
    ]
  );

  const stepSelectAgentPolicy = useMemo(
    () => (
      <StepSelectHosts
        agentPolicies={agentPolicies}
        updateAgentPolicies={updateAgentPolicies}
        newAgentPolicy={newAgentPolicy}
        updateNewAgentPolicy={updateNewAgentPolicy}
        withSysMonitoring={withSysMonitoring}
        updateSysMonitoring={(newValue) => setWithSysMonitoring(newValue)}
        validation={validation}
        packageInfo={packageInfo}
        setHasAgentPolicyError={setHasAgentPolicyError}
        updateSelectedTab={updateSelectedPolicyTab}
        selectedAgentPolicyIds={
          queryParamsPolicyId
            ? [queryParamsPolicyId]
            : defaultPolicyData?.policy_ids
            ? defaultPolicyData?.policy_ids
            : []
        }
      />
    ),
    [
      packageInfo,
      agentPolicies,
      updateAgentPolicies,
      newAgentPolicy,
      updateNewAgentPolicy,
      validation,
      withSysMonitoring,
      updateSelectedPolicyTab,
      queryParamsPolicyId,
      setHasAgentPolicyError,
      defaultPolicyData,
    ]
  );

  const numTransformAssets = useMemo(
    () => getNumTransformAssets(packageInfo?.assets),
    [packageInfo?.assets]
  );

  const extensionView = useUIExtension(packagePolicy.package?.name ?? '', 'package-policy-create');
  const replaceDefineStepView = useUIExtension(
    packagePolicy.package?.name ?? '',
    'package-policy-replace-define-step'
  );
  const createBottomExtensionView = useUIExtension(
    packagePolicy.package?.name ?? '',
    'package-policy-create-bottom'
  );

  // PLI auth blocks are registered to UI Extension context and are used to display upselling components.
  // Upselling components are rendered conditionally based on their availability from the PLI upselling service.
  const pliAuthBlockView = useUIExtension(packageInfo?.name ?? '', 'pli-auth-block');

  // If an auth block view is registered to the UI Extension context, we expect the registered component to return a React component when the PLI is not sufficient,
  // or simply a wrapper returning the children if the PLI is sufficient.
  const PliAuthBlockWrapper: React.FC<React.PropsWithChildren<{}>> = useMemo(
    () =>
      pliAuthBlockView?.Component && !isPackageInfoLoading
        ? pliAuthBlockView.Component
        : ({ children }: { children?: React.ReactNode }) => <>{children}</>, // when no UI Extension is registered, render children
    [isPackageInfoLoading, pliAuthBlockView?.Component]
  );

  if (replaceDefineStepView && extensionView) {
    throw new Error(
      "'package-policy-create' and 'package-policy-replace-define-step' cannot both be registered as UI extensions"
    );
  }
  const { getAgentlessStatusForPackage } = useAgentless();
  const { isAgentless, isDefaultDeploymentMode } = getAgentlessStatusForPackage(packageInfo);
  const enableSimplifiedAgentlessUX = ExperimentalFeaturesService.get().enableSimplifiedAgentlessUX;

  const useCheckableCardsForSetupTechnologySelector = useMemo(() => {
    return !replaceDefineStepView && enableSimplifiedAgentlessUX && isDefaultDeploymentMode;
  }, [replaceDefineStepView, enableSimplifiedAgentlessUX, isDefaultDeploymentMode]);

  const replaceStepConfigurePackagePolicy =
    replaceDefineStepView && packageInfo?.name ? (
      !isInitialized ? (
        <Loading />
      ) : (
        <ExtensionWrapper>
          <replaceDefineStepView.Component
            agentPolicies={agentPolicies}
            packageInfo={packageInfo}
            newPolicy={packagePolicy}
            onChange={handleExtensionViewOnChange}
            validationResults={validationResults}
            isEditPage={false}
            handleSetupTechnologyChange={handleSetupTechnologyChange}
            isAgentlessEnabled={isAgentless && !addIntegrationFlyoutProps}
            defaultSetupTechnology={defaultSetupTechnology}
            integrationToEnable={integrationToEnable}
            setIntegrationToEnable={setIntegrationToEnable}
          />
        </ExtensionWrapper>
      )
    ) : undefined;

  const setupTechnologySelector = useMemo(() => {
    if (!addIntegrationFlyoutProps && isAgentless && packageInfo) {
      const release = getAgentlessRelease(packageInfo, integrationToEnable);
      const showBetaBadge = release !== undefined && release !== 'ga';
      return (
        <SetupTechnologySelector
          disabled={false}
          packageInfo={packageInfo}
          allowedSetupTechnologies={allowedSetupTechnologies}
          setupTechnology={selectedSetupTechnology}
          onSetupTechnologyChange={handleSetupTechnologyChange}
          isAgentlessDefault={isDefaultDeploymentMode}
          showBetaBadge={showBetaBadge}
          useDescribedFormGroup={!useCheckableCardsForSetupTechnologySelector}
          useCheckableCards={useCheckableCardsForSetupTechnologySelector}
          hideTitle={useCheckableCardsForSetupTechnologySelector}
        />
      );
    }
    return null;
  }, [
    useCheckableCardsForSetupTechnologySelector,
    isAgentless,
    isDefaultDeploymentMode,
    integrationToEnable,
    addIntegrationFlyoutProps,
    allowedSetupTechnologies,
    selectedSetupTechnology,
    handleSetupTechnologyChange,
    packageInfo,
  ]);

  const stepConfigurePackagePolicy = useMemo(
    () =>
      isPackageInfoLoading || !isInitialized ? (
        <Loading />
      ) : packageInfo ? (
        <CreatePackagePolicyFormProvider
          value={{ createDatasetTemplates, setCreateDatasetTemplates }}
        >
          <StepDefinePackagePolicy
            namespacePlaceholder={getInheritedNamespace(
              agentPolicies,
              spaceSettings?.allowedNamespacePrefixes?.[0]
            )}
            packageInfo={packageInfo}
            packagePolicy={packagePolicy}
            updatePackagePolicy={updatePackagePolicy}
            validationResults={validationResults}
            submitAttempted={submitAttempted}
            isAgentlessSelected={isAgentlessSelected}
            agentPolicies={agentPolicies}
            onNamespaceCustomizationEnabledChange={(enabled) => {
              namespaceCustomizationEnabledRef.current = enabled;
            }}
          />

          {/* Show SetupTechnologySelector for all agentless integrations, including extension views, if agentless is default display as a separate step  */}
          {!useCheckableCardsForSetupTechnologySelector && setupTechnologySelector}

          {/* Only show the out-of-box configuration step if a UI extension is NOT registered */}
          {!extensionView && (
            <StepConfigurePackagePolicy
              packageInfo={packageInfo}
              showOnlyIntegration={integrationToEnable}
              packagePolicy={packagePolicy}
              updatePackagePolicy={updatePackagePolicy}
              validationResults={validationResults}
              submitAttempted={submitAttempted}
              isAgentlessSelected={isAgentlessSelected}
              varGroupSelections={varGroupSelections}
              bottomExtension={
                createBottomExtensionView && packagePolicy.package?.name ? (
                  <ExtensionWrapper>
                    <createBottomExtensionView.Component newPolicy={packagePolicy} />
                  </ExtensionWrapper>
                ) : undefined
              }
            />
          )}

          {/* If a package has been loaded, then show UI extension (if any) */}
          {extensionView && packagePolicy.package?.name && (
            <ExtensionWrapper>
              <extensionView.Component
                newPolicy={packagePolicy}
                onChange={handleExtensionViewOnChange}
              />
            </ExtensionWrapper>
          )}
        </CreatePackagePolicyFormProvider>
      ) : (
        <div />
      ),
    [
      isPackageInfoLoading,
      isInitialized,
      packageInfo,
      agentPolicies,
      spaceSettings?.allowedNamespacePrefixes,
      packagePolicy,
      updatePackagePolicy,
      validationResults,
      submitAttempted,
      extensionView,
      createBottomExtensionView,
      integrationToEnable,
      isAgentlessSelected,
      handleExtensionViewOnChange,
      varGroupSelections,
      setupTechnologySelector,
      useCheckableCardsForSetupTechnologySelector,
      createDatasetTemplates,
      setCreateDatasetTemplates,
    ]
  );

  const steps: EuiStepProps[] = [
    ...(addIntegrationFlyoutProps?.selectIntegrationStep
      ? [addIntegrationFlyoutProps?.selectIntegrationStep]
      : []),
    {
      title: i18n.translate('xpack.fleet.createPackagePolicy.stepConfigurePackagePolicyTitle', {
        defaultMessage: 'Configure integration',
      }),
      'data-test-subj': 'dataCollectionSetupStep',
      children: pkgName && (
        <>
          {addIntegrationFlyoutProps && (
            <AddIntegrationFlyoutConfigureHeader
              pkgLabel={pkgLabel}
              pkgName={pkgName}
              pkgVersion={packageInfo?.version}
              integration={integration}
            />
          )}
          {replaceStepConfigurePackagePolicy || stepConfigurePackagePolicy}
        </>
      ),
      headingElement: 'h2',
      status: !pkgName ? 'disabled' : undefined,
    },
    ...(useCheckableCardsForSetupTechnologySelector && setupTechnologySelector
      ? [
          {
            title: i18n.translate(
              'xpack.fleet.createPackagePolicy.stepSelectSetupTechnologyTitle',
              {
                defaultMessage: 'Deployment',
              }
            ),
            children: setupTechnologySelector,
            headingElement: 'h2',
          },
        ]
      : []),
    ...(selectedSetupTechnology !== SetupTechnology.AGENTLESS && !addIntegrationFlyoutProps
      ? [
          {
            title: i18n.translate('xpack.fleet.createPackagePolicy.stepSelectAgentPolicyTitle', {
              defaultMessage: 'Where to add this integration?',
            }),
            children: stepSelectAgentPolicy,
            headingElement: 'h2',
          },
        ]
      : []),
  ];

  // Display package error if there is one
  if (packageInfoError) {
    return (
      <ErrorComponent
        title={
          <FormattedMessage
            id="xpack.fleet.createPackagePolicy.StepSelectPolicy.errorLoadingPackageTitle"
            defaultMessage="Error loading package information"
          />
        }
        error={packageInfoError}
      />
    );
  }

  const rootPrivilegedDataStreams = packageInfo ? getRootPrivilegedDataStreams(packageInfo) : [];

  const children = (
    <>
      {packageInfo && isRootPrivilegesRequired(packageInfo) ? (
        <>
          <RootPrivilegesCallout dataStreams={rootPrivilegedDataStreams} />
          <EuiSpacer size="m" />
        </>
      ) : null}
      {numTransformAssets > 0 ? (
        <>
          <TransformInstallWithCurrentUserPermissionCallout count={numTransformAssets} />
          <EuiSpacer size="xl" />
        </>
      ) : null}
      {fipsAgentsCount > 0 && !fipsCompatibleIntegration && (
        <>
          <EuiCallOut
            announceOnMount={false}
            size="m"
            color="warning"
            iconType="warning"
            title={
              <FormattedMessage
                id="xpack.fleet.createPackagePolicy.fipsCalloutTitle"
                defaultMessage="This integration is not FIPS compatible"
              />
            }
          >
            <FormattedMessage
              id="xpack.fleet.createPackagePolicy.fipsCalloutDescription"
              defaultMessage="The selected agent policies have one or more agents enrolled in FIPS mode. Installing this integration could interfere with the agents' ability to ingest data correctly. For more information, see the {guideLink}."
              values={{
                guideLink: (
                  <EuiLink href={docLinks.links.fleet.fipsIngest} target="_blank" external>
                    <FormattedMessage
                      id="xpack.fleet.agentEnrollmentCallout.fipsMessage.guideLink"
                      defaultMessage="Guide"
                    />
                  </EuiLink>
                ),
              }}
            />
          </EuiCallOut>

          <EuiSpacer size="m" />
        </>
      )}

      {incompatibleAgentVersion.status !== 'NONE' && (
        <IncompatibleAgentVersionCallout
          incompatibility={incompatibleAgentVersion.status}
          versionCondition={incompatibleAgentVersion.versionCondition}
        />
      )}

      {showSecretsDisabledCallout && (
        <>
          <EuiCallOut
            announceOnMount
            size="m"
            color="warning"
            title={
              <FormattedMessage
                id="xpack.fleet.createPackagePolicy.secretsDisabledCalloutTitle"
                defaultMessage="Policy secrets are disabled"
              />
            }
          >
            <FormattedMessage
              id="xpack.fleet.createPackagePolicy.secretsDisabledCalloutDescription"
              defaultMessage="This integration contains {policySecretsLink}, but you have a Fleet Server running on a version earlier than {minimumSecretsVersion}. Please upgrade your Fleet Server to enable policy secrets for all integrations."
              values={{
                policySecretsLink: (
                  <EuiLink href={docLinks.links.fleet.policySecrets} target="_blank">
                    <FormattedMessage
                      id="xpack.fleet.createPackagePolicy.secretsDisabledCalloutDocsLink"
                      defaultMessage="policy secrets"
                    />
                  </EuiLink>
                ),
                minimumSecretsVersion: <EuiCode>{SECRETS_MINIMUM_FLEET_SERVER_VERSION}</EuiCode>,
              }}
            />
          </EuiCallOut>

          <EuiSpacer size="m" />
        </>
      )}
      <StepsWithLessPadding steps={steps} />
    </>
  );

  return !addIntegrationFlyoutProps ? (
    <CreatePackagePolicySinglePageLayout {...layoutProps} data-test-subj="createPackagePolicy">
      <Suspense fallback={<Loading />}>
        <PliAuthBlockWrapper>
          <EuiErrorBoundary>
            {formState === 'CONFIRM' && (
              <ConfirmDeployAgentPolicyModal
                agentCount={agentCount}
                agentPolicies={agentPolicies}
                onConfirm={onSubmit}
                onCancel={() => setFormState('VALID')}
              />
            )}
            {formState === 'SUBMITTED_NO_AGENTS' &&
              agentPolicies.length > 0 &&
              packageInfo &&
              savedPackagePolicy && (
                <PostInstallAddAgentModal
                  packageInfo={packageInfo}
                  onConfirm={() => navigateAddAgent(savedPackagePolicy)}
                  onCancel={() => navigateAddAgentHelp(savedPackagePolicy)}
                />
              )}
            {formState === 'SUBMITTED_AZURE_ARM_TEMPLATE' &&
              agentPolicies.length > 0 &&
              savedPackagePolicy?.type === 'packagePolicy' && (
                <PostInstallAzureArmTemplateModal
                  agentPolicy={agentPolicies[0]}
                  packagePolicy={savedPackagePolicy.policy}
                  onConfirm={() => navigateAddAgent(savedPackagePolicy)}
                  onCancel={() => navigateAddAgentHelp(savedPackagePolicy)}
                />
              )}
            {formState === 'SUBMITTED_CLOUD_FORMATION' &&
              agentPolicies.length > 0 &&
              savedPackagePolicy?.type === 'packagePolicy' && (
                <PostInstallCloudFormationModal
                  agentPolicy={agentPolicies[0]}
                  packagePolicy={savedPackagePolicy.policy}
                  onConfirm={() => navigateAddAgent(savedPackagePolicy)}
                  onCancel={() => navigateAddAgentHelp(savedPackagePolicy)}
                />
              )}
            {formState === 'SUBMITTED_GOOGLE_CLOUD_SHELL' &&
              agentPolicies.length > 0 &&
              savedPackagePolicy?.type === 'packagePolicy' && (
                <PostInstallGoogleCloudShellModal
                  agentPolicy={agentPolicies[0]}
                  packagePolicy={savedPackagePolicy.policy}
                  onConfirm={() => navigateAddAgent(savedPackagePolicy)}
                  onCancel={() => navigateAddAgentHelp(savedPackagePolicy)}
                />
              )}
            {packageInfo && !addIntegrationFlyoutProps && !noBreadcrumb && (
              <IntegrationBreadcrumb
                pkgTitle={integrationInfo?.title || packageInfo.title}
                pkgkey={pkgKeyFromPackageInfo(packageInfo)}
                integration={integrationInfo?.name}
              />
            )}
            {children}
            {formState === 'LOADING' ? (
              <EuiOverlayMask headerZindexLocation="below">
                <Loading />
              </EuiOverlayMask>
            ) : null}
            <EuiSpacer size="xl" />
            <EuiSpacer size="xl" />
            <CustomEuiBottomBar data-test-subj="integrationsBottomBar">
              <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                <EuiFlexItem grow={false}>
                  {packageInfo && (formState === 'INVALID' || hasAgentPolicyError) ? (
                    <FormattedMessage
                      id="xpack.fleet.createPackagePolicy.errorOnSaveText"
                      defaultMessage="Your integration policy has errors. Please fix them before saving."
                    />
                  ) : null}
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup gutterSize="s" justifyContent="flexEnd">
                    <EuiFlexItem grow={false}>
                      {/* eslint-disable-next-line @elastic/eui/href-or-on-click */}
                      <EuiButtonEmpty
                        color="text"
                        href={cancelUrl}
                        onClick={cancelClickHandler}
                        data-test-subj="createPackagePolicyCancelButton"
                      >
                        <FormattedMessage
                          id="xpack.fleet.createPackagePolicy.cancelButton"
                          defaultMessage="Cancel"
                        />
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                    {showDevtoolsRequest ? (
                      <EuiFlexItem grow={false}>
                        <DevtoolsRequestFlyoutButton
                          request={devtoolRequest}
                          description={devtoolRequestDescription}
                          btnProps={{
                            color: 'text',
                          }}
                        />
                      </EuiFlexItem>
                    ) : null}
                    <EuiFlexItem grow={false}>
                      <EuiButton
                        onClick={() => onSubmit()}
                        isLoading={formState === 'LOADING'}
                        disabled={
                          formState !== 'VALID' ||
                          hasAgentPolicyError ||
                          !validationResults ||
                          isFleetExtensionLoaded === false
                        }
                        iconType="save"
                        color="primary"
                        fill
                        data-test-subj="createPackagePolicySaveButton"
                      >
                        <FormattedMessage
                          id="xpack.fleet.createPackagePolicy.saveButton"
                          defaultMessage="Save and continue"
                        />
                      </EuiButton>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>
            </CustomEuiBottomBar>
          </EuiErrorBoundary>
        </PliAuthBlockWrapper>
      </Suspense>
    </CreatePackagePolicySinglePageLayout>
  ) : (
    children
  );
};
