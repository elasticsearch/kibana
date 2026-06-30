/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

/**
 * Regression test for elastic/kibana#253666: bulk-close on an exception that
 * references a runtime field defined on the rule's source index mapping.
 *
 * Pre-fix: the "Close all alerts that match this exception..." checkbox was
 * disabled because the gate compared the entry against the alerts wildcard
 * data view, which has no knowledge of source-index runtime fields. The fix
 * moves the resolution of runtime fields to has the server.
 * The runtime fields are resolved from the rule's source indices and attached as
 * `runtime_mappings` on the underlying `updateByQuery`.
 *
 * The setup mirrors the documented workaround in elastic/security-ml#677:
 * a runtime field of type `ip` re-emits a keyword-mapped value so the
 * exception can match it as an IP.
 */

const SOURCE_INDEX_PREFIX = 'scout-runtime-field-bulk-close';
const MATCHING_IP = '203.0.113.99';
const RUNTIME_FIELD_SCRIPT =
  "if (doc.containsKey('source.address') && !doc['source.address'].empty) { emit(doc['source.address'].value); }";

spaceTest.describe(
  'Bulk close with a runtime field on the source index',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let sourceIndex: string;
    let ruleName: string;
    let runtimeFieldName: string;
    let alertsIndex: string;

    spaceTest.beforeEach(async ({ browserAuth, apiServices, esClient, scoutSpace }) => {
      const idSegment = scoutSpace.id.replace(/[^a-z0-9]/gi, '_');
      sourceIndex = `${SOURCE_INDEX_PREFIX}-${idSegment.toLowerCase()}`;
      ruleName = `Runtime field bulk close ${scoutSpace.id}`;
      // Runtime field name embeds the space id to avoid collisions across
      // parallel workers that share ES indices.
      runtimeFieldName = `source_ip_ecs_${idSegment}`;
      alertsIndex = `.alerts-security.alerts-${scoutSpace.id}`;

      // Fresh source index with the source.address keyword field plus a
      // runtime field re-emitting it as `ip`. Mirrors the elastic/security-ml#677
      // workaround pattern.
      await esClient.indices.delete({ index: sourceIndex, ignore_unavailable: true });
      await esClient.indices.create({
        index: sourceIndex,
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            'source.address': { type: 'keyword' },
          },
          runtime: {
            [runtimeFieldName]: {
              type: 'ip',
              script: { source: RUNTIME_FIELD_SCRIPT },
            },
          },
        },
      });
      await esClient.index({
        index: sourceIndex,
        document: {
          '@timestamp': new Date().toISOString(),
          'source.address': MATCHING_IP,
        },
        refresh: 'wait_for',
      });

      await apiServices.detectionRule.createCustomQueryRule({
        index: [sourceIndex],
        enabled: true,
        name: ruleName,
        description:
          'Bulk-close regression for elastic/kibana#253666: runtime field on source index',
        risk_score: 1,
        rule_id: `runtime-field-bulk-close-${idSegment}`,
        severity: 'high',
        type: 'query',
        query: '*:*',
        from: '2019-01-01T00:00:00.000Z',
      });

      await browserAuth.loginAsAdmin();
    });

    spaceTest.afterEach(async ({ apiServices, esClient }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.detectionAlerts.deleteAll();
      await esClient.indices.delete({ index: sourceIndex, ignore_unavailable: true });
    });

    spaceTest(
      'enables bulk close and closes matching alerts when the exception references a runtime field',
      async ({ pageObjects, page, esClient, apiServices }) => {
        await spaceTest.step('navigate and wait for the alert to fire', async () => {
          await pageObjects.alertsTablePage.navigate();
          await pageObjects.alertsTablePage.waitForDetectionsAlertsWrapper();
          // The rule executes on schedule. Poll until the alert lands.
          await apiServices.detectionAlerts.waitForAlerts(ruleName, 1, 120_000);
          // Refresh the table so the new alert is visible.
          await page.reload();
          await pageObjects.alertsTablePage.waitForDetectionsAlertsWrapper();
        });

        await spaceTest.step('open the add-rule-exception flyout', async () => {
          await pageObjects.alertsTablePage.openAddRuleException(ruleName);
          await pageObjects.addExceptionFlyoutPage.waitForVisible();
        });

        await spaceTest.step(
          'build the exception entry referencing the runtime field',
          async () => {
            await pageObjects.addExceptionFlyoutPage.fillConditionEntry({
              entryIndex: 0,
              field: runtimeFieldName,
              operator: 'is',
              value: MATCHING_IP,
            });
            await pageObjects.addExceptionFlyoutPage.setExceptionName(
              `Runtime field exception ${ruleName}`
            );
          }
        );

        await spaceTest.step('gate accepts the runtime field — bulk close is enabled', async () => {
          // Regression assertion for elastic/kibana#253666. Before the fix the
          // checkbox was disabled because the gate consulted the alerts
          // wildcard data view, not the rule's source indices.
          await expect(pageObjects.addExceptionFlyoutPage.bulkCloseCheckbox).toBeEnabled();
        });

        await spaceTest.step('tick bulk close and submit the exception', async () => {
          await pageObjects.addExceptionFlyoutPage.tickBulkClose();
          await pageObjects.addExceptionFlyoutPage.submit();
        });

        await spaceTest.step('alerts matching the runtime field are closed', async () => {
          // The server resolves runtime mappings from the rule's source
          // indices and attaches them to the bulk-close updateByQuery, so the
          // alert matching `source.ip_ecs == 203.0.113.99` should transition
          // to `closed`. Poll until at least one closed alert for this rule
          // appears.
          await expect
            .poll(
              async () => {
                await esClient.indices.refresh({ index: alertsIndex });
                const res = await esClient.count({
                  index: alertsIndex,
                  query: {
                    bool: {
                      filter: [
                        { term: { 'kibana.alert.rule.name': ruleName } },
                        { term: { 'kibana.alert.workflow_status': 'closed' } },
                      ],
                    },
                  },
                });
                return res.count;
              },
              { timeout: 60_000, intervals: [2_000] }
            )
            .toBeGreaterThan(0);
        });
      }
    );
  }
);
