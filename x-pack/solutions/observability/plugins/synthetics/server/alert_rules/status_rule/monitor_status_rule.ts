/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import { isEmpty } from 'lodash';
import type { GetViewInAppRelativeUrlFnOpts } from '@kbn/alerting-plugin/server';
import { AlertsClientError } from '@kbn/alerting-plugin/server';
import { observabilityFeatureId, observabilityPaths } from '@kbn/observability-plugin/common';
import apm from 'elastic-apm-node';
import { SYNTHETICS_ALERT_RULE_TYPES } from '@kbn/rule-data-utils';
import { syntheticsMonitorStatusRuleParamsSchema } from '@kbn/response-ops-rule-params/synthetics_monitor_status';
import { SyntheticsEsClient } from '../../lib';
import type { AlertOverviewStatus } from '../../../common/runtime_types/alert_rules/common';
import type { StatusRuleExecutorOptions } from './types';
import type { SyntheticsPluginsSetupDependencies, SyntheticsServerSetup } from '../../types';
import { StatusRuleExecutor } from './status_rule_executor';
import { MONITOR_STATUS } from '../../../common/constants/synthetics_alerts';
import {
  setRecoveredAlertsContext,
  updateState,
  SyntheticsRuleTypeAlertDefinition,
} from '../common';
import { getActionVariables } from '../action_variables';
import { STATUS_RULE_NAME } from '../translations';
import type { SyntheticsMonitorClient } from '../../synthetics_service/synthetics_monitor/synthetics_monitor_client';
import { SYNTHETICS_INDEX_PATTERN } from '../../../common/constants';

export const registerSyntheticsStatusCheckRule = (
  server: SyntheticsServerSetup,
  plugins: SyntheticsPluginsSetupDependencies,
  syntheticsMonitorClient: SyntheticsMonitorClient
) => {
  if (!plugins.alerting) {
    throw new Error(
      'Cannot register the synthetics monitor status rule type. The alerting plugin needs to be enabled.'
    );
  }

  plugins.alerting.registerType({
    id: SYNTHETICS_ALERT_RULE_TYPES.MONITOR_STATUS,
    category: DEFAULT_APP_CATEGORIES.observability.id,
    producer: 'uptime',
    solution: observabilityFeatureId,
    name: STATUS_RULE_NAME,
    validate: {
      params: syntheticsMonitorStatusRuleParamsSchema,
    },
    defaultActionGroupId: MONITOR_STATUS.id,
    actionGroups: [MONITOR_STATUS],
    actionVariables: getActionVariables({ plugins }),
    isExportable: true,
    minimumLicenseRequired: 'basic',
    doesSetRecoveryContext: true,
    executor: async (options: StatusRuleExecutorOptions) => {
      apm.setTransactionName('Synthetics Status Rule Executor');
      const { state: ruleState, params, services, spaceId } = options;
      const { alertsClient, uiSettingsClient, scopedClusterClient, savedObjectsClient } = services;
      if (!alertsClient) {
        throw new AlertsClientError();
      }
      const { basePath } = server;

      const [dateFormat, timezone] = await Promise.all([
        uiSettingsClient.get('dateFormat'),
        uiSettingsClient.get('dateFormat:tz'),
      ]);
      const tz = timezone === 'Browser' ? 'UTC' : timezone;

      const groupBy = params?.condition?.groupBy ?? 'locationId';
      const groupByLocation = groupBy === 'locationId';

      const esClient = new SyntheticsEsClient(
        savedObjectsClient,
        scopedClusterClient.asCurrentUser,
        {
          heartbeatIndices: SYNTHETICS_INDEX_PATTERN,
          uiSettingsClient,
        }
      );

      const statusRule = new StatusRuleExecutor(esClient, server, syntheticsMonitorClient, options);

      const { downConfigs, staleDownConfigs, upConfigs, pendingConfigs, stalePendingConfigs } =
        await statusRule.getConfigs({
          prevDownConfigs: ruleState.meta?.downConfigs as AlertOverviewStatus['downConfigs'],
          prevPendingConfigs: ruleState.meta
            ?.pendingConfigs as AlertOverviewStatus['pendingConfigs'],
        });

      await statusRule.handleDownMonitorThresholdAlert({
        downConfigs,
      });

      await statusRule.handlePendingMonitorAlert({
        pendingConfigs,
      });

      setRecoveredAlertsContext({
        alertsClient,
        basePath,
        spaceId,
        dateFormat,
        tz,
        params,
        groupByLocation,
        staleDownConfigs,
        stalePendingConfigs,
        upConfigs,
      });

      return {
        state: updateState(ruleState, !isEmpty(downConfigs) || !isEmpty(pendingConfigs), {
          downConfigs,
          pendingConfigs,
        }),
      };
    },
    alerts: SyntheticsRuleTypeAlertDefinition,
    getViewInAppRelativeUrl: ({ rule }: GetViewInAppRelativeUrlFnOpts<{}>) =>
      observabilityPaths.ruleDetails(rule.id),
  });
};
