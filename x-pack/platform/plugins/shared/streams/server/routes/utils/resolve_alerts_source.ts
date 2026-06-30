/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { IUiSettingsClient } from '@kbn/core/server';
import type { RulesClientApi } from '@kbn/alerting-v2-plugin/server';
import {
  type AlertsSource,
  V1_ALERTS_SOURCE,
  V2_ALERTS_SOURCE,
} from '../../lib/significant_events/fetch_query_occurrences_from_alerts';
import {
  isSignificantEventsAlertingV2Active,
  logAlertingV2PluginUnavailable,
  readSignificantEventsAlertingV2UiEnabled,
} from '../../lib/significant_events/significant_events_alerting_v2';

export async function resolveAlertsSource({
  uiSettingsClient,
  alertingV2RulesClient,
  logger,
}: {
  uiSettingsClient: IUiSettingsClient;
  alertingV2RulesClient?: RulesClientApi;
  logger?: Logger;
}): Promise<AlertsSource> {
  const alertingV2UiEnabled = await readSignificantEventsAlertingV2UiEnabled(
    uiSettingsClient,
    logger
  );

  if (alertingV2UiEnabled && !alertingV2RulesClient && logger) {
    logAlertingV2PluginUnavailable(logger);
  }

  return isSignificantEventsAlertingV2Active(alertingV2UiEnabled, alertingV2RulesClient)
    ? V2_ALERTS_SOURCE
    : V1_ALERTS_SOURCE;
}
