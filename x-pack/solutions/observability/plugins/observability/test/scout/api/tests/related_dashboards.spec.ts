/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { COMPARATORS } from '@kbn/alerting-comparators';
import { OBSERVABILITY_THRESHOLD_RULE_TYPE_ID } from '@kbn/rule-data-utils';
import type { ApiClientFixture } from '@kbn/scout-oblt';
import { apiTest } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import { Aggregators } from '../../../../common/custom_threshold_rule/types';
import { ALERTS_API_URLS } from '../../../../common/constants';
import { getAdminHeaders } from '../fixtures/helpers';
import { pollUntilTrue, retryForSuccess } from '../fixtures/poll';
import {
  installRelatedDashboardsDataForge,
  removeRelatedDashboardsDataForge,
} from '../fixtures/data_forge';

/**
 * Ported (thinned) from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/incident_management/suggested_dashboards.ts`.
 *
 * Verifies the end-to-end wiring of the internal related-dashboards endpoint:
 * given imported dashboards, a custom-threshold rule reading their data view,
 * and a fired alert, the endpoint suggests the matching dashboard. The
 * exhaustive scoring / `matchedBy` matrix the FTR asserted is intentionally
 * left to the unit test (`server/services/related_dashboards_client.test.ts`)
 * rather than re-asserted in this slow integration test.
 */

const THRESHOLD_ALERT_INDEX = '.alerts-observability.threshold.alerts-default';

/**
 * Saved-objects archive (2 dashboards + the `Message Processor` data view) the
 * rule and scoring read from. Resolved relative to the repo root by
 * `kbnClient.importExport`.
 */
const DASHBOARDS_ARCHIVE =
  'x-pack/solutions/observability/plugins/observability/test/scout/api/fixtures/related_dashboards/dashboards_default_space.json';

/** Data view (index-pattern) id from the archive: `kbn-data-forge-fake_stack.message_processor-*`. */
const MESSAGE_PROCESSOR_DATA_VIEW_ID = '593f894a-3378-42cc-bafc-61b4877b64b0';

/** The strongest expected suggestion; its panels reference the rule's data view + metrics. */
const MESSAGE_PROCESSOR_DASHBOARD = {
  id: '48089ec0-f039-11ed-bdc6-f382ac874aa0',
  title: 'Message Processor Operations',
};

const createThresholdRule = async (
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  { consumer, interval }: { consumer: string; interval: string }
): Promise<string> => {
  const res = await apiClient.post('api/alerting/rule', {
    headers,
    responseType: 'json',
    body: {
      name: 'Threshold rule',
      rule_type_id: OBSERVABILITY_THRESHOLD_RULE_TYPE_ID,
      consumer,
      tags: ['observability'],
      schedule: { interval },
      actions: [],
      params: {
        alertOnGroupDisappear: false,
        alertOnNoData: false,
        criteria: [
          {
            comparator: COMPARATORS.GREATER_THAN,
            equation: '1 - (A / B)',
            label: 'Percentage of Rejected Messages',
            metrics: [
              { aggType: Aggregators.SUM, field: 'processor.processed', name: 'A' },
              { aggType: Aggregators.SUM, field: 'processor.accepted', name: 'B' },
            ],
            threshold: [0.0005],
            timeSize: 1,
            timeUnit: 'm',
          },
        ],
        groupBy: ['host.name'],
        searchConfiguration: {
          query: { language: 'kuery', query: '' },
          index: MESSAGE_PROCESSOR_DATA_VIEW_ID,
        },
      },
    },
  });
  expect(res).toHaveStatusCode(200);
  return res.body.id as string;
};

interface SuggestedDashboard {
  id: string;
  title: string;
  score: number;
  matchedBy: Record<string, unknown>;
}

interface RelatedDashboardsResponse {
  linkedDashboards: unknown[];
  suggestedDashboards: SuggestedDashboard[];
}

apiTest.describe(
  'Observability related dashboards',
  // Local-only (no `@cloud-*`): the source FTR was `skipCloud` + `skipMKI`, and
  // the data-forge ingest + alert-firing wait is too heavy/slow for Cloud/MKI.
  { tag: ['@local-stateful-classic', '@local-serverless-observability_complete'] },
  () => {
    let headers: Record<string, string>;
    let ruleId: string;
    let alertId: string;
    let dataForgeIndices: string[] = [];

    apiTest.beforeAll(async ({ apiClient, esClient, kbnClient, log, requestAuth, config }) => {
      headers = await getAdminHeaders(requestAuth);

      // Serverless enforces a 1m minimum rule interval and registers the custom
      // threshold rule under the `observability` consumer; stateful uses `logs`
      // and can run faster (mirrors the original FTR branching).
      const consumer = config.serverless ? 'observability' : 'logs';
      const interval = config.serverless ? '1m' : '10s';

      await kbnClient.importExport.load(DASHBOARDS_ARCHIVE);

      dataForgeIndices = await installRelatedDashboardsDataForge(esClient, log);
      await pollUntilTrue(
        async () => {
          const { count } = await esClient.count({
            index: dataForgeIndices.join(','),
            ignore_unavailable: true,
          });
          return count >= 500;
        },
        { timeoutMs: 120_000, intervalMs: 2_000, label: 'fake_stack data forge documents' }
      );

      ruleId = await createThresholdRule(apiClient, headers, { consumer, interval });

      // Resolve the fired alert's document id up front (the endpoint keys off the
      // alert's `_id`), retrying until the rule has run and breached.
      alertId = await retryForSuccess(
        async () => {
          const resp = await esClient.search<Record<string, unknown>>({
            index: THRESHOLD_ALERT_INDEX,
            query: { bool: { filter: [{ term: { 'kibana.alert.rule.uuid': ruleId } }] } },
            ignore_unavailable: true,
          });
          const id = resp.hits.hits[0]?._id;
          expect(id).toBeDefined();
          return id as string;
        },
        { timeoutMs: 180_000, intervalMs: 3_000, label: 'custom threshold alert document' }
      );
    });

    apiTest.afterAll(async ({ apiClient, esClient, kbnClient, log }) => {
      if (ruleId) {
        await apiClient.delete(`api/alerting/rule/${ruleId}`, { headers }).catch(() => undefined);
        await esClient
          .deleteByQuery({
            index: THRESHOLD_ALERT_INDEX,
            query: { term: { 'kibana.alert.rule.uuid': ruleId } },
            conflicts: 'proceed',
            ignore_unavailable: true,
          })
          .catch(() => undefined);
        await esClient
          .deleteByQuery({
            index: '.kibana-event-log-*',
            // Scope to this rule only — a consumer-wide delete would wipe other
            // rules' event log on a shared parallel-CI cluster.
            query: { term: { 'rule.id': ruleId } },
            conflicts: 'proceed',
            ignore_unavailable: true,
          })
          .catch(() => undefined);
      }
      await esClient.indices
        .delete({ index: dataForgeIndices, ignore_unavailable: true })
        .catch(() => undefined);
      await removeRelatedDashboardsDataForge(esClient, log).catch(() => undefined);
      await kbnClient.importExport.unload(DASHBOARDS_ARCHIVE).catch(() => undefined);
      await kbnClient.savedObjects.cleanStandardList().catch(() => undefined);
    });

    apiTest('suggests the dashboard matching a fired alert', async ({ apiClient }) => {
      const response = await apiClient.get(
        `${ALERTS_API_URLS.INTERNAL_RELATED_DASHBOARDS}?alertId=${alertId}`,
        { headers, responseType: 'json' }
      );

      expect(response).toHaveStatusCode(200);
      const body = response.body as RelatedDashboardsResponse;

      expect(body.linkedDashboards).toStrictEqual([]);
      // Wiring assertion only: the endpoint returns the expected suggestion.
      // Score/`matchedBy` specifics live in the client unit test.
      const suggested = body.suggestedDashboards.find(
        (dashboard) => dashboard.id === MESSAGE_PROCESSOR_DASHBOARD.id
      );
      expect(suggested).toBeDefined();
      expect(suggested?.title).toBe(MESSAGE_PROCESSOR_DASHBOARD.title);
    });
  }
);
