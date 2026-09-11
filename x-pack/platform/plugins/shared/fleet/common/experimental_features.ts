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
  enableFleetOrphanedPolicySweep: true, // When enabled, the policy-revisions cleanup task also sweeps .fleet-policies docs for deleted agent policies.
  enableAgentRollback: true, // When enabled, agent upgrade rollback will be available in the API and UI.
  disableAgentlessLegacyAPI: true, // When enabled, the legacy agent/package policy APIs reject agentless create, update, upgrade, and copy. Forces enableAgentlessPoliciesUI on (see below).
  enableAgentlessPoliciesUI: true, // When enabled, the UI reads/writes agentless integration policies through the managed integrations API. Disable as a kill switch to fall back to the legacy APIs — but disableAgentlessLegacyAPI overrides it (the fallback would 400).
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
  enableOtelUI: true, // When enabled, OTel-specific UI elements (e.g. Collector Config tab) will be shown.
  enableIncludeTagsInEvents: false, // When enabled, the include_tags_in_events agent policy advanced setting is available in the UI.
  enableOtlpOutput: false, // When enabled, OTLP output type is available for creation and management via the Fleet outputs API.
  enableIntegrationCollectionTiles: true, // When enabled, packages sharing a `group` id are collapsed into a single collection tile in the integrations marketplace.
  enableIntegrationTileClickToAdd: false, // When enabled, clicking an integration tile navigates directly to the add-integration page instead of the overview page.
  enableAgentPolicyMultipleDownloadSources: false, // When enabled, agent policies accept an ordered list of agent binary download sources and the compiled policy emits `agent.download.sources`.
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
