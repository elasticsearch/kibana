/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RulesClient } from '@kbn/alerting-plugin/server';
import type { RulesClientApi } from '@kbn/alerting-v2-plugin/server';
import { OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_ALERTING_V2 } from '@kbn/management-settings-ids';
import { loggerMock } from '@kbn/logging-mocks';
import { ALERTS_READER_V1, ALERTS_READER_V2 } from './alerts_reader';
import {
  createSignificantEventsAlertingContextResolver,
  canQueryBeRuleBacked,
  type ResolveSignificantEventsAlertingContextParams,
} from './significant_events_alerting_context';

describe('canQueryBeRuleBacked', () => {
  it('allows MATCH queries regardless of alerting v2', () => {
    expect(canQueryBeRuleBacked('match')).toBe(true);
  });

  it('does not allow STATS queries until rule-on-rule provisioning', () => {
    expect(canQueryBeRuleBacked('stats')).toBe(false);
  });
});

describe('createSignificantEventsAlertingContextResolver', () => {
  const logger = loggerMock.create();

  const uiSettings = (value: boolean) =>
    ({
      get: jest.fn((key: string) => {
        if (key === OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_ALERTING_V2) {
          return Promise.resolve(value);
        }
        return Promise.resolve(undefined);
      }),
    } as never);

  const alertingRulesClient = {} as RulesClient;
  const v2Client = {} as RulesClientApi;

  const resolverParams = (
    alertingV2UiEnabled: boolean,
    v2RulesClient?: RulesClientApi
  ): ResolveSignificantEventsAlertingContextParams => ({
    uiSettingsClient: uiSettings(alertingV2UiEnabled),
    getAlertingRulesClient: async () => alertingRulesClient,
    getAlertingV2RulesClient: async () => v2RulesClient,
    logger,
  });

  it('returns v1 alerts reader when the UI flag is off', async () => {
    const context = await createSignificantEventsAlertingContextResolver(
      resolverParams(false, v2Client)
    )();

    expect(context.alertingV2Active).toBe(false);
    expect(context.alertsReader).toBe(ALERTS_READER_V1);
  });

  it('returns v2 alerts reader when the UI flag is on and the v2 client is available', async () => {
    const context = await createSignificantEventsAlertingContextResolver(
      resolverParams(true, v2Client)
    )();

    expect(context.alertingV2Active).toBe(true);
    expect(context.alertsReader).toBe(ALERTS_READER_V2);
  });

  it('caches context resolution within a request via the resolver factory', async () => {
    const getAlertingRulesClient = jest.fn().mockResolvedValue(alertingRulesClient);
    const getAlertingV2RulesClient = jest.fn().mockResolvedValue(v2Client);
    const resolveContext = createSignificantEventsAlertingContextResolver({
      uiSettingsClient: uiSettings(false),
      getAlertingRulesClient,
      getAlertingV2RulesClient,
      logger,
    });

    const [first, second] = await Promise.all([resolveContext(), resolveContext()]);

    expect(getAlertingRulesClient).toHaveBeenCalledTimes(1);
    expect(getAlertingV2RulesClient).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first.alertingV2Active).toBe(false);
    expect(first.alertsReader).toBe(ALERTS_READER_V1);
  });

  it('falls back to v1 when the UI flag is on but the v2 client is missing', async () => {
    const context = await createSignificantEventsAlertingContextResolver(
      resolverParams(true, undefined)
    )();

    expect(context.alertingV2Active).toBe(false);
    expect(context.alertsReader).toBe(ALERTS_READER_V1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('alerting v2 plugin is not available')
    );
  });
});
