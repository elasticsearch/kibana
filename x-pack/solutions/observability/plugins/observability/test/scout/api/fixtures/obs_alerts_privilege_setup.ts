/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ApiClientFixture,
  RequestAuthFixture,
  SamlAuth,
  RoleApiCredentials,
} from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import { OBS_ALERTING_FEATURES } from '@kbn/rule-data-utils';
import { KIBANA_HEADERS } from './helpers';
import { retryForSuccess } from './poll';

export interface RuleSpec {
  ruleTypeId: string;
  consumer: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

export const ES_QUERY_CONSUMER = 'logs';

/**
 * Minimal valid params for each obs rule type that can be created without
 * external resources (SLOs, ML jobs, uptime monitors).  Rule types that
 * require those resources are omitted — the privilege boundary is identical
 * regardless of rule type, so covering the self-contained ones is sufficient.
 */
const OBS_RULE_TEST_PARAMS: Record<string, Record<string, unknown>> = {
  '.es-query': {
    index: ['.kibana-event-log-*'],
    timeField: '@timestamp',
    esQuery: '{\n  "query":{\n    "match_all" : {}\n  }\n}',
    size: 100,
    timeWindowSize: 5,
    timeWindowUnit: 'm',
    thresholdComparator: '>',
    threshold: [0],
    searchType: 'esQuery',
    excludeHitsFromPreviousRun: true,
    aggType: 'count',
    groupBy: 'all',
  },
  'apm.error_rate': {
    environment: 'production',
    threshold: 0,
    windowSize: 1,
    windowUnit: 'm',
  },
  'apm.transaction_error_rate': {
    environment: 'production',
    threshold: 30,
    windowSize: 5,
    windowUnit: 'm',
  },
  'apm.transaction_duration': {
    environment: 'production',
    threshold: 1500,
    windowSize: 5,
    windowUnit: 'm',
    aggregationType: 'avg',
  },
  'apm.anomaly': {
    windowSize: 5,
    windowUnit: 'm',
    environment: 'ENVIRONMENT_ALL',
    anomalySeverityType: 'minor',
  },
  'metrics.alert.threshold': {
    sourceId: 'default',
    criteria: [{ aggType: 'count', comparator: '>', threshold: [0], timeSize: 1, timeUnit: 'm' }],
  },
  'metrics.alert.inventory.threshold': {
    sourceId: 'default',
    nodeType: 'host',
    criteria: [{ metric: 'cpu', comparator: '>', threshold: [40], timeSize: 1, timeUnit: 'm' }],
  },
  'logs.alert.document.count': {
    logView: { logViewId: 'Default', type: 'log-view-reference' },
    count: { comparator: 'more than or equals', value: 1 },
    timeUnit: 'm',
    timeSize: 5,
    criteria: [{ field: 'env', comparator: 'does not equal', value: 'dev' }],
  },
  'observability.rules.custom_threshold': {
    criteria: [
      {
        comparator: '>',
        threshold: [100],
        timeSize: 1,
        timeUnit: 'm',
        metrics: [{ name: 'A', aggType: 'count' }],
      },
    ],
    searchConfiguration: {
      query: { query: '', language: 'kuery' },
      index: '.kibana-event-log-*',
    },
  },
  'xpack.synthetics.alerts.monitorStatus': {},
  'xpack.synthetics.alerts.tls': {},
  'xpack.uptime.alerts.tls': {},
  'xpack.uptime.alerts.tlsCertificate': {},
  'xpack.uptime.alerts.monitorStatus': {
    numTimes: 1,
    shouldCheckStatus: true,
    shouldCheckAvailability: false,
  },
};

/**
 * Rule types that need external resources we don't provision in this fixture:
 * - slo.rules.burnRate — requires an existing SLO
 * - xpack.ml.anomaly_detection_alert — requires an existing ML job
 * - xpack.uptime.alerts.durationAnomaly — requires an existing monitor
 */
const SKIPPED_RULE_TYPES = new Set([
  'slo.rules.burnRate',
  'xpack.ml.anomaly_detection_alert',
  'xpack.uptime.alerts.durationAnomaly',
]);

export const RULE_SPECS: RuleSpec[] = OBS_ALERTING_FEATURES.filter(
  ({ ruleTypeId }) => !SKIPPED_RULE_TYPES.has(ruleTypeId)
).map(({ ruleTypeId, consumers }) => ({
  ruleTypeId,
  consumer: ruleTypeId === '.es-query' ? ES_QUERY_CONSUMER : consumers[0],
  params: OBS_RULE_TEST_PARAMS[ruleTypeId] ?? {},
  enabled: ruleTypeId === '.es-query',
}));

export const FAKE_ALERT_INSTANCE_ID = 'fake-instance-id';

export interface ObsAlertsPrivilegeState {
  adminCreds: RoleApiCredentials;
  createdRules: Array<{ ruleTypeId: string; ruleId: string }>;
  enabledRuleId: string;
  realAlertId: string;
  realAlertIndex: string;
}

export const setupObsAlertsPrivilegeRules = async ({
  apiClient,
  requestAuth,
  samlAuth,
}: {
  apiClient: ApiClientFixture;
  requestAuth: RequestAuthFixture;
  samlAuth: SamlAuth;
}): Promise<ObsAlertsPrivilegeState> => {
  const adminCreds = await requestAuth.getApiKeyForAdmin();

  const ruleTypesResponse = await apiClient.get('api/alerting/rule_types', {
    headers: { ...KIBANA_HEADERS, ...adminCreds.apiKeyHeader },
    responseType: 'json',
  });
  const registeredIds = new Set(
    (ruleTypesResponse.body as Array<{ id: string }>).map((rt) => rt.id)
  );

  const createdRules: Array<{ ruleTypeId: string; ruleId: string }> = [];
  let enabledRuleId: string | undefined;

  for (const spec of RULE_SPECS) {
    if (!registeredIds.has(spec.ruleTypeId)) {
      continue;
    }

    const response = await apiClient.post('api/alerting/rule', {
      headers: { ...KIBANA_HEADERS, ...adminCreds.apiKeyHeader },
      body: {
        name: `Scout obs-alerts-priv: ${spec.ruleTypeId}`,
        rule_type_id: spec.ruleTypeId,
        consumer: spec.consumer,
        schedule: { interval: '1m' },
        enabled: spec.enabled,
        params: spec.params,
        actions: [],
        tags: ['scout-obs-alerts-priv'],
      },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    const ruleId = (response.body as { id: string }).id;
    createdRules.push({ ruleTypeId: spec.ruleTypeId, ruleId });
    if (spec.enabled) {
      enabledRuleId = ruleId;
    }
  }

  expect(enabledRuleId).toBeDefined();

  const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
  const eventLogHeaders = { ...KIBANA_HEADERS, ...cookieHeader };

  await retryForSuccess(
    async () => {
      const logResponse = await apiClient.get(
        `internal/alerting/rule/${enabledRuleId}/_execution_log?date_start=${encodeURIComponent(
          new Date(Date.now() - 60_000).toISOString()
        )}&per_page=10`,
        { headers: eventLogHeaders, responseType: 'json' }
      );
      const body = logResponse.body as { data: Array<{ status: string }> };
      if (!body.data?.some((entry) => entry.status === 'success')) {
        throw new Error('Rule has not executed successfully yet');
      }
    },
    { timeoutMs: 60_000, intervalMs: 2_000, label: 'wait for .es-query rule execution' }
  );

  let realAlertId: string | undefined;
  let realAlertIndex: string | undefined;
  await retryForSuccess(
    async () => {
      const findResponse = await apiClient.post('internal/rac/alerts/find', {
        headers: { ...KIBANA_HEADERS, ...adminCreds.apiKeyHeader },
        body: {
          rule_type_ids: ['.es-query'],
          consumers: [ES_QUERY_CONSUMER],
          query: { match_all: {} },
          size: 1,
        },
        responseType: 'json',
      });
      const findBody = findResponse.body as {
        hits?: { hits?: Array<{ _id: string; _index: string }> };
      };
      const alertDoc = findBody?.hits?.hits?.[0];
      if (!alertDoc) {
        throw new Error('No alert doc found yet');
      }
      realAlertId = alertDoc._id;
      realAlertIndex = alertDoc._index;
    },
    { timeoutMs: 30_000, intervalMs: 2_000, label: 'wait for alert to appear in .alerts-*' }
  );

  expect(realAlertId).toBeDefined();
  expect(realAlertIndex).toBeDefined();

  return {
    adminCreds,
    createdRules,
    enabledRuleId: enabledRuleId!,
    realAlertId: realAlertId!,
    realAlertIndex: realAlertIndex!,
  };
};

export const teardownObsAlertsPrivilegeRules = async (
  apiClient: ApiClientFixture,
  adminCreds: RoleApiCredentials,
  createdRules: Array<{ ruleId: string }>
): Promise<void> => {
  for (const { ruleId } of createdRules) {
    await apiClient.delete(`api/alerting/rule/${ruleId}`, {
      headers: { ...KIBANA_HEADERS, ...adminCreds.apiKeyHeader },
    });
  }
};
