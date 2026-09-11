/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { omit } from 'lodash';
import { expect } from '@kbn/scout-oblt/api';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { DYNAMIC_SETTINGS_DEFAULTS } from '../../../../../common/constants/settings_defaults';
import type { ScoutPrivateLocation } from '../../../common/services/synthetics_private_location_api_service';
import { apiTest, mergeSyntheticsApiHeaders, SYNTHETICS_API_URLS } from '../../../common/fixtures';
import { addMonitor, enableSynthetics } from '../../../common/fixtures/monitors';
import { tryForTime } from '../../../common/fixtures/retry';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';

const TEST_INDEX_CONNECTOR_NAME = 'synthetics-default-alerting-test';

const STATUS_RULE_TYPE_ID = 'xpack.synthetics.alerts.monitorStatus';
const TLS_RULE_TYPE_ID = 'xpack.synthetics.alerts.tls';

/** Server-generated / time-sensitive fields omitted before the rule deep-equality. */
const OMIT_RULE_FIELDS = [
  'apiKeyOwner',
  'createdBy',
  'updatedBy',
  'id',
  'updatedAt',
  'createdAt',
  'lastEnabledAt',
  'scheduledTaskId',
  'executionStatus',
  'monitoring',
  'nextRun',
  'lastRun',
  'snoozeSchedule',
  'viewInAppRelativeUrl',
  'isSnoozedUntil',
];

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/enable_default_alerting.ts`.
 *
 * Verifies the default synthetics status/TLS rules are created on
 * `enable_default_alerting`, auto-created when a monitor is added, and
 * deleted/recreated when the default-rule settings toggle.
 */
apiTest.describe(
  'EnableDefaultAlerting',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let privateLocation: ScoutPrivateLocation;

    const putDynamicSettings = (apiClient: ApiClientFixture, body: Record<string, unknown>) =>
      apiClient.put(SYNTHETICS_API_URLS.DYNAMIC_SETTINGS, {
        headers: editorHeaders,
        body,
        responseType: 'json',
      });

    const enableDefaultAlerting = (apiClient: ApiClientFixture, method: 'post' | 'put' = 'post') =>
      apiClient[method](SYNTHETICS_API_URLS.ENABLE_DEFAULT_ALERTING, {
        headers: editorHeaders,
        responseType: 'json',
      });

    const getDefaultAlerting = (apiClient: ApiClientFixture) =>
      apiClient.get(SYNTHETICS_API_URLS.ENABLE_DEFAULT_ALERTING, {
        headers: editorHeaders,
        responseType: 'json',
      });

    apiTest.beforeAll(async ({ requestAuth, apiClient, apiServices, kbnClient }) => {
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader);

      await kbnClient.savedObjects.clean({ types: ['synthetics-monitor-multi-space'] });
      await enableSynthetics(apiClient, editorHeaders);
      await apiServices.syntheticsPrivateLocations.installSyntheticsPackage();
      // The private location is only a monitor target and is not mutated by any
      // test, so create it once here instead of per-test in `beforeEach`. The
      // per-test monitor cleanup below only wipes `synthetics-monitor-multi-space`,
      // so the location survives across tests.
      privateLocation = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();
      await apiServices.alerting.connectors.create({
        name: TEST_INDEX_CONNECTOR_NAME,
        connectorTypeId: '.index',
        config: { index: 'synthetics-*', refresh: true },
      });
    });

    apiTest.beforeEach(async ({ apiClient, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: ['synthetics-monitor-multi-space'] });
      const res = await putDynamicSettings(apiClient, {
        ...DYNAMIC_SETTINGS_DEFAULTS,
        defaultConnectors: [TEST_INDEX_CONNECTOR_NAME],
      });
      expect(res).toHaveStatusCode(200);
    });

    apiTest.afterAll(async ({ apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: ['synthetics-monitor-multi-space'] });
      await apiServices.alerting.cleanup.deleteAllConnectors();
      await apiServices.syntheticsPrivateLocations.cleanUpPrivateLocationsAndPolicies();
    });

    const addHttpMonitor = async (apiClient: ApiClientFixture) =>
      addMonitor(
        apiClient,
        editorHeaders,
        { ...httpMonitorFixture, locations: [privateLocation] },
        { gettingStarted: true }
      );

    apiTest('does create the rules when there are no connectors defined', async ({ apiClient }) => {
      const settingsRes = await putDynamicSettings(apiClient, DYNAMIC_SETTINGS_DEFAULTS);
      expect(settingsRes).toHaveStatusCode(200);

      const apiResponse = await enableDefaultAlerting(apiClient, 'post');
      expect(apiResponse).toHaveStatusCode(200);

      const body = apiResponse.body as { statusRule: unknown; tlsRule: unknown };
      expect(body.statusRule != null).toBe(true);
      expect(body.tlsRule != null).toBe(true);
    });

    apiTest('returns the created alerts when called', async ({ apiClient }) => {
      const apiResponse = await enableDefaultAlerting(apiClient, 'post');
      expect(apiResponse).toHaveStatusCode(200);

      const body = apiResponse.body as { statusRule: object; tlsRule: object };

      expect(omit(body.statusRule, OMIT_RULE_FIELDS)).toStrictEqual(
        omit(defaultAlertRules.statusRule, OMIT_RULE_FIELDS)
      );
      expect(omit(body.tlsRule, OMIT_RULE_FIELDS)).toStrictEqual(
        omit(defaultAlertRules.tlsRule, OMIT_RULE_FIELDS)
      );
    });

    apiTest('enables alert when new monitor is added', async ({ apiClient }) => {
      const res = await addHttpMonitor(apiClient);
      expect((res.body as { id?: string }).id).toBeDefined();

      await tryForTime(30_000, async () => {
        const getRes = await getDefaultAlerting(apiClient);
        expect(getRes).toHaveStatusCode(200);
        const body = getRes.body as {
          statusRule: { ruleTypeId: string };
          tlsRule: { ruleTypeId: string };
        };
        expect(body.statusRule.ruleTypeId).toBe(STATUS_RULE_TYPE_ID);
        expect(body.tlsRule.ruleTypeId).toBe(TLS_RULE_TYPE_ID);
      });
    });

    apiTest(
      'deletes (and recreates) the default rule when settings are updated',
      async ({ apiClient }) => {
        const res = await addHttpMonitor(apiClient);
        expect((res.body as { id?: string }).id).toBeDefined();

        await tryForTime(30_000, async () => {
          const getRes = await getDefaultAlerting(apiClient);
          const body = getRes.body as {
            statusRule: { ruleTypeId: string };
            tlsRule: { ruleTypeId: string };
          };
          expect(body.statusRule.ruleTypeId).toBe(STATUS_RULE_TYPE_ID);
          expect(body.tlsRule.ruleTypeId).toBe(TLS_RULE_TYPE_ID);
        });

        const settings = await putDynamicSettings(apiClient, {
          defaultStatusRuleEnabled: false,
          defaultTLSRuleEnabled: false,
        });
        const settingsBody = settings.body as {
          defaultStatusRuleEnabled: boolean;
          defaultTLSRuleEnabled: boolean;
        };
        expect(settingsBody.defaultStatusRuleEnabled).toBe(false);
        expect(settingsBody.defaultTLSRuleEnabled).toBe(false);

        expect(await enableDefaultAlerting(apiClient, 'put')).toHaveStatusCode(200);

        await tryForTime(30_000, async () => {
          const getRes = await getDefaultAlerting(apiClient);
          const body = getRes.body as { statusRule: unknown; tlsRule: unknown };
          expect(body.statusRule).toBeNull();
          expect(body.tlsRule).toBeNull();
        });

        const settings2 = await putDynamicSettings(apiClient, {
          defaultStatusRuleEnabled: true,
          defaultTLSRuleEnabled: true,
        });
        expect(settings2).toHaveStatusCode(200);
        const settings2Body = settings2.body as {
          defaultStatusRuleEnabled: boolean;
          defaultTLSRuleEnabled: boolean;
        };
        expect(settings2Body.defaultStatusRuleEnabled).toBe(true);
        expect(settings2Body.defaultTLSRuleEnabled).toBe(true);

        expect(await enableDefaultAlerting(apiClient, 'put')).toHaveStatusCode(200);

        await tryForTime(30_000, async () => {
          const getRes = await getDefaultAlerting(apiClient);
          const body = getRes.body as {
            statusRule: { ruleTypeId: string };
            tlsRule: { ruleTypeId: string };
          };
          expect(body.statusRule.ruleTypeId).toBe(STATUS_RULE_TYPE_ID);
          expect(body.tlsRule.ruleTypeId).toBe(TLS_RULE_TYPE_ID);
        });
      }
    );

    apiTest('doesnt throw errors when rule has already been deleted', async ({ apiClient }) => {
      const res = await addHttpMonitor(apiClient);
      expect((res.body as { id?: string }).id).toBeDefined();

      await tryForTime(30_000, async () => {
        const getRes = await getDefaultAlerting(apiClient);
        const body = getRes.body as {
          statusRule: { ruleTypeId: string };
          tlsRule: { ruleTypeId: string };
        };
        expect(body.statusRule.ruleTypeId).toBe(STATUS_RULE_TYPE_ID);
        expect(body.tlsRule.ruleTypeId).toBe(TLS_RULE_TYPE_ID);
      });

      const settings = await putDynamicSettings(apiClient, {
        defaultStatusRuleEnabled: false,
        defaultTLSRuleEnabled: false,
      });
      expect(settings).toHaveStatusCode(200);
      const settingsBody = settings.body as {
        defaultStatusRuleEnabled: boolean;
        defaultTLSRuleEnabled: boolean;
      };
      expect(settingsBody.defaultStatusRuleEnabled).toBe(false);
      expect(settingsBody.defaultTLSRuleEnabled).toBe(false);

      expect(await enableDefaultAlerting(apiClient, 'put')).toHaveStatusCode(200);

      await tryForTime(30_000, async () => {
        const getRes = await getDefaultAlerting(apiClient);
        const body = getRes.body as { statusRule: unknown; tlsRule: unknown };
        expect(body.statusRule).toBeNull();
        expect(body.tlsRule).toBeNull();
      });

      // call api again with the same settings, make sure its 200
      expect(await enableDefaultAlerting(apiClient, 'put')).toHaveStatusCode(200);

      await tryForTime(30_000, async () => {
        const getRes = await getDefaultAlerting(apiClient);
        const body = getRes.body as { statusRule: unknown; tlsRule: unknown };
        expect(body.statusRule).toBeNull();
        expect(body.tlsRule).toBeNull();
      });
    });
  }
);

const defaultAlertRules = {
  statusRule: {
    id: '574e82f0-1672-11ee-8e7d-c985c0ef6c2e',
    notifyWhen: null,
    consumer: 'uptime',
    alertTypeId: 'xpack.synthetics.alerts.monitorStatus',
    tags: ['SYNTHETICS_DEFAULT_ALERT'],
    name: 'Synthetics status internal rule',
    enabled: true,
    throttle: null,
    apiKeyOwner: 'any',
    apiKeyCreatedByUser: true,
    artifacts: {
      dashboards: [],
      investigation_guide: { blob: '' },
    },
    createdBy: 'any',
    updatedBy: 'any',
    muteAll: false,
    mutedInstanceIds: [],
    revision: 0,
    running: false,
    schedule: { interval: '1m' },
    actions: [],
    params: {},
    snoozeSchedule: [],
    updatedAt: '2023-06-29T11:44:44.488Z',
    createdAt: '2023-06-29T11:44:44.488Z',
    scheduledTaskId: '574e82f0-1672-11ee-8e7d-c985c0ef6c2e',
    executionStatus: {
      status: 'ok',
      lastExecutionDate: '2023-06-29T11:47:55.331Z',
      lastDuration: 64,
    },
    ruleTypeId: 'xpack.synthetics.alerts.monitorStatus',
  },
  tlsRule: {
    id: '574eaa00-1672-11ee-8e7d-c985c0ef6c2e',
    notifyWhen: null,
    consumer: 'uptime',
    alertTypeId: 'xpack.synthetics.alerts.tls',
    tags: ['SYNTHETICS_DEFAULT_ALERT'],
    name: 'Synthetics internal TLS rule',
    enabled: true,
    throttle: null,
    apiKeyOwner: 'elastic_admin',
    apiKeyCreatedByUser: true,
    artifacts: {
      dashboards: [],
      investigation_guide: { blob: '' },
    },
    createdBy: 'elastic_admin',
    updatedBy: 'elastic_admin',
    muteAll: false,
    mutedInstanceIds: [],
    revision: 0,
    running: false,
    schedule: { interval: '1m' },
    actions: [],
    params: {},
    snoozeSchedule: [],
    updatedAt: '2023-06-29T11:44:44.489Z',
    createdAt: '2023-06-29T11:44:44.489Z',
    scheduledTaskId: '574eaa00-1672-11ee-8e7d-c985c0ef6c2e',
    executionStatus: {
      status: 'ok',
      lastExecutionDate: '2023-06-29T11:44:46.214Z',
      lastDuration: 193,
    },
    ruleTypeId: 'xpack.synthetics.alerts.tls',
  },
};
