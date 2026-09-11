/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiClientFixture, EsClient } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import {
  apiTest,
  LOCAL_PUBLIC_LOCATION,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_ALERTS_INDEX,
  SYNTHETICS_API_URLS,
  SYNTHETICS_MONITOR_SO_TYPES,
  type SyntheticsAlertDoc,
  type SyntheticsApiServicesFixture,
} from '../../../common/fixtures';
import { addMonitor, enableSynthetics } from '../../../common/fixtures/monitors';
import { tryForTime } from '../../../common/fixtures/retry';

const RULE_TAG = 'scout-status-pending-threshold';
const STATUS_RULE_TYPE_ID = 'xpack.synthetics.alerts.monitorStatus';
const STATUS_RULE_CONSUMER = 'uptime';
/** HTTP monitors are pending only after a 1-minute grace period. */
const SLOW_TEST_TIMEOUT_MS = 180_000;
const PENDING_WAIT_MS = 120_000;

interface StatusRuleInspectBody {
  pendingConfigs?: Record<string, { configId: string; pendingCount?: number }>;
}

interface AlertingRuleBody {
  id: string;
  params: {
    condition?: { pendingThreshold?: number; alertOnNoData?: boolean };
  };
}

/**
 * API coverage for `condition.pendingThreshold` on custom Synthetics monitor
 * status rules. Schema/persistence goes through `POST/GET api/alerting/rule`;
 * consecutive-pending firing is driven with `_run_soon` against a real rule,
 * matching `tls_rule_browser_certs_alert.spec.ts`.
 *
 * HTTP monitors are not treated as pending until they are at least one minute
 * old (`isMonitorReadyForData`). Each firing test waits until the monitor is
 * pending before creating its own rule.
 */
apiTest.describe(
  'statusRulePendingThreshold',
  {
    tag: ['@local-stateful-classic', '@local-serverless-observability_complete'],
  },
  () => {
    let editorHeaders: Record<string, string>;
    let monitorId: string;

    const pendingCondition = (pendingThreshold: number) => ({
      alertOnNoData: true,
      locationsThreshold: 1,
      window: { numberOfChecks: 5 },
      groupBy: 'locationId',
      downThreshold: 5,
      pendingThreshold,
    });

    const createRulePayload = (pendingThreshold: number, enabled: boolean) => ({
      name: `Scout pending threshold ${pendingThreshold}`,
      rule_type_id: STATUS_RULE_TYPE_ID,
      consumer: STATUS_RULE_CONSUMER,
      tags: [RULE_TAG],
      schedule: { interval: '1d' },
      enabled,
      actions: [],
      params: {
        condition: pendingCondition(pendingThreshold),
        monitorIds: [monitorId],
      },
    });

    const inspectStatusRule = async (apiClient: ApiClientFixture) => {
      const res = await apiClient.post(SYNTHETICS_API_URLS.INSPECT_STATUS_RULE, {
        headers: editorHeaders,
        body: {
          monitorIds: [monitorId],
          condition: pendingCondition(2),
        },
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(200);
      return res.body as StatusRuleInspectBody;
    };

    const waitUntilMonitorIsPending = async (apiClient: ApiClientFixture) => {
      await tryForTime(
        PENDING_WAIT_MS,
        async () => {
          const body = await inspectStatusRule(apiClient);
          const pending = Object.values(body.pendingConfigs ?? {});
          const match = pending.find((config) => config.configId === monitorId);
          if (!match) {
            throw new Error(
              `Monitor ${monitorId} is not pending yet ` +
                `(pending=${Object.keys(body.pendingConfigs ?? {}).join(',') || 'none'})`
            );
          }
          return match;
        },
        { intervalMs: 2_000 }
      );
    };

    const getAlertsForRule = async (
      esClient: EsClient,
      ruleId: string
    ): Promise<SyntheticsAlertDoc[]> => {
      const res = await esClient.search<SyntheticsAlertDoc>({
        index: SYNTHETICS_ALERTS_INDEX,
        ignore_unavailable: true,
        size: 10,
        query: {
          bool: {
            filter: [{ term: { 'kibana.alert.rule.uuid': ruleId } }],
          },
        },
        sort: [{ '@timestamp': 'desc' }],
      });
      return res.hits.hits
        .map((hit) => hit._source)
        .filter((source): source is SyntheticsAlertDoc => source != null);
    };

    const createEnabledStatusRule = async (
      apiServices: SyntheticsApiServicesFixture,
      pendingThreshold: number,
      name: string
    ) => {
      // Create disabled so the first `_run_soon` is evaluation 1 (an enabled
      // create can race an automatic run against a 1d schedule).
      const created = await apiServices.alerting.rules.create({
        name,
        ruleTypeId: STATUS_RULE_TYPE_ID,
        consumer: STATUS_RULE_CONSUMER,
        params: {
          condition: pendingCondition(pendingThreshold),
          monitorIds: [monitorId],
        },
        schedule: { interval: '1d' },
        enabled: false,
        tags: [RULE_TAG],
      });
      expect(created).toHaveStatusCode(200);
      const ruleId = created.data.id as string;
      const dateStart = new Date();
      await apiServices.alerting.rules.enable(ruleId);
      return { ruleId, dateStart };
    };

    const runFirstExecution = async (
      apiServices: SyntheticsApiServicesFixture,
      ruleId: string,
      dateStart: Date
    ) => {
      try {
        await apiServices.alerting.waiting.waitForExecutionCount(
          ruleId,
          1,
          undefined,
          5_000,
          dateStart
        );
      } catch {
        await apiServices.alerting.rules.runSoon(ruleId);
        await apiServices.alerting.waiting.waitForExecutionCount(
          ruleId,
          1,
          undefined,
          60_000,
          dateStart
        );
      }
    };

    const runAdditionalExecution = async (
      apiServices: SyntheticsApiServicesFixture,
      ruleId: string,
      dateStart: Date
    ) => {
      const nextExecution = apiServices.alerting.waiting.waitForNextExecution(
        ruleId,
        undefined,
        60_000,
        dateStart
      );
      await apiServices.alerting.rules.runSoon(ruleId);
      await nextExecution;
    };

    apiTest.beforeAll(async ({ requestAuth, apiClient, apiServices, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      await apiServices.alerting.cleanup.deleteRulesByTags([RULE_TAG]);

      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      await enableSynthetics(apiClient, editorHeaders);

      const monitorRes = await addMonitor(apiClient, editorHeaders, {
        type: 'http',
        locations: [LOCAL_PUBLIC_LOCATION.id],
        url: 'https://www.google.com',
        name: 'Scout pending-threshold HTTP monitor',
        tags: [RULE_TAG],
      });
      monitorId = (monitorRes.body as { id: string }).id;
    });

    apiTest.afterAll(async ({ apiServices, kbnClient }) => {
      await apiServices.alerting.cleanup.deleteRulesByTags([RULE_TAG]);
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
    });

    apiTest('rejects pendingThreshold below 1', async ({ apiClient }) => {
      const res = await apiClient.post('api/alerting/rule', {
        headers: editorHeaders,
        body: createRulePayload(0, false),
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(400);
    });

    apiTest('persists pendingThreshold on a custom status rule', async ({ apiClient }) => {
      const created = await apiClient.post('api/alerting/rule', {
        headers: editorHeaders,
        body: createRulePayload(3, false),
        responseType: 'json',
      });
      expect(created).toHaveStatusCode(200);
      const createdBody = created.body as AlertingRuleBody;
      expect(createdBody.params.condition?.pendingThreshold).toBe(3);
      expect(createdBody.params.condition?.alertOnNoData).toBe(true);

      const fetched = await apiClient.get(`api/alerting/rule/${createdBody.id}`, {
        headers: editorHeaders,
        responseType: 'json',
      });
      expect(fetched).toHaveStatusCode(200);
      const fetchedBody = fetched.body as AlertingRuleBody;
      expect(fetchedBody.params.condition?.pendingThreshold).toBe(3);
    });

    apiTest(
      'inspect_status_rule reports the monitor as pending after the no-data grace period',
      async ({ apiClient }) => {
        apiTest.setTimeout(SLOW_TEST_TIMEOUT_MS);
        await waitUntilMonitorIsPending(apiClient);
        const body = await inspectStatusRule(apiClient);
        const match = Object.values(body.pendingConfigs ?? {}).find(
          (config) => config.configId === monitorId
        );
        expect(match?.pendingCount).toBe(1);
      }
    );

    apiTest(
      'waits for two consecutive pending evaluations before firing when pendingThreshold is 2',
      async ({ apiClient, apiServices, esClient }) => {
        apiTest.setTimeout(SLOW_TEST_TIMEOUT_MS);
        await waitUntilMonitorIsPending(apiClient);

        const { ruleId, dateStart } = await createEnabledStatusRule(
          apiServices,
          2,
          'Scout pending threshold 2'
        );

        await apiTest.step('does not fire on the first pending evaluation', async () => {
          await runFirstExecution(apiServices, ruleId, dateStart);
          const alerts = await getAlertsForRule(esClient, ruleId);
          expect(alerts.filter((alert) => alert['kibana.alert.status'] === 'active')).toHaveLength(
            0
          );
        });

        await apiTest.step('fires on the second consecutive pending evaluation', async () => {
          await runAdditionalExecution(apiServices, ruleId, dateStart);
          await tryForTime(60_000, async () => {
            const alerts = await getAlertsForRule(esClient, ruleId);
            const active = alerts.find((alert) => alert['kibana.alert.status'] === 'active');
            expect(active).toBeDefined();
            expect(active?.['kibana.alert.reason']).toContain('is pending');
            expect(active?.['kibana.alert.instance.id']).toBe(
              `${monitorId}-${LOCAL_PUBLIC_LOCATION.id}`
            );
          });
        });
      }
    );

    apiTest(
      'fires on the first pending evaluation when pendingThreshold is 1',
      async ({ apiClient, apiServices, esClient }) => {
        apiTest.setTimeout(SLOW_TEST_TIMEOUT_MS);
        await waitUntilMonitorIsPending(apiClient);

        const { ruleId, dateStart } = await createEnabledStatusRule(
          apiServices,
          1,
          'Scout pending threshold 1'
        );

        await runFirstExecution(apiServices, ruleId, dateStart);

        await tryForTime(60_000, async () => {
          const alerts = await getAlertsForRule(esClient, ruleId);
          const active = alerts.find((alert) => alert['kibana.alert.status'] === 'active');
          expect(active).toBeDefined();
          expect(active?.['kibana.alert.reason']).toContain('is pending');
        });
      }
    );
  }
);
