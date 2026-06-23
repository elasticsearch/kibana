/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest as baseApiTest } from '@kbn/scout';
import type { ApiServicesFixture, EsClient, KbnClient, ScoutLogger } from '@kbn/scout';
import {
  getActionPoliciesApiService,
  getAlertActionsApiService,
  getDispatcherApiService,
  getMaintenanceWindowsApiService,
  getRuleExecutionsApiService,
  getRulesApiService,
  getTaskManagerService,
  getTelemetryService,
  type ActionPoliciesApiService,
  type AlertActionsApiService,
  type DispatcherApiService,
  type MaintenanceWindowsApiService,
  type RuleExecutionsApiService,
  type RulesApiService,
  type RuleEventsApiService,
  type TaskManagerService,
  type TelemetryService,
} from '../../common/services';
import { getRuleEventsApiService } from '../../common/services/rule_events_api_service';
import type { SourceIndexApiService } from '../../common/services/source_index_api_service';
import { getSourceIndexApiService } from '../../common/services/source_index_api_service';

export interface AlertingApiServices {
  rules: RulesApiService;
  ruleEvents: RuleEventsApiService;
  alertActions: AlertActionsApiService;
  actionPolicies: ActionPoliciesApiService;
  maintenanceWindows: MaintenanceWindowsApiService;
  sourceIndex: SourceIndexApiService;
  ruleExecutions: RuleExecutionsApiService;
  dispatcher: DispatcherApiService;
  taskManager: TaskManagerService;
  telemetry: TelemetryService;
}

export interface AlertingApiServicesFixture extends ApiServicesFixture {
  alertingV2: AlertingApiServices;
}

/**
 * Builds the `alertingV2` API services bundle used by both the API and UI
 * Scout test fixtures. Centralizing construction keeps the two fixture
 * entry points in sync as new services are added.
 */
export const buildAlertingApiServices = ({
  esClient,
  kbnClient,
  log,
}: {
  esClient: EsClient;
  kbnClient: KbnClient;
  log: ScoutLogger;
}): AlertingApiServices => {
  const taskManager = getTaskManagerService({ kbnClient, log });
  return {
    rules: getRulesApiService({ kbnClient, log }),
    ruleEvents: getRuleEventsApiService({ esClient, log }),
    alertActions: getAlertActionsApiService({ esClient, log }),
    actionPolicies: getActionPoliciesApiService({ kbnClient, log }),
    maintenanceWindows: getMaintenanceWindowsApiService({ kbnClient, log }),
    sourceIndex: getSourceIndexApiService({ esClient, log }),
    ruleExecutions: getRuleExecutionsApiService({ esClient, log }),
    dispatcher: getDispatcherApiService({ esClient, log }),
    taskManager,
    telemetry: getTelemetryService({ esClient, log, taskManager }),
  };
};

export const apiTest = baseApiTest.extend<{}, { apiServices: AlertingApiServicesFixture }>({
  apiServices: [
    async (
      { apiServices, esClient, kbnClient, log },
      use: (extendedApiServices: AlertingApiServicesFixture) => Promise<void>
    ) => {
      const extendedApiServices: AlertingApiServicesFixture = {
        ...apiServices,
        alertingV2: buildAlertingApiServices({ esClient, kbnClient, log }),
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
} from '../../common/roles';
export {
  buildAlertEvent,
  buildCreateRuleData,
  buildCreateActionPolicyData,
} from '../../common/builders';
export {
  getActionPolicyUrl,
  getAckAlertActionUrl,
  getUnackAlertActionUrl,
  getAssignAlertActionUrl,
  getTagAlertActionUrl,
  getSnoozeAlertActionUrl,
  getUnsnoozeAlertActionUrl,
  getActivateAlertActionUrl,
  getDeactivateAlertActionUrl,
  getRuleUrl,
  getBulkRulesUrl,
  BULK_ALERT_ACTION_URL,
  getBulkActionPoliciesUrl,
  getDisableActionPolicyUrl,
  getEnableActionPolicyUrl,
  getListActionPoliciesUrl,
  getSnoozeActionPolicyUrl,
  getUnsnoozeActionPolicyUrl,
  getUpdateActionPolicyApiKeyUrl,
  getListExecutionHistoryUrl,
  getCountNewExecutionHistoryEventsUrl,
} from '../../common/urls';
export { expectNoBulkTruncationMetadata } from '../../common/assertions';
export {
  ACTION_POLICY_PER_PAGE_MAX,
  ACTION_POLICY_SEARCH_MAX_LENGTH,
  ACTION_POLICY_TAG_MAX_LENGTH,
  ACTION_POLICY_TAGS_MAX_COUNT,
} from '../../common/constants';
export * as testData from '../../common/constants';
