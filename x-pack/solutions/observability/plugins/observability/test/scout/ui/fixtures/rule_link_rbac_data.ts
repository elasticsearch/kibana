/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient, ObltWorkerFixtures } from '@kbn/scout-oblt';

/**
 * Backing alerts-as-data indices for the two rule types under test. Kibana
 * provisions these write aliases at boot for the log/metric threshold rule
 * types, so the documents can be indexed straight into them (mirrors the
 * approach in `alerts_data.ts` and the infra Scout alerts fixture).
 */
export const LOGS_ALERTS_INDEX = '.alerts-observability.logs.alerts-default';
export const METRICS_ALERTS_INDEX = '.alerts-observability.metrics.alerts-default';

/** Tag applied to both the rules and the alert documents so cleanup is scoped. */
export const RULE_LINK_RBAC_TAG = 'obs-rule-link-rbac-scout-test';

/**
 * The logs alert is readable (rule read) only by a user with the `logs`
 * feature; the metrics alert only by a user with the `infrastructure` feature.
 */
export const LOGS_RULE = {
  name: 'Scout Logs Threshold Rule',
  ruleTypeId: 'logs.alert.document.count',
  consumer: 'logs',
  producer: 'logs',
  category: 'Log threshold',
} as const;

export const METRICS_RULE = {
  name: 'Scout Metric Threshold Rule',
  ruleTypeId: 'metrics.alert.threshold',
  consumer: 'infrastructure',
  producer: 'infrastructure',
  category: 'Metric threshold',
} as const;

export interface RuleLinkRbacRuleIds {
  logsRuleId: string;
  metricsRuleId: string;
}

/**
 * Deterministic alert document id (and `kibana.alert.uuid`) derived from a rule
 * id, so tests can navigate straight to an alert's details page by id.
 */
export const alertIdForRule = (ruleId: string): string => `${ruleId}-alert`;

type RuleDefinition = typeof LOGS_RULE | typeof METRICS_RULE;

const buildAlertDoc = ({
  rule,
  ruleId,
  timestamp,
}: {
  rule: RuleDefinition;
  ruleId: string;
  timestamp: string;
}) => ({
  '@timestamp': timestamp,
  'event.action': 'active',
  'event.kind': 'signal',
  'kibana.alert.status': 'active',
  'kibana.alert.workflow_status': 'open',
  'kibana.alert.duration.us': 1197194000,
  'kibana.alert.instance.id': '*',
  'kibana.alert.uuid': alertIdForRule(ruleId),
  'kibana.alert.reason': `${rule.name} is active`,
  'kibana.alert.rule.category': rule.category,
  'kibana.alert.rule.consumer': rule.consumer,
  'kibana.alert.rule.producer': rule.producer,
  'kibana.alert.rule.rule_type_id': rule.ruleTypeId,
  'kibana.alert.rule.name': rule.name,
  'kibana.alert.rule.uuid': ruleId,
  'kibana.alert.start': timestamp,
  'kibana.alert.time_range': { gte: timestamp },
  'kibana.space_ids': ['default'],
  'kibana.version': '8.0.0',
  tags: [RULE_LINK_RBAC_TAG],
});

/**
 * Creates a (disabled) logs threshold rule and metric threshold rule, then
 * indexes one active alert document for each so the alerts table and flyout have
 * data to render. The rules are created disabled because the test only relies on
 * the documents indexed here, not on rule execution.
 */
export const ingestRuleLinkRbacAlerts = async ({
  esClient,
  apiServices,
  timestamp,
}: {
  esClient: EsClient;
  apiServices: ObltWorkerFixtures['apiServices'];
  timestamp: string;
}): Promise<RuleLinkRbacRuleIds> => {
  const logsRule = await apiServices.alerting.rules.create({
    name: LOGS_RULE.name,
    ruleTypeId: LOGS_RULE.ruleTypeId,
    consumer: LOGS_RULE.consumer,
    enabled: false,
    schedule: { interval: '1m' },
    tags: [RULE_LINK_RBAC_TAG],
    params: {
      count: { comparator: 'more than', value: 100 },
      criteria: [{ field: 'log.level', comparator: 'equals', value: 'error' }],
      timeUnit: 'm',
      timeSize: 5,
      logView: { logViewId: 'default', type: 'log-view-reference' },
    },
  });

  const metricsRule = await apiServices.alerting.rules.create({
    name: METRICS_RULE.name,
    ruleTypeId: METRICS_RULE.ruleTypeId,
    consumer: METRICS_RULE.consumer,
    enabled: false,
    schedule: { interval: '1m' },
    tags: [RULE_LINK_RBAC_TAG],
    params: {
      criteria: [
        { aggType: 'count', comparator: '>', threshold: [100], timeSize: 5, timeUnit: 'm' },
      ],
      sourceId: 'default',
    },
  });

  const logsRuleId = logsRule.data.id as string;
  const metricsRuleId = metricsRule.data.id as string;

  // Index with a deterministic `_id` matching the alert uuid. The alerts table
  // finds these alerts by a `kibana.alert.rule.uuid` field query, but the alert
  // *details* page fetches a single alert by its Elasticsearch `_id`
  // (`buildEsQueryWithAuthz` issues `_id:<id>`), so the document id must be known
  // and stable for `alertDetailsPage.goto(<alertId>)` to resolve it.
  const operations = [
    { create: { _index: LOGS_ALERTS_INDEX, _id: alertIdForRule(logsRuleId) } },
    buildAlertDoc({ rule: LOGS_RULE, ruleId: logsRuleId, timestamp }),
    { create: { _index: METRICS_ALERTS_INDEX, _id: alertIdForRule(metricsRuleId) } },
    buildAlertDoc({ rule: METRICS_RULE, ruleId: metricsRuleId, timestamp }),
  ];

  const bulkResponse = await esClient.bulk({ operations, refresh: 'wait_for' });
  if (bulkResponse.errors) {
    const failures = bulkResponse.items
      .filter((item) => item.create?.error)
      .map((item) => item.create!.error!.reason);
    throw new Error(`Failed to ingest rule-link RBAC alert documents: ${failures.join('; ')}`);
  }

  return { logsRuleId, metricsRuleId };
};

export const cleanRuleLinkRbacAlerts = async ({
  esClient,
  apiServices,
}: {
  esClient: EsClient;
  apiServices: ObltWorkerFixtures['apiServices'];
}): Promise<void> => {
  await apiServices.alerting.cleanup.deleteRulesByTags([RULE_LINK_RBAC_TAG]);

  await esClient
    .deleteByQuery({
      index: '.alerts-observability.*',
      query: { term: { tags: RULE_LINK_RBAC_TAG } },
      refresh: true,
      conflicts: 'proceed',
      ignore_unavailable: true,
    })
    .catch(() => {});
};
