/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { isEqual, pick } from 'lodash';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiLink } from '@elastic/eui';

import { validateAgentConditionExpression } from '@kbn/elastic-agent-condition-language';

import { toNewAgentlessPolicy } from '../../../../../../../../common/services';

import { sendCreateAgentlessPolicy } from '../../../../../../../hooks/use_request/agentless_policy';

import {
  AgentlessAgentCreateFleetUnreachableError,
  AgentlessAgentCreateOverProvisionedError,
} from '../../../../../../../../common/errors';
import { useSpaceSettingsContext } from '../../../../../../../hooks/use_space_settings_context';
import type { CloudProvider } from '../../../../../types';
import {
  type AgentPolicy,
  type NewPackagePolicy,
  type NewAgentPolicy,
  type CreatePackagePolicyRequest,
  type PackageInfo,
  SetupTechnology,
} from '../../../../../types';
import {
  useStartServices,
  sendCreateAgentPolicy,
  sendBulkInstallPackages,
  sendGetPackagePolicies,
  useMultipleAgentPolicies,
  useFleetStatus,
  sendCreatePackagePolicyForRq,
} from '../../../../../hooks';
import {
  isVerificationError,
  packageToPackagePolicy,
  ExperimentalFeaturesService,
} from '../../../../../services';
import {
  FLEET_ELASTIC_AGENT_PACKAGE,
  FLEET_SYSTEM_PACKAGE,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  SO_SEARCH_LIMIT,
} from '../../../../../../../../common';
import { getMaxPackageName } from '../../../../../../../../common/services';
import { isInputAllowedForDeploymentMode } from '../../../../../../../../common/services/agentless_policy_helper';
import { useConfirmForceInstall } from '../../../../../../integrations/hooks';
import { detectTargetCsp } from '../../../../../../../../common/services/cloud_connectors';
import {
  validatePackagePolicy,
  validationHasErrors,
  isInputVisibleForVarGroupSelections,
} from '../../services';
import type { PackagePolicyValidationResults } from '../../services';
import type { PackagePolicyFormState, SavedPolicyResult } from '../../types';
import type { RegistryVarGroup } from '../../../../../types';
import { SelectedPolicyTab } from '../../components';
import { useOnSaveNavigate } from '../../hooks';
import { prepareInputPackagePolicyDataset } from '../../services/prepare_input_pkg_policy_dataset';
import {
  getAzureArmPropsFromPackagePolicy,
  getCloudFormationPropsFromPackagePolicy,
  getCloudShellUrlFromPackagePolicy,
} from '../../../../../../../components/cloud_security_posture/services';
import { ensurePackageKibanaAssetsInstalled } from '../../../../../services/ensure_kibana_assets_installed';
import { useYaml } from '../../../../../../../services';

import { useAgentless, useSetupTechnology } from './setup_technology';

const DEFAULT_AGENTLESS_LIMIT = 50;

export async function createAgentPolicy({
  packagePolicy,
  newAgentPolicy,
  withSysMonitoring,
}: {
  packagePolicy: NewPackagePolicy;
  newAgentPolicy: NewAgentPolicy;
  withSysMonitoring: boolean;
}): Promise<AgentPolicy> {
  // do not create agent policy with system integration if package policy already is for system package
  const packagePolicyIsSystem = packagePolicy?.package?.name === FLEET_SYSTEM_PACKAGE;
  const resp = await sendCreateAgentPolicy(newAgentPolicy, {
    withSysMonitoring: withSysMonitoring && !packagePolicyIsSystem,
  });
  if (resp.error) {
    throw resp.error;
  }
  if (!resp.data) {
    throw new Error('Invalid agent policy creation no data');
  }
  return resp.data.item;
}

export const createAgentPolicyIfNeeded = async ({
  selectedPolicyTab,
  withSysMonitoring,
  newAgentPolicy,
  packagePolicy,
  packageInfo,
}: {
  selectedPolicyTab: SelectedPolicyTab;
  withSysMonitoring: boolean;
  newAgentPolicy: NewAgentPolicy;
  packagePolicy: NewPackagePolicy;
  packageInfo?: PackageInfo;
}): Promise<AgentPolicy | undefined> => {
  if (selectedPolicyTab === SelectedPolicyTab.NEW) {
    if ((withSysMonitoring || newAgentPolicy.monitoring_enabled?.length) ?? 0 > 0) {
      const packagesToPreinstall: Array<string | { name: string; version: string }> = [];
      // skip preinstall of input package, to be able to rollback when package policy creation fails
      if (packageInfo && packageInfo.type !== 'input') {
        packagesToPreinstall.push({ name: packageInfo.name, version: packageInfo.version });
      }
      if (withSysMonitoring) {
        packagesToPreinstall.push(FLEET_SYSTEM_PACKAGE);
      }
      if (newAgentPolicy.monitoring_enabled?.length ?? 0 > 0) {
        packagesToPreinstall.push(FLEET_ELASTIC_AGENT_PACKAGE);
      }

      if (packagesToPreinstall.length > 0) {
        await sendBulkInstallPackages([...new Set(packagesToPreinstall)]);
      }
    }

    // Skip policy creation for agentless as it's done through agentless_policies API
    if (newAgentPolicy.supports_agentless) {
      return;
    }

    return await createAgentPolicy({
      newAgentPolicy,
      packagePolicy,
      withSysMonitoring,
    });
  }
};

async function savePackagePolicy(
  pkgPolicy: CreatePackagePolicyRequest['body'],
  varGroups?: RegistryVarGroup[]
): Promise<SavedPolicyResult> {
  const { policy, forceCreateNeeded } = await prepareInputPackagePolicyDataset(pkgPolicy);

  // If agentless use agentless policies API
  if (policy.supports_agentless) {
    const agentlessRequestBody = toNewAgentlessPolicy(pkgPolicy as NewPackagePolicy, varGroups);
    const { item } = await sendCreateAgentlessPolicy(agentlessRequestBody);
    return { type: 'agentless', policy: item };
  }

  const { item } = await sendCreatePackagePolicyForRq({
    ...policy,
    ...(forceCreateNeeded && { force: true }),
  });

  return { type: 'packagePolicy', policy: item };
}

// Update the agentless policy with cloud connector info in the new agent policy when the package policy input `aws.support_cloud_connectors is updated
export const updateAgentlessCloudConnectorConfig = (
  packagePolicy: NewPackagePolicy,
  newAgentPolicy: NewAgentPolicy,
  setNewAgentPolicy: (policy: NewAgentPolicy) => void,
  setPackagePolicy: (policy: NewPackagePolicy) => void,
  varGroups?: RegistryVarGroup[]
) => {
  const targetCsp = detectTargetCsp(packagePolicy, varGroups);

  // Making sure that the cloud connector is disabled when switching to GCP or unsupported provider
  if (
    !targetCsp &&
    (newAgentPolicy.agentless?.cloud_connectors || packagePolicy.supports_cloud_connector)
  ) {
    setNewAgentPolicy({
      ...newAgentPolicy,
      agentless: {
        ...newAgentPolicy.agentless,
        cloud_connectors: undefined,
      },
    });

    setPackagePolicy({
      ...packagePolicy,
      supports_cloud_connector: false,
    });
    return;
  }

  const cloudConnectorPolicyEnabled: boolean = !!packagePolicy.supports_cloud_connector;
  const cloudConnectorPolicyMismatch =
    newAgentPolicy.agentless?.cloud_connectors?.enabled !== cloudConnectorPolicyEnabled;

  if (
    targetCsp &&
    newAgentPolicy?.supports_agentless &&
    (cloudConnectorPolicyMismatch ||
      newAgentPolicy.agentless?.cloud_connectors?.target_csp !== targetCsp)
  ) {
    setNewAgentPolicy({
      ...newAgentPolicy,
      agentless: {
        ...newAgentPolicy.agentless,
        cloud_connectors: {
          enabled: cloudConnectorPolicyEnabled,
          target_csp: targetCsp as CloudProvider,
        },
      },
    });

    setPackagePolicy({
      ...packagePolicy,
      supports_cloud_connector: cloudConnectorPolicyEnabled,
    });
  }
};

const DEFAULT_PACKAGE_POLICY = {
  name: '',
  description: '',
  namespace: '',
  policy_id: '',
  policy_ids: [''],
  enabled: true,
  inputs: [],
};

export function useOnSubmit({
  agentCount,
  selectedPolicyTab,
  newAgentPolicy,
  withSysMonitoring,
  queryParamsPolicyId,
  packageInfo,
  integrationToEnable,
  hasFleetAddAgentsPrivileges,
  setNewAgentPolicy,
  setSelectedPolicyTab,
  isAddIntegrationFlyout,
  defaultPolicyData,
}: {
  packageInfo?: PackageInfo;
  newAgentPolicy: NewAgentPolicy;
  withSysMonitoring: boolean;
  selectedPolicyTab: SelectedPolicyTab;
  agentCount: number;
  queryParamsPolicyId: string | undefined;
  integrationToEnable?: string;
  hasFleetAddAgentsPrivileges: boolean;
  setNewAgentPolicy: (policy: NewAgentPolicy) => void;
  setSelectedPolicyTab: (tab: SelectedPolicyTab) => void;
  isAddIntegrationFlyout?: boolean;
  defaultPolicyData?: Partial<NewPackagePolicy>;
}) {
  const { notifications, docLinks } = useStartServices();
  const { spaceId } = useFleetStatus();
  const yaml = useYaml();
  const confirmForceInstall = useConfirmForceInstall();
  const spaceSettings = useSpaceSettingsContext();
  const { canUseMultipleAgentPolicies } = useMultipleAgentPolicies();
  const { enableVarGroups } = ExperimentalFeaturesService.get();
  const varGroups =
    enableVarGroups && packageInfo?.var_groups ? packageInfo?.var_groups : undefined;

  // only used to store the resulting policy (package or agentless) once saved
  const [savedPackagePolicy, setSavedPackagePolicy] = useState<SavedPolicyResult>();
  // Create dataset templates toggle (checked/recommended by default)
  const [createDatasetTemplates, setCreateDatasetTemplates] = useState<boolean>(true);
  // Form state
  const [formState, setFormState] = useState<PackagePolicyFormState>('VALID');
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Used to render extension components only when package policy is initialized
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const isFetchingBasePackage = useRef<boolean>(false);

  const [agentPolicies, setAgentPolicies] = useState<AgentPolicy[]>([]);
  // New package policy state
  const [packagePolicy, setPackagePolicy] = useState<NewPackagePolicy>({
    ...DEFAULT_PACKAGE_POLICY,
  });
  const [integration, setIntegration] = useState<string | undefined>(integrationToEnable);

  // Validation state
  const [validationResults, setValidationResults] = useState<PackagePolicyValidationResults>();
  const [hasAgentPolicyError, setHasAgentPolicyError] = useState<boolean>(false);

  const { getAgentlessStatusForPackage, isAgentlessAgentPolicy } = useAgentless();

  const hasErrors = validationResults ? validationHasErrors(validationResults) : false;

  // Update agent policy method
  const updateAgentPolicies = useCallback(
    (updatedAgentPolicies: AgentPolicy[]) => {
      if (isEqual(updatedAgentPolicies, agentPolicies)) {
        return;
      }

      setAgentPolicies(updatedAgentPolicies);
      if (packageInfo) {
        setHasAgentPolicyError(false);
      }
    },
    [packageInfo, agentPolicies]
  );
  // Update package policy validation
  const updatePackagePolicyValidation = useCallback(
    (newPackagePolicy?: NewPackagePolicy) => {
      if (packageInfo && yaml) {
        const newValidationResult = validatePackagePolicy(
          newPackagePolicy || packagePolicy,
          packageInfo,
          { safeLoadYaml: yaml.parse, conditionValidator: validateAgentConditionExpression },
          spaceSettings
        );
        setValidationResults(newValidationResult);

        return newValidationResult;
      }
    },
    [packagePolicy, packageInfo, spaceSettings, yaml]
  );
  // Update package policy method
  const updatePackagePolicy = useCallback(
    (updatedFields: Partial<NewPackagePolicy>) => {
      const newPackagePolicy = {
        ...packagePolicy,
        ...updatedFields,
      };
      setPackagePolicy(newPackagePolicy);

      const newValidationResults = updatePackagePolicyValidation(newPackagePolicy);
      const hasPackage = newPackagePolicy.package;
      const hasValidationErrors = newValidationResults
        ? validationHasErrors(newValidationResults)
        : false;
      const hasAgentPolicy =
        (newPackagePolicy.policy_ids.length > 0 && newPackagePolicy.policy_ids[0] !== '') ||
        selectedPolicyTab === SelectedPolicyTab.NEW;
      const isOrphaningPolicy =
        canUseMultipleAgentPolicies && newPackagePolicy.policy_ids.length === 0;
      if (hasPackage && (hasAgentPolicy || isOrphaningPolicy) && !hasValidationErrors) {
        setFormState('VALID');
      } else {
        setFormState('INVALID');
      }
    },
    [packagePolicy, updatePackagePolicyValidation, selectedPolicyTab, canUseMultipleAgentPolicies]
  );

  // Initial loading of package info
  useEffect(() => {
    async function init() {
      if (
        !packageInfo ||
        (packageInfo.name === packagePolicy.package?.name && integrationToEnable === integration)
      ) {
        return;
      }
      if (integrationToEnable !== integration) {
        setIntegration(integrationToEnable);
      }

      // Fetch all packagePolicies having the package name
      if (!isFetchingBasePackage.current) {
        // Prevent multiple calls to fetch base package
        isFetchingBasePackage.current = true;
        const { data: packagePolicyData } = await sendGetPackagePolicies({
          perPage: SO_SEARCH_LIMIT,
          page: 1,
          kuery: `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name:${packageInfo.name}`,
        });
        const incrementedName = getMaxPackageName(packageInfo.name, packagePolicyData?.items);

        const basePackagePolicy = packageToPackagePolicy(
          packageInfo,
          agentPolicies.map((policy) => policy.id),
          '',
          DEFAULT_PACKAGE_POLICY.name || incrementedName,
          DEFAULT_PACKAGE_POLICY.description,
          integrationToEnable
        );

        if (defaultPolicyData) {
          Object.assign(
            basePackagePolicy,
            pick(
              defaultPolicyData,
              'name',
              'description',
              'namespace',
              'policy_ids',
              'output_id',
              'cloud_connector_id',
              'cloud_connector_name',
              'inputs',
              'vars',
              'elasticsearch',
              'overrides',
              'supports_agentless',
              'supports_cloud_connector',
              'additional_datastreams_permissions'
            )
          );
        }

        // Set the package policy with the fetched package
        updatePackagePolicy(basePackagePolicy);
        setIsInitialized(true);
        isFetchingBasePackage.current = false;
      }
    }

    if (!isInitialized || isAddIntegrationFlyout) {
      // Fetch agent policies
      init();
    }
  }, [
    isFetchingBasePackage,
    packageInfo,
    agentPolicies,
    updatePackagePolicy,
    integrationToEnable,
    isInitialized,
    packagePolicy.package?.name,
    integration,
    setIntegration,
    isAddIntegrationFlyout,
    defaultPolicyData,
    setSelectedPolicyTab,
  ]);

  useEffect(() => {
    if (
      (canUseMultipleAgentPolicies || agentPolicies.length > 0) &&
      !isEqual(
        agentPolicies.map((policy) => policy.id),
        packagePolicy.policy_ids
      )
    ) {
      updatePackagePolicy({
        policy_ids: agentPolicies.map((policy) => policy.id),
      });
    }
  }, [packagePolicy, agentPolicies, updatePackagePolicy, canUseMultipleAgentPolicies]);

  const {
    handleSetupTechnologyChange,
    allowedSetupTechnologies,
    selectedSetupTechnology,
    defaultSetupTechnology,
  } = useSetupTechnology({
    newAgentPolicy,
    setNewAgentPolicy,
    updatePackagePolicy,
    setSelectedPolicyTab,
    packageInfo,
    packagePolicy,
    integrationToEnable,
    hideAgentlessSelector: isAddIntegrationFlyout,
  });
  const setupTechnologyRef = useRef<SetupTechnology | undefined>(selectedSetupTechnology);
  // sync the inputs with the agentless selector change
  useEffect(() => {
    setupTechnologyRef.current = selectedSetupTechnology;
  });
  const prevSetupTechnology = setupTechnologyRef.current;
  const isAgentlessSelected =
    getAgentlessStatusForPackage(packageInfo).isAgentless &&
    selectedSetupTechnology === SetupTechnology.AGENTLESS;

  const newInputs = useMemo(() => {
    const varGroupSelections = packagePolicy.var_group_selections ?? {};

    // For single-input agentless integrations the simplified UX shows no enable/disable
    // toggle, so if the input is disabled by default the user has no way to enable it or
    // see any configuration fields.  Auto-enable it when switching to agentless.
    const inputs = packagePolicy.inputs ?? [];
    const agentlessAllowedInputCount = isAgentlessSelected
      ? inputs.filter((i) => isInputAllowedForDeploymentMode(i, 'agentless', packageInfo)).length
      : 0;
    const isSingleAgentlessInput = agentlessAllowedInputCount === 1;

    return inputs.map((input) => {
      const allowedForDeploymentMode = isInputAllowedForDeploymentMode(
        input,
        isAgentlessSelected ? 'agentless' : 'default',
        packageInfo
      );
      const visibleForVarGroup =
        !enableVarGroups ||
        isInputVisibleForVarGroupSelections(input, packageInfo, varGroupSelections);
      if (allowedForDeploymentMode && visibleForVarGroup) {
        if (isAgentlessSelected && !input.enabled && isSingleAgentlessInput) {
          return {
            ...input,
            enabled: true,
            streams: input.streams.map((stream) => ({ ...stream, enabled: true })),
          };
        }
        return input;
      }
      return { ...input, enabled: false };
    });
  }, [
    packagePolicy.inputs,
    packagePolicy.var_group_selections,
    isAgentlessSelected,
    packageInfo,
    enableVarGroups,
  ]);

  // Compare current vs desired input enabled states so the effect below only fires
  // when a var_group selection actually hides or reveals an input, preventing
  // infinite update loops from new array references.
  const inputsEnablingDiffer = useMemo(() => {
    const inputs = packagePolicy.inputs ?? [];
    if (inputs.length !== newInputs.length) return true;
    return inputs.some((input, i) => input.enabled !== newInputs[i]?.enabled);
  }, [packagePolicy.inputs, newInputs]);

  useEffect(() => {
    const shouldApplyInputs =
      prevSetupTechnology !== selectedSetupTechnology ||
      (varGroups?.length && inputsEnablingDiffer);
    if (shouldApplyInputs) {
      updatePackagePolicy({
        inputs: newInputs,
      });
    }
  }, [
    newInputs,
    prevSetupTechnology,
    selectedSetupTechnology,
    updatePackagePolicy,
    packagePolicy,
    inputsEnablingDiffer,
    varGroups?.length,
  ]);

  updateAgentlessCloudConnectorConfig(
    packagePolicy,
    newAgentPolicy,
    setNewAgentPolicy,
    setPackagePolicy,
    varGroups
  );

  const onSaveNavigate = useOnSaveNavigate({
    queryParamsPolicyId,
  });

  const navigateAddAgent = (policy: SavedPolicyResult) =>
    onSaveNavigate(policy, ['openEnrollmentFlyout']);

  const navigateAddAgentHelp = (policy: SavedPolicyResult) =>
    onSaveNavigate(policy, ['showAddAgentHelp']);

  const onSubmit = useCallback(
    async ({
      force,
      overrideCreatedAgentPolicy,
      skipConfirmModal,
    }: {
      overrideCreatedAgentPolicy?: AgentPolicy;
      force?: boolean;
      skipConfirmModal?: boolean;
    } = {}) => {
      setSubmitAttempted(true);
      if (formState === 'VALID' && hasErrors) {
        setFormState('INVALID');
        return;
      }
      if (
        (agentCount !== 0 ||
          (agentPolicies.length === 0 && selectedPolicyTab !== SelectedPolicyTab.NEW)) &&
        !(
          getAgentlessStatusForPackage(packageInfo).isAgentless ||
          isAgentlessAgentPolicy(overrideCreatedAgentPolicy)
        ) &&
        formState !== 'CONFIRM'
      ) {
        setFormState('CONFIRM');
        return;
      }

      let createdPolicy = overrideCreatedAgentPolicy;
      if (!overrideCreatedAgentPolicy) {
        try {
          setFormState('LOADING');
          const newPolicy = await createAgentPolicyIfNeeded({
            newAgentPolicy,
            packagePolicy,
            withSysMonitoring,
            packageInfo,
            selectedPolicyTab,
          });
          if (newPolicy) {
            createdPolicy = newPolicy;
            setAgentPolicies([createdPolicy]);
            updatePackagePolicy({ policy_ids: [createdPolicy.id] });
          }
        } catch (e) {
          setFormState('VALID');
          const agentlessPolicy = agentPolicies.find(
            (policy) => policy?.supports_agentless === true
          );

          if (e?.attributes?.type === AgentlessAgentCreateOverProvisionedError.name) {
            notifications.toasts.addError(e, {
              title: i18n.translate('xpack.fleet.createAgentlessPolicy.errorNotificationTitle', {
                defaultMessage: 'Unable to create integration',
              }),
              // @ts-expect-error
              toastMessage: (
                <>
                  <FormattedMessage
                    id="xpack.fleet.createAgentlessPolicy.overProvisionErrorMessage"
                    defaultMessage="You've reached the maximum number of {limit} agentless deployments. To add more, either remove or change some to Elastic Agent-based integrations. {docLink}"
                    values={{
                      limit: <b>{e?.attributes?.limit ?? DEFAULT_AGENTLESS_LIMIT}</b>,
                      docLink: (
                        <EuiLink href={docLinks.links.fleet.agentlessIntegrations} target="_blank">
                          <FormattedMessage
                            id="xpack.fleet.createAgentlessPolicy.seeDocLink"
                            defaultMessage="See agentless documentation."
                          />
                        </EuiLink>
                      ),
                    }}
                  />
                </>
              ),
            });
          }
          if (e?.attributes?.type === AgentlessAgentCreateFleetUnreachableError.name) {
            notifications.toasts.addError(e, {
              title: i18n.translate('xpack.fleet.createAgentlessPolicy.errorNotificationTitle', {
                defaultMessage: 'Unable to create integration',
              }),
              // @ts-expect-error
              toastMessage: (
                <>
                  <FormattedMessage
                    id="xpack.fleet.createAgentlessPolicy.FleetUnreachableErrorMessage"
                    defaultMessage="Fleet is not reachable and required to create agentless policy. Error: {errorMessage}. {docLink}"
                    values={{
                      errorMessage: e?.message ?? '',
                      docLink: (
                        <EuiLink href={docLinks.links.fleet.agentlessIntegrations} target="_blank">
                          <FormattedMessage
                            id="xpack.fleet.createAgentlessPolicy.seeDocLink"
                            defaultMessage="See agentless documentation."
                          />
                        </EuiLink>
                      ),
                    }}
                  />
                </>
              ),
            });
          } else {
            notifications.toasts.addError(e, {
              title: agentlessPolicy?.supports_agentless
                ? i18n.translate('xpack.fleet.createAgentlessPolicy.errorNotificationTitle', {
                    defaultMessage: 'Unable to create integration',
                  })
                : i18n.translate('xpack.fleet.createAgentPolicy.errorNotificationTitle', {
                    defaultMessage: 'Unable to create agent policy',
                  }),
            });
          }
          return;
        }
      }

      const agentPolicyIdToSave = createdPolicy?.id
        ? [createdPolicy?.id]
        : packagePolicy.policy_ids;

      const shouldForceInstallOnAgentless =
        isAgentlessAgentPolicy(createdPolicy) ||
        getAgentlessStatusForPackage(packageInfo).isAgentless;

      const forceInstall = force || shouldForceInstallOnAgentless;

      setFormState('LOADING');
      try {
        // passing pkgPolicy with policy_id here as setPackagePolicy doesn't propagate immediately
        const savedPolicyResult = await savePackagePolicy(
          {
            ...packagePolicy,
            policy_ids: agentPolicyIdToSave,
            force: forceInstall,
            create_dataset_templates: createDatasetTemplates,
          },
          varGroups
        );

        if (savedPolicyResult.policy.package) {
          await ensurePackageKibanaAssetsInstalled({
            currentSpaceId: spaceId ?? DEFAULT_SPACE_ID,
            pkgName: savedPolicyResult.policy.package.name,
            pkgVersion: savedPolicyResult.policy.package.version,
            toasts: notifications.toasts,
          });
        }
        const isAgentlessConfigured = createdPolicy
          ? isAgentlessAgentPolicy(createdPolicy)
          : savedPolicyResult.type === 'agentless';

        // Cloud template helpers expect a PackagePolicy with array-based inputs;
        // agentless policies use simplified inputs and never carry these templates.
        let hasAzureArmTemplate = false;
        let hasCloudFormation = false;
        let hasGoogleCloudShell = false;

        if (!isAgentlessConfigured && savedPolicyResult.type === 'packagePolicy') {
          hasAzureArmTemplate = Boolean(
            getAzureArmPropsFromPackagePolicy(savedPolicyResult.policy).templateUrl
          );
          hasCloudFormation = Boolean(
            getCloudFormationPropsFromPackagePolicy(savedPolicyResult.policy).templateUrl
          );
          hasGoogleCloudShell = Boolean(
            getCloudShellUrlFromPackagePolicy(savedPolicyResult.policy)
          );
        }

        if (hasFleetAddAgentsPrivileges && !isAgentlessConfigured && !skipConfirmModal) {
          if (agentCount) {
            setFormState('SUBMITTED');
          } else if (hasAzureArmTemplate) {
            setFormState('SUBMITTED_AZURE_ARM_TEMPLATE');
          } else if (hasCloudFormation) {
            setFormState('SUBMITTED_CLOUD_FORMATION');
          } else if (hasGoogleCloudShell) {
            setFormState('SUBMITTED_GOOGLE_CLOUD_SHELL');
          } else {
            setFormState('SUBMITTED_NO_AGENTS');
          }
        }
        setSavedPackagePolicy(savedPolicyResult);

        const promptForAgentEnrollment =
          (createdPolicy || (agentPolicies.length > 0 && !agentCount)) &&
          !isAgentlessConfigured &&
          hasFleetAddAgentsPrivileges;

        if (!skipConfirmModal) {
          if (promptForAgentEnrollment && hasAzureArmTemplate) {
            setFormState('SUBMITTED_AZURE_ARM_TEMPLATE');
            return;
          }
          if (promptForAgentEnrollment && hasCloudFormation) {
            setFormState('SUBMITTED_CLOUD_FORMATION');
            return;
          }
          if (promptForAgentEnrollment && hasGoogleCloudShell) {
            setFormState('SUBMITTED_GOOGLE_CLOUD_SHELL');
            return;
          }
          if (promptForAgentEnrollment) {
            setFormState('SUBMITTED_NO_AGENTS');
            return;
          }

          if (isAgentlessConfigured) {
            onSaveNavigate(savedPolicyResult, ['openEnrollmentFlyout']);
          } else {
            onSaveNavigate(savedPolicyResult);
          }
        }

        notifications.toasts.addSuccess({
          title: i18n.translate('xpack.fleet.createPackagePolicy.addedNotificationTitle', {
            defaultMessage: `''{packagePolicyName}'' integration added.`,
            values: {
              packagePolicyName: packagePolicy.name,
            },
          }),
          text: promptForAgentEnrollment
            ? i18n.translate('xpack.fleet.createPackagePolicy.addedNotificationMessage', {
                defaultMessage: `Fleet will deploy updates to all agents that use the ''{agentPolicyNames}'' policies.`,
                values: {
                  agentPolicyNames: agentPolicies.map((policy) => policy.name).join(', '),
                },
              })
            : undefined,
          'data-test-subj': 'packagePolicyCreateSuccessToast',
        });
      } catch (error) {
        if (isVerificationError(error)) {
          setFormState('VALID'); // don't show the add agent modal
          const forceInstallUnverifiedIntegration = await confirmForceInstall(
            packagePolicy.package!
          );

          if (forceInstallUnverifiedIntegration) {
            // skip creating the agent policy because it will have already been successfully created
            onSubmit({ overrideCreatedAgentPolicy: createdPolicy, force: true });
          }
          return;
        }
        notifications.toasts.addError(error, {
          title: 'Error',
        });
        setFormState('VALID');
      }
    },
    [
      formState,
      hasErrors,
      agentCount,
      agentPolicies,
      selectedPolicyTab,
      getAgentlessStatusForPackage,
      packageInfo,
      isAgentlessAgentPolicy,
      packagePolicy,
      newAgentPolicy,
      withSysMonitoring,
      updatePackagePolicy,
      notifications.toasts,
      docLinks.links.fleet.agentlessIntegrations,
      varGroups,
      hasFleetAddAgentsPrivileges,
      spaceId,
      onSaveNavigate,
      confirmForceInstall,
      createDatasetTemplates,
    ]
  );

  return {
    agentPolicies,
    updateAgentPolicies,
    packagePolicy,
    updatePackagePolicy,
    savedPackagePolicy,
    onSubmit,
    formState,
    setFormState,
    hasErrors,
    validationResults,
    setValidationResults,
    hasAgentPolicyError,
    setHasAgentPolicyError,
    isInitialized,
    // TODO check
    navigateAddAgent,
    navigateAddAgentHelp,
    handleSetupTechnologyChange,
    allowedSetupTechnologies,
    selectedSetupTechnology,
    defaultSetupTechnology,
    isAgentlessSelected,
    submitAttempted,
    createDatasetTemplates,
    setCreateDatasetTemplates,
  };
}
