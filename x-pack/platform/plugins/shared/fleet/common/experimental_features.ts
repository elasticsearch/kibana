/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const _allowedExperimentalValues = {
  showExperimentalShipperOptions: false,
  useSpaceAwareness: true,
  enableAutomaticAgentUpgrades: true,
  enableSyncIntegrationsOnRemote: true,
  enableSSLSecrets: true,
  installedIntegrationsTabularUI: true,
  enabledUpgradeAgentlessDeploymentsTask: true,
  enablePackageRollback: true,
  enableAutoInstallContentPackages: true,
  enableOtelIntegrations: true,
  enableAgentStatusAlerting: true,
  enableAgentPrivilegeLevelChange: true,
  installIntegrationsKnowledge: true,
  enableFleetPolicyRevisionsCleanupTask: true,
  enableAgentRollback: true, // When enabled, agent upgrade rollback will be available in the API and UI.
  disableAgentlessLegacyAPI: false, // When enabled, it will disable creating agentless policies via agent or package policies API.
  enableEsqlViewInstall: false,
  enableSloTemplates: true,
  newBrowseIntegrationUx: true, // When enabled integrations, browse integrations page will use the new UX.
  enableVersionSpecificPolicies: true, // When enabled, version specific policies will be created when packages use agent version conditions
  enableVarGroups: true, // When enabled, var_groups from the package spec drive conditional variable visibility and input filtering.
  enableIntegrationInactivityAlerting: true, // When enabled, an inactivity monitoring alerting rule template is created on fresh integration package install.
  enableSimplifiedAgentlessUX: true, // When enabled, the agentless deployment mode will be simplified for single input/datastreams integrations.
  enableOpAMP: true, // When enabled, OpAMP features will be available in the API and UI.
  enableOTelVerifier: true, // When enabled, OTel-based cloud connector permission verification is active.
  enableResolveDependencies: true, // When enabled, the resolve dependencies step will be available during package installation.
  enableOtelUI: false, // When enabled, OTel-specific UI elements (e.g. Collector Config tab) will be shown.
  enableCloudOnboardingDeployments: false, // When enabled, the cloud-onboarding-deployment CRUD API is registered and available.
};

/**
 * A list of allowed values that can be used in `xpack.fleet.enableExperimental` and `xpack.fleet.experimentalFeatures`.
 * This object is then used to validate and parse the value entered.
 */
export const allowedExperimentalValues = Object.freeze<
  Record<keyof typeof _allowedExperimentalValues, boolean>
>({ ..._allowedExperimentalValues });

export type ExperimentalFeatures = typeof allowedExperimentalValues;

type ExperimentalConfigKey = keyof ExperimentalFeatures;
type ExperimentalConfigKeys = ExperimentalConfigKey[];

const allowedKeys = Object.keys(allowedExperimentalValues) as Readonly<ExperimentalConfigKeys>;

/**
 * Parses two settings in kibana configuration:
 * 1. xpack.fleet.enableExperimental: an array of experimental values to enable
 * 2. xpack.fleet.experimentalFeatures: an object that associates a boolean to experimental values to enable or disable them
 *
 * The objective is to make xpack.fleet.experimentalFeatures the source of truth, while keeping
 * xpack.fleet.enableExperimental for backward compatibility.
 * In case of conflict, xpack.fleet.experimentalFeatures takes precedence over xpack.fleet.enableExperimental.
 *
 * @param enableExperimentalConfigValue the value of xpack.fleet.enableExperimental
 * @param experimentalFeaturesConfigValue the value of xpack.fleet.experimentalFeatures
 * @returns an object with experimental features and their boolean values
 */
export const parseExperimentalConfigValue = (
  enableExperimentalConfigValue: string[],
  experimentalFeaturesConfigValue: Partial<ExperimentalFeatures>
): ExperimentalFeatures => {
  return getUpdatedExperimentalFeatures(
    enableExperimentalConfigValue,
    experimentalFeaturesConfigValue,
    allowedExperimentalValues
  );
};

/**
 * Parses and merges two config values into a single object representing experimental features.
 * Made to be generic for easier testing.
 *
 * @param enableExperimentalConfigValue an array of strings that are experimental feature values
 * @param experimentalFeaturesConfigValue an object with string keys (experimental feature names) and boolean values
 * @param existingFeatures an object with pre-existing experimental features and their default values
 * @returns an object with experimental features values updated based on the two config values provided
 */
export const getUpdatedExperimentalFeatures = <T extends Record<string, boolean>>(
  enableExperimentalConfigValue: string[],
  experimentalFeaturesConfigValue: { [k: string]: boolean },
  existingFeatures: T
): T => {
  const updatedFeatures = { ...existingFeatures };

  for (const value of enableExperimentalConfigValue) {
    if (Object.prototype.hasOwnProperty.call(existingFeatures, value)) {
      updatedFeatures[value as keyof T] = true as T[keyof T];
    }
  }

  for (const [key, value] of Object.entries(experimentalFeaturesConfigValue)) {
    if (Object.prototype.hasOwnProperty.call(existingFeatures, key) && typeof value === 'boolean') {
      updatedFeatures[key as keyof T] = value as T[keyof T];
    }
  }

  return updatedFeatures;
};

export const isValidExperimentalValue = (value: string): value is ExperimentalConfigKey => {
  return (allowedKeys as string[]).includes(value);
};

export const getExperimentalAllowedValues = (): string[] => [...allowedKeys];
