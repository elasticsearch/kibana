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
 * Pure function usable outside of the DI context (e.g. the Discover flyout).
 */
export const getIsRuleManagementABSkillAvailable = (
  application: ApplicationStart,
  uiSettings: IUiSettingsClient
): boolean => {
  const hasCapability = application.capabilities.agentBuilder?.show === true;
  const isExperimentalEnabled = uiSettings.get<boolean>(
    AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID
  );
  return hasCapability && isExperimentalEnabled;
};

/**
 * Hook for components rendered inside the Inversify DI context.
 */
export const useIsRuleManagementABSkillAvailable = (): boolean => {
  const uiSettings = useService(CoreStart('uiSettings'));
  const application = useService(CoreStart('application'));
  return getIsRuleManagementABSkillAvailable(application, uiSettings);
};
