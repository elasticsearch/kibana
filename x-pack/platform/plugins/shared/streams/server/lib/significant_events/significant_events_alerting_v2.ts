/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { IUiSettingsClient } from '@kbn/core/server';
import { OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_ALERTING_V2 } from '@kbn/management-settings-ids';
import type { RulesClientApi } from '@kbn/alerting-v2-plugin/server';

export async function readSignificantEventsAlertingV2UiEnabled(
  uiSettingsClient: IUiSettingsClient,
  logger?: Logger
): Promise<boolean> {
  return uiSettingsClient
    .get(OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_ALERTING_V2)
    .then((v) => v ?? false)
    .catch((err) => {
      logger?.warn(
        `Failed to read alerting v2 feature flag, defaulting to v1: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return false;
    });
}

export function isSignificantEventsAlertingV2Active(
  alertingV2UiEnabled: boolean,
  alertingV2RulesClient?: RulesClientApi
): boolean {
  return alertingV2UiEnabled && alertingV2RulesClient != null;
}

export function logAlertingV2PluginUnavailable(logger: Logger): void {
  logger.warn(
    'Observability Streams alerting v2 UI setting is enabled but the alerting v2 plugin is not available; using v1 rules only.'
  );
}
