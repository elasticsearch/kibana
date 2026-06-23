/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export * from './routes';
export { validateFleetSavedObjectId } from './validate_fleet_id';
export { isValidDuration } from './validate_duration';
export * as AgentStatusKueryHelper from './agent_status';
export * from './package_helpers';
export {
  packageToPackagePolicyInputs,
  packageToPackagePolicy,
  getStreamsForInputType,
  getRegistryStreamWithDataStreamForInputType,
  varsReducer,
  getInputEffectiveName,
  buildInputKey,
  dataStreamUsesOtelInput,
} from './package_to_package_policy';
export type {
  DocumentationPageInput,
  DocumentationPageInputStream,
} from './documentation_page_inputs';
export { getDocumentationPageInputs } from './documentation_page_inputs';
export { fullAgentPolicyToYaml } from './full_agent_policy_to_yaml';
export { isPackageLimited, doesAgentPolicyAlreadyIncludePackage } from './limited_package';
export {
  isValidDataset,
  isValidDataStreamType,
  isValidNamespace,
  INVALID_NAMESPACE_CHARACTERS,
  VALID_DATA_STREAM_TYPES,
} from './is_valid_namespace';
export { isDiffPathProtocol } from './is_diff_path_protocol';
export { LicenseService } from './license';
export * from './is_agent_upgradeable';
export {
  isAgentRequestDiagnosticsSupported,
  MINIMUM_DIAGNOSTICS_AGENT_VERSION,
} from './is_agent_request_diagnostics_supported';
export {
  isAgentMigrationSupported,
  MINIMUM_MIGRATE_AGENT_VERSION,
  isAgentEligibleForMigration,
} from './agent_migration_helpers';
export {
  isAgentPrivilegeLevelChangeSupported,
  MINIMUM_PRIVILEGE_LEVEL_CHANGE_AGENT_VERSION,
  isAgentEligibleForPrivilegeLevelChange,
} from './agent_privilege_level_change_helpers';
export { syncDataStreamTypeFromVar } from './simplified_package_policy_helper';
export {
  addUseAPMVarIfNotPresent,
  DATA_STREAM_USE_APM_VAR,
  shouldIncludeUseAPMVar,
  addDataStreamTypeVarIfNotPresent,
  DATA_STREAM_TYPE_VAR,
  shouldIncludeDataStreamTypeVar,
  isInputOnlyPolicyTemplate,
  isIntegrationPolicyTemplate,
  getNormalizedInputs,
  getNormalizedDataStreams,
  getPolicyTemplateDataStreamPaths,
  filterPolicyTemplatesTiles,
  hasMultipleEnabledPolicyTemplates,
  getPolicyTemplateInputDefinition,
  registryInputAllowsDynamicSignalTypes,
  packagePolicyInputAllowsUndefinedDataStreamType,
  hasDynamicSignalTypes,
} from './policy_template';
export { doesPackageHaveIntegrations } from './packages_with_integrations';
export type {
  PackagePolicyValidationResults,
  PackagePolicyConfigValidationResults,
  PackagePolicyInputValidationResults,
} from './validate_package_policy';
export {
  validatePackagePolicy,
  validatePackagePolicyConfig,
  validationHasErrors,
  countValidationErrors,
} from './validate_package_policy';

export { normalizeHostsForAgents } from './hosts_utils';
export { splitPkgKey } from './split_pkg_key';
export { getMaxPackageName } from './max_package_name';
export { getMinVersion, getMaxVersion } from './get_min_max_version';
export {
  getPipelineNameForDatastream,
  getCustomPipelineNameForDatastream,
  getRegistryDataStreamAssetBaseName,
  getComponentTemplateNameForDatastream,
} from './datastream_es_name';

export * from './file_storage';
export {
  getPackageReleaseLabel,
  isPackagePrerelease,
  mapPackageReleaseToIntegrationCardRelease,
} from './package_prerelease';

export { getAllowedOutputTypesForAgentPolicy } from './output_helpers';
export { agentStatusesToSummary } from './agent_statuses_to_summary';

export {
  policyHasFleetServer,
  policyHasAPMIntegration,
  policyHasEndpointSecurity,
  policyHasSyntheticsIntegration,
  getInheritedNamespace,
} from './agent_policies_helpers';

export {
  generateNewAgentPolicyWithDefaults,
  agentPolicyWithoutPaidFeatures,
} from './generate_new_agent_policy';

export {
  isAgentPolicyValidForLicense,
  unsetAgentPolicyAccordingToLicenseLevel,
} from './agent_policy_config';

export {
  getFleetServerVersionMessage,
  isAgentVersionLessThanFleetServer,
} from './check_fleet_server_versions';

export { removeSOAttributes, getSortConfig, checkTargetVersionsValidity } from './agent_utils';

export { isAwsCloudConnectorVars, isAzureCloudConnectorVars } from './cloud_connector_helpers';

// Generic var_group helpers
export type { VarGroupSelection } from './var_group_helpers';
export {
  getSelectedOption,
  getVisibleVarsForOption,
  getVarsControlledByVarGroups,
  shouldShowVar,
  isVarRequiredByVarGroup,
  isVarInSelectedVarGroupOption,
} from './var_group_helpers';

// Cloud Connector accessor module
export * from './cloud_connectors';

export { validateSslCertPath } from './ssl_validators';
export { getOtelCollectorDisplayName, getOtelCollectorConfigName } from './otel_collector';

export { isNamespaceAllowedByPrefixes } from './namespace_prefixes';

export type { YamlModule } from './yaml_utils';
export { createYamlKeysSorter, toYaml } from './yaml_utils';
export {
  packageInfoHasOtelInputs,
  packagePolicyHasOtelInputs,
  OTEL_INPUTS_MINIMUM_VERSION,
} from './otelcol_helpers';
