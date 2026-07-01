/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApplicationStart } from '@kbn/core-application-browser';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID } from '@kbn/management-settings-ids';

/**
 * Granular prerequisites for the rule-management Agent Builder skill. Exposed (rather than only a
 * single boolean) so callers can explain which specific requirement is missing.
 */
export interface RuleManagementABSkillRequirements {
  /** Whether the user has the privilege backing `capabilities.agentBuilder.show`. */
  hasAgentBuilderCapability: boolean;
  /** Whether the `agentBuilder:experimentalFeatures` advanced setting is enabled. */
  isExperimentalFeaturesEnabled: boolean;
}

/**
 * Pure function usable outside of the DI context (e.g. the Discover flyout).
 */
export const getRuleManagementABSkillRequirements = (
  application: ApplicationStart,
  uiSettings: IUiSettingsClient
): RuleManagementABSkillRequirements => ({
  hasAgentBuilderCapability: application.capabilities.agentBuilder?.show === true,
  isExperimentalFeaturesEnabled:
    uiSettings.get<boolean>(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID) === true,
});

/**
 * Pure function usable outside of the DI context (e.g. the Discover flyout).
 */
export const getIsRuleManagementABSkillAvailable = (
  application: ApplicationStart,
  uiSettings: IUiSettingsClient
): boolean => {
  const { hasAgentBuilderCapability, isExperimentalFeaturesEnabled } =
    getRuleManagementABSkillRequirements(application, uiSettings);
  return hasAgentBuilderCapability && isExperimentalFeaturesEnabled;
};

/**
 * Hook exposing the granular skill prerequisites for components in the Inversify DI context.
 */
export const useRuleManagementABSkillRequirements = (): RuleManagementABSkillRequirements => {
  const uiSettings = useService(CoreStart('uiSettings'));
  const application = useService(CoreStart('application'));
  return getRuleManagementABSkillRequirements(application, uiSettings);
};

/**
 * Hook for components rendered inside the Inversify DI context.
 */
export const useIsRuleManagementABSkillAvailable = (): boolean => {
  const uiSettings = useService(CoreStart('uiSettings'));
  const application = useService(CoreStart('application'));
  return getIsRuleManagementABSkillAvailable(application, uiSettings);
};
