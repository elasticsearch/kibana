/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags } from '@kbn/scout-security';
import { AddExceptionButtonType } from '@kbn/scout-security/src/playwright/fixtures/test/page_objects/add_exception_flyout';
import { expect } from '@kbn/scout-security/ui';

/**
 * Coverage for elastic/kibana#253666 — Machine Learning rule variant.
 *
 * This is the literal origin of the bug (see elastic/security-ml#677): the
 * documented workaround for the ECS mapping issue in elastic/elasticsearch#110878
 * is to POST a runtime field directly onto the ML anomaly results index, so
 * that exceptions can reference a re-typed value (e.g. `source.address`
 * stored as `keyword` exposed as `ip`).
 *
 * Pre-fix: the bulk-close checkbox was disabled whenever the exception
 * referenced any field not present on the alerts index mapping — which
 * always includes source-index runtime fields, since they live on the rule's
 * source index, not on the alerts index.
 *
 * Post-fix: the checkbox stays enabled, a warning callout explains best-effort
 * matching against each alert's `_source`, and the server resolves
 * `runtime_mappings` from the rule's source indices on the bulk-close request.
 *
 * Note: we are not testing ML itself here. We bypass datafeeds and scoring by
 * synthesizing a single anomaly record directly into a hidden anomaly index;
 * the only thing this test cares about is that an ML detection rule produces
 * an alert which can then be bulk-closed.
 */

const MATCHING_IP = '203.0.113.99';
const BULK_CLOSE_RUNTIME_FIELD_WARNING_TEST_SUBJ = 'bulkCloseRuntimeFieldWarning';
const RUNTIME_FIELD_PAINLESS =
  "if (doc.containsKey('source.address') && !doc['source.address'].empty) { emit(doc['source.address'].value); }";

spaceTest.describe(
  'Bulk close with a runtime field on an ML rule',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let jobId: string;
    let mlAnomalyIndex: string;
    let runtimeFieldName: string;
    let ruleName: string;
    let alertsIndex: string;

    // Cover the longest path (rule firing + UI flow) — Playwright's default
    // per-test budget is too short for security_solution rule execution.
    spaceTest.setTimeout(5 * 60_000);

    spaceTest.beforeEach(async ({ browserAuth, esClient, kbnClient, scoutSpace }) => {
      const idSegment = scoutSpace.id.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      jobId = `scout-runtime-field-ml-${idSegment}`;
      mlAnomalyIndex = `.ml-anomalies-custom-${jobId}`;
      runtimeFieldName = `source_ip_ecs_${idSegment}`;
      ruleName = `Runtime field bulk close ML ${scoutSpace.id}`;
      alertsIndex = `.alerts-security.alerts-${scoutSpace.id}`;

      // Reset any leftover state from a previous run before we recreate.
      await esClient.ml.deleteJob({ job_id: jobId, force: true }).catch(() => {});
      await esClient.indices
        .delete({ index: mlAnomalyIndex, ignore_unavailable: true, expand_wildcards: 'all' })
        .catch(() => {});

      // 1. Stub ML job, created via Kibana's internal ML API so it gets a
      //    saved-object association with the current space. Creating
      //    directly via `esClient.ml.putJob` would leave the job invisible
      //    to security_solution's ML rule executor — it checks
      //    `filterJobIdsForSpace` and reports unregistered jobs as
      //    "missing". The job carries no datafeed and never sees data;
      //    we synthesize anomaly records below.
      await kbnClient.request({
        method: 'PUT',
        path: `/s/${scoutSpace.id}/internal/ml/anomaly_detectors/${jobId}`,
        headers: { 'elastic-api-version': '1' },
        body: {
          description: `Scout coverage stub for kibana#253666 — ${scoutSpace.id}`,
          // `security` group is required for the job to be recognised as a
          // security ML job (see `isSecurityJob` in common/machine_learning).
          // Without it the exception flyout's field picker filters this job
          // out and falls back to no indices, leaving the runtime field
          // invisible in the dropdown.
          groups: ['security'],
          analysis_config: {
            bucket_span: '15m',
            detectors: [{ function: 'count' }],
            influencers: [],
          },
          data_description: { time_field: '@timestamp' },
          results_index_name: jobId,
          custom_settings: { security_app_display_name: `Scout 253666 ${scoutSpace.id}` },
        },
        retries: 0,
      });

      // 2. Manually create the anomaly results index with just enough
      //    mapping for the detection-engine ML rule executor to match it.
      //    ES would create this lazily after the first scored bucket — we
      //    skip ahead.
      //
      //    Real ML anomaly indices are hidden, but we deliberately leave
      //    this one visible: Kibana's data-view fields cache only surfaces
      //    hidden indices via a special code path, and for our test
      //    purposes the exception field picker needs to see the runtime
      //    field we add below. The visibility flag has no bearing on what
      //    the bulk-close server logic does.
      await esClient.indices.create({
        index: mlAnomalyIndex,
        mappings: {
          properties: {
            job_id: { type: 'keyword' },
            result_type: { type: 'keyword' },
            timestamp: { type: 'date' },
            bucket_span: { type: 'double' },
            detector_index: { type: 'integer' },
            is_interim: { type: 'boolean' },
            record_score: { type: 'double' },
            initial_record_score: { type: 'double' },
            probability: { type: 'double' },
            function: { type: 'keyword' },
            function_description: { type: 'keyword' },
            'source.address': { type: 'keyword' },
            'host.name': { type: 'keyword' },
            influencers: {
              type: 'nested',
              properties: {
                influencer_field_name: { type: 'keyword' },
                influencer_field_values: { type: 'keyword' },
              },
            },
          },
        },
      });

      // 3. Synthesize a single anomaly record. The rule executor reads
      //    records with `record_score >= anomaly_threshold` and
      //    `is_interim: false`. We seed one with a high score so the
      //    threshold is trivially cleared.
      const now = Date.now();
      await esClient.index({
        index: mlAnomalyIndex,
        refresh: 'wait_for',
        document: {
          job_id: jobId,
          result_type: 'record',
          timestamp: now - 60_000,
          bucket_span: 900,
          detector_index: 0,
          is_interim: false,
          record_score: 95,
          initial_record_score: 95,
          probability: 0.0001,
          function: 'count',
          function_description: 'count',
          'source.address': MATCHING_IP,
          'host.name': 'host-burst',
          influencers: [
            {
              influencer_field_name: 'source.address',
              influencer_field_values: [MATCHING_IP],
            },
            { influencer_field_name: 'host.name', influencer_field_values: ['host-burst'] },
          ],
        },
      });

      // 4. Mirror the security-ml#677 workaround: POST a runtime field
      //    directly onto the ML anomaly results index. This is what makes
      //    the exception field picker offer this field, and what the
      //    server resolves on bulk-close.
      await esClient.indices.putMapping({
        index: mlAnomalyIndex,
        expand_wildcards: 'all',
        runtime: {
          [runtimeFieldName]: {
            type: 'ip',
            script: { source: RUNTIME_FIELD_PAINLESS },
          },
        },
      });

      // 5. ML detection rule. `anomaly_threshold` sits well below the
      //    synthesized record's `record_score` so the rule fires on the
      //    seeded anomaly immediately.
      await kbnClient.request({
        method: 'POST',
        path: `/s/${scoutSpace.id}/api/detection_engine/rules`,
        body: {
          type: 'machine_learning',
          name: ruleName,
          description:
            'Bulk-close coverage for elastic/kibana#253666: runtime field on the ML anomaly results index (per elastic/security-ml#677).',
          severity: 'high',
          risk_score: 1,
          anomaly_threshold: 10,
          machine_learning_job_id: [jobId],
          rule_id: `runtime-field-bulk-close-ml-${idSegment}`,
          enabled: true,
          from: 'now-1h',
          interval: '1m',
        },
        retries: 0,
      });

      await browserAuth.loginAsAdmin();
    });

    spaceTest.afterEach(async ({ esClient, kbnClient, scoutSpace }) => {
      await kbnClient
        .request({
          method: 'POST',
          path: `/s/${scoutSpace.id}/api/detection_engine/rules/_bulk_action`,
          body: { query: '', action: 'delete' },
        })
        .catch(() => {});

      await esClient.ml.deleteJob({ job_id: jobId, force: true }).catch(() => {});
      await esClient.indices
        .delete({ index: mlAnomalyIndex, ignore_unavailable: true, expand_wildcards: 'all' })
        .catch(() => {});
      await esClient.deleteByQuery({
        index: alertsIndex,
        ignore_unavailable: true,
        refresh: true,
        query: { term: { 'kibana.alert.rule.name': ruleName } },
      });
    });

    spaceTest(
      'closes ML rule alerts when the exception references a runtime field on the anomaly index',
      async ({ pageObjects, page, esClient, apiServices }) => {
        await spaceTest.step('wait for the ML rule to produce at least one alert', async () => {
          await pageObjects.alertsTablePage.navigate();
          await pageObjects.alertsTablePage.waitForDetectionsAlertsWrapper();
          await apiServices.detectionAlerts.waitForAlerts(ruleName, 1, 180_000);
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
            // ML alerts pre-fill the first exception entry with the alert's
            // identifying field (here `host.name: host-burst`). Rather than
            // editing that pre-filled entry, add a second AND-joined entry
            // for the runtime field. Both conditions match the alert so
            // the exception is well-formed.
            await pageObjects.addExceptionFlyoutPage.addException(AddExceptionButtonType.AND);

            await pageObjects.addExceptionFlyoutPage.fillConditionEntry({
              entryIndex: 1,
              field: runtimeFieldName,
              operator: 'is',
              value: MATCHING_IP,
            });

            await pageObjects.addExceptionFlyoutPage.setExceptionName(
              `ML runtime field exception ${ruleName}`
            );
          }
        );

        await spaceTest.step(
          'bulk-close checkbox is enabled for an exception referencing a source-index runtime field',
          async () => {
            // Core assertion for elastic/kibana#253666. Pre-fix the checkbox
            // was disabled for any field not present on the alerts index
            // mapping; source-index runtime fields always trip that.
            await expect(pageObjects.addExceptionFlyoutPage.bulkCloseCheckbox).toBeEnabled();
          }
        );

        await spaceTest.step(
          'ticking bulk-close surfaces the runtime-field warning callout',
          async () => {
            await pageObjects.addExceptionFlyoutPage.tickBulkClose();
            await expect(
              page.testSubj.locator(BULK_CLOSE_RUNTIME_FIELD_WARNING_TEST_SUBJ)
            ).toBeVisible();
          }
        );

        await spaceTest.step('submit the exception', async () => {
          await pageObjects.addExceptionFlyoutPage.submit();
        });

        await spaceTest.step(
          'matching ML alerts transition to closed via runtime_mappings on update_by_query',
          async () => {
            // The server resolves the runtime field from the ML anomaly index
            // mapping and attaches it as `runtime_mappings` on the bulk-close
            // `_update_by_query`. The alert generated by the ML rule should
            // match the runtime field == 203.0.113.99 and move to `closed`.
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
          }
        );
      }
    );
  }
);
