/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { IUiSettingsClient } from '@kbn/core/server';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { RulesClientApi } from '@kbn/alerting-v2-plugin/server';
import { OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_ALERTING_V2 } from '@kbn/management-settings-ids';
import { QUERY_TYPE_STATS, type QueryType } from '@kbn/significant-events-schema';
import { DualCleanupRulesAdapter } from '../../streams/ki/knowledge_indicator_client/rules/dual_cleanup_rules_adapter';
import type { IRulesManagementClient } from '../../streams/ki/knowledge_indicator_client/rules/rules_management_client';
import { RulesAdapterV1 } from '../../streams/ki/knowledge_indicator_client/rules/v1_rules_adapter';
import {
  RulesAdapterV2,
  RulesNotInstalledAdapterV2,
} from '../../streams/ki/knowledge_indicator_client/rules/v2_rules_adapter';
import type { ISignificantEventsAlertsReader } from './alerts_reader';
import { createAlertsReader } from './alerts_reader';

export interface SignificantEventsAlertingContext {
  readonly alertingV2Active: boolean;
  readonly alertsReader: ISignificantEventsAlertsReader;
  readonly rulesClient: IRulesManagementClient;
}

export interface ResolveSignificantEventsAlertingContextParams {
  uiSettingsClient: IUiSettingsClient;
  getAlertingRulesClient: () => Promise<RulesClient>;
  getAlertingV2RulesClient: () => Promise<RulesClientApi | undefined>;
  logger: Logger;
}

/** MATCH queries can be rule-backed; STATS cannot until rule-on-rule provisioning (#265778). */
export function canQueryBeRuleBacked(queryType: QueryType): boolean {
  return queryType !== QUERY_TYPE_STATS;
}

async function readSignificantEventsAlertingV2UiEnabled(
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

function isSignificantEventsAlertingV2Active(
  alertingV2UiEnabled: boolean,
  alertingV2RulesClient?: RulesClientApi
): alertingV2RulesClient is RulesClientApi {
  return alertingV2UiEnabled && alertingV2RulesClient != null;
}

function createDualCleanupRulesClient({
  alertingV2Active,
  alertingRulesClient,
  alertingV2RulesClient,
  logger,
}: {
  alertingV2Active: boolean;
  alertingRulesClient: RulesClient;
  alertingV2RulesClient?: RulesClientApi;
  logger: Logger;
}): IRulesManagementClient {
  const v1Adapter = new RulesAdapterV1(alertingRulesClient);
  const v2Client = alertingV2RulesClient
    ? new RulesAdapterV2(alertingV2RulesClient)
    : new RulesNotInstalledAdapterV2(logger);

  return alertingV2Active
    ? new DualCleanupRulesAdapter(v2Client, v1Adapter, logger)
    : new DualCleanupRulesAdapter(v1Adapter, v2Client, logger);
}

/**
 * Returns a resolver scoped to one request. The first call starts async setup
 * (rules clients, UI flag); later calls reuse the same promise via `??=`.
 */
export function createSignificantEventsAlertingContextResolver(
  params: ResolveSignificantEventsAlertingContextParams
): () => Promise<SignificantEventsAlertingContext> {
  let promise: Promise<SignificantEventsAlertingContext> | undefined;

  return () => {
    // Nullish coalescing assignment: run the async IIFE once, then return the cached promise.
    promise ??= (async () => {
      const [alertingRulesClient, alertingV2RulesClient] = await Promise.all([
        params.getAlertingRulesClient(),
        params.getAlertingV2RulesClient(),
      ]);

      const alertingV2UiEnabled = await readSignificantEventsAlertingV2UiEnabled(
        params.uiSettingsClient,
        params.logger
      );

      if (alertingV2UiEnabled && !alertingV2RulesClient) {
        params.logger.warn(
          'Observability Streams alerting v2 UI setting is enabled but the alerting v2 plugin is not available; using v1 rules only.'
        );
      }

      const alertingV2Active = isSignificantEventsAlertingV2Active(
        alertingV2UiEnabled,
        alertingV2RulesClient
      );

      return {
        alertingV2Active,
        alertsReader: createAlertsReader(alertingV2Active),
        rulesClient: createDualCleanupRulesClient({
          alertingV2Active,
          alertingRulesClient,
          alertingV2RulesClient,
          logger: params.logger,
        }),
      };
    })();
    return promise;
  };
}
