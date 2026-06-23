/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { getFlattenedObject } from '@kbn/std';

export type {
  PackagePolicyValidationResults,
  PackagePolicyConfigValidationResults,
  PackagePolicyInputValidationResults,
} from '../../common/services';
export { ExperimentalFeaturesService } from './experimental_features';
export {
  AgentStatusKueryHelper,
  agentPolicyRouteService,
  packagePolicyRouteService,
  dataStreamRouteService,
  fleetSetupRouteService,
  agentRouteService,
  enrollmentAPIKeyRouteService,
  epmRouteService,
  setupRouteService,
  outputRoutesService,
  settingsRoutesService,
  appRoutesService,
  packageToPackagePolicy,
  packageToPackagePolicyInputs,
  isPackageLimited,
  doesAgentPolicyAlreadyIncludePackage,
  isValidNamespace,
  isValidDuration,
  LicenseService,
  isAgentUpgradeable,
  getNotUpgradeableMessage,
  doesPackageHaveIntegrations,
  validatePackagePolicy,
  validatePackagePolicyConfig,
  validationHasErrors,
  countValidationErrors,
  getStreamsForInputType,
  downloadSourceRoutesService,
  policyHasFleetServer,
} from '../../common/services';

export { isPackageUnverified, isVerificationError } from './package_verification';
export { isPackageUpdatable } from './is_package_updatable';
export { pkgKeyFromPackageInfo } from './pkg_key_from_package_info';
export { createExtensionRegistrationCallback } from './ui_extensions';
export { incrementPolicyName } from './increment_policy_name';

export { getYamlFormatters } from './yaml_formatters';
export { useYaml } from './use_yaml';
