/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest as baseApiTest } from '@kbn/scout';
import {
  buildAlertingApiServices,
  type AlertingApiServicesFixture,
} from '../../alerting_api_services';

export type { AlertingApiServices, AlertingApiServicesFixture } from '../../alerting_api_services';
export { buildAlertingApiServices } from '../../alerting_api_services';

export const apiTest = baseApiTest.extend<{}, { apiServices: AlertingApiServicesFixture }>({
  apiServices: [
    async (
      { apiServices, esClient, kbnClient, log, config },
      use: (extendedApiServices: AlertingApiServicesFixture) => Promise<void>
    ) => {
      const extendedApiServices: AlertingApiServicesFixture = {
        ...apiServices,
        alertingV2: buildAlertingApiServices({ esClient, kbnClient, log, config }),
      };
      await use(extendedApiServices);
    },
    { scope: 'worker' },
  ],
});

export {
  ALL_ROLE,
  NO_ACCESS_ROLE,
  READ_ROLE,
  ALERTING_V2_RULES_ALL_ROLE,
  ALERTING_V2_RULES_READ_ROLE,
  ALERTING_V2_ALERTS_ALL_ROLE,
  ALERTING_V2_ALERTS_READ_ROLE,
  ALERTING_V2_ACTION_POLICIES_ALL_ROLE,
  ALERTING_V2_ACTION_POLICIES_READ_ROLE,
  ALERTING_V2_ACTION_POLICIES_ALL_AND_RULES_READ_ROLE,
  ALERTING_V2_EXECUTION_HISTORY_ALL_ROLE,
  ALERTING_V2_EXECUTION_HISTORY_READ_ROLE,
} from '../../roles';
export {
  buildAlertEvent,
  buildExternalAlertEvent,
  buildCreateRuleData,
  buildCreateActionPolicyData,
  buildRuleTemplateData,
  buildV1RuleTemplateAttributes,
  buildWorkflowYaml,
  getSnoozeDate,
} from '../../builders';
export {
  getActionPolicyUrl,
  getTagSeriesActionUrl,
  getSnoozeSeriesActionUrl,
  getUnsnoozeSeriesActionUrl,
  getAckEpisodeActionUrl,
  getUnackEpisodeActionUrl,
  getAssignEpisodeActionUrl,
  getActivateEpisodeActionUrl,
  getDeactivateEpisodeActionUrl,
  getRuleUrl,
  getRunRuleUrl,
  getEnableRuleUrl,
  getDisableRuleUrl,
  getBulkRulesUrl,
  BULK_TAG_SERIES_ACTION_URL,
  BULK_SNOOZE_SERIES_ACTION_URL,
  BULK_UNSNOOZE_SERIES_ACTION_URL,
  BULK_ACK_EPISODE_ACTION_URL,
  BULK_UNACK_EPISODE_ACTION_URL,
  BULK_ASSIGN_EPISODE_ACTION_URL,
  BULK_ACTIVATE_EPISODE_ACTION_URL,
  BULK_DEACTIVATE_EPISODE_ACTION_URL,
  getBulkDeleteActionPoliciesUrl,
  getBulkEnableActionPoliciesUrl,
  getBulkDisableActionPoliciesUrl,
  getBulkSnoozeActionPoliciesUrl,
  getBulkUnsnoozeActionPoliciesUrl,
  getBulkUpdateApiKeyActionPoliciesUrl,
  getDisableActionPolicyUrl,
  getEnableActionPolicyUrl,
  getListActionPoliciesUrl,
  getSnoozeActionPolicyUrl,
  getUnsnoozeActionPolicyUrl,
  getUpdateActionPolicyApiKeyUrl,
  getListExecutionHistoryUrl,
  listRuleExecutionsUrl,
  getFindRuleTemplatesUrl,
  getRuleTemplateUrl,
} from '../../urls';
export {
  ACTION_POLICY_PER_PAGE_MAX,
  ACTION_POLICY_SEARCH_MAX_LENGTH,
  ACTION_POLICY_TAG_MAX_LENGTH,
  ACTION_POLICY_TAGS_MAX_COUNT,
  RULE_TEMPLATE_PER_PAGE_MAX,
  RULE_TEMPLATE_TAGS_MAX_COUNT,
} from '../../constants';
export * as testData from '../../constants';
