/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

/**
 * Regression coverage for the exception-flyout condition builder on a
 * data-view-backed rule.
 *
 * `useFetchIndexPatterns` resolves a data-view rule's fields through
 * `data.dataViews.get`, which runs only after an async active-space lookup.
 * Before the fix the flyout's loading flag initialized to `false` and only
 * flipped `true` after that lookup, so the `addExceptionFlyoutBuilder-loaded`
 * marker (which `waitForVisible()` waits on) could appear on the very first
 * render, while the field combobox was still empty. A test proceeding on that
 * transient "loaded" state would then fail to find any field option.
 *
 * Index-pattern rules don't flash (`useFetchIndex` reports loading on the
 * first render), so this data-view path is the one the shared page object
 * couldn't cover. Here we assert that once `waitForVisible()` returns, the
 * field combobox is populated with the data view's fields (i.e. the field is
 * selectable), proving the marker no longer reports "loaded" prematurely.
 */

// `platform_engineer` grants `all` on `logs-*`, so backing the data view with a
// data stream under that prefix lets the flyout's field-caps request (run as the
// browser user) read it without a bespoke role. A plain index cannot be created
// there: `logs-*-*` matches a data-stream-only template.
const SOURCE_DATA_STREAM_PREFIX = 'logs-scout_dataview.exception';
const CONDITION_FIELD = 'user.name';
const CONDITION_VALUE = 'alice';

spaceTest.describe(
  'Exception flyout condition builder on a data-view rule',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let sourceDataStream: string;
    let dataViewId: string;
    let ruleName: string;

    // Cover the longest path (rule firing + UI flow): Playwright's default
    // per-test budget is too short for security_solution rule execution.
    spaceTest.setTimeout(5 * 60_000);

    spaceTest.beforeEach(async ({ apiServices, browserAuth, esClient, kbnClient, scoutSpace }) => {
      const idSegment = scoutSpace.id.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      sourceDataStream = `${SOURCE_DATA_STREAM_PREFIX}-${idSegment}`;
      dataViewId = `scout-dataview-exception-${idSegment}`;
      ruleName = `Data view exception ${scoutSpace.id}`;

      // Fresh data stream (the `logs-*-*` template is data-stream only, so a
      // plain index cannot be created here). The template's ECS mappings expose
      // the field the exception references. Data streams are append-only, so the
      // seed document is indexed with `op_type: 'create'`.
      await esClient.indices.deleteDataStream({ name: sourceDataStream }).catch(() => {});
      await esClient.indices.createDataStream({ name: sourceDataStream });
      await esClient.index({
        index: sourceDataStream,
        op_type: 'create',
        document: { '@timestamp': new Date().toISOString(), 'user.name': CONDITION_VALUE },
        refresh: 'wait_for',
      });

      // Kibana data view over the data stream, created in the test's space with
      // an explicit id so the rule can reference it via `data_view_id`.
      await kbnClient.request({
        method: 'POST',
        path: `/s/${scoutSpace.id}/api/data_views/data_view`,
        body: {
          data_view: {
            id: dataViewId,
            title: sourceDataStream,
            name: `Scout data view exception ${scoutSpace.id}`,
            timeFieldName: '@timestamp',
          },
        },
        retries: 0,
      });

      // Data-view-backed query rule: `data_view_id` set, no `index`. This is the
      // path `useFetchIndexPatterns` resolves through `data.dataViews.get`. Shared
      // with the sibling index-pattern specs via the detectionRule API service.
      await apiServices.detectionRule.createCustomQueryRule({
        type: 'query',
        query: '*:*',
        data_view_id: dataViewId,
        name: ruleName,
        description: 'Regression coverage for the exception flyout on a data-view-backed rule',
        severity: 'high',
        risk_score: 1,
        rule_id: `data-view-exception-${idSegment}`,
        enabled: true,
        from: '2019-01-01T00:00:00.000Z',
      });

      await browserAuth.loginAsPlatformEngineer();
    });

    spaceTest.afterEach(async ({ apiServices, esClient, kbnClient, scoutSpace }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.detectionAlerts.deleteAll();
      await kbnClient
        .request({
          method: 'DELETE',
          path: `/s/${scoutSpace.id}/api/data_views/data_view/${dataViewId}`,
          retries: 0,
        })
        .catch(() => {});
      await esClient.indices.deleteDataStream({ name: sourceDataStream }).catch(() => {});
    });

    spaceTest(
      'populates the field combobox from the data view before reporting loaded',
      async ({ pageObjects, page, apiServices }) => {
        await spaceTest.step('navigate and wait for the alert to fire', async () => {
          await pageObjects.alertsTablePage.navigate();
          await pageObjects.alertsTablePage.waitForDetectionsAlertsWrapper();
          // The rule executes on schedule. Poll until the alert lands.
          await apiServices.detectionAlerts.waitForAlerts(ruleName, 1, 120_000);
          await page.reload();
          await pageObjects.alertsTablePage.waitForRuleAlert(ruleName);
        });

        await spaceTest.step('open the add-rule-exception flyout', async () => {
          await pageObjects.alertsTablePage.openAddRuleException(ruleName);
          // `waitForVisible()` waits on `addExceptionFlyoutBuilder-loaded`. For a
          // data-view rule this must not resolve until the data view fields load.
          await pageObjects.addExceptionFlyoutPage.waitForVisible();
        });

        await spaceTest.step(
          'the data view field is selectable in the condition builder',
          async () => {
            // Pre-fix: `waitForVisible()` could return on the transient "loaded"
            // marker while the combobox held zero options, and selecting the
            // field would fail. Post-fix the combobox is populated from the data
            // view, so the field selects and reads back.
            await pageObjects.addExceptionFlyoutPage.fillConditionEntry({
              entryIndex: 0,
              field: CONDITION_FIELD,
              operator: 'is',
              value: CONDITION_VALUE,
            });

            expect(
              await pageObjects.addExceptionFlyoutPage.getSelectedConditionField(0)
            ).toStrictEqual([CONDITION_FIELD]);
          }
        );
      }
    );
  }
);
