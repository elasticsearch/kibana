/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import {
  apiTest,
  LOCAL_PUBLIC_LOCATION,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_ALERTS_INDEX,
  SYNTHETICS_MONITOR_SO_TYPES,
  type SyntheticsAlertDoc,
  type SyntheticsApiServicesFixture,
} from '../../../common/fixtures';
import { addMonitor } from '../../../common/fixtures/monitors';

const TLS_RULE_TAG = 'scout-tls-rule-browser-alert';
const BROWSER_NETWORK_DATA_STREAM = 'synthetics-browser.network-default';

const TLS_RULE_TYPE_ID = 'xpack.synthetics.alerts.tls';
// The TLS rule registers under the `uptime` producer (see registerSyntheticsTLSCheckRule).
const TLS_RULE_CONSUMER = 'uptime';

const DAY_MS = 24 * 60 * 60 * 1000;

const CERT_COMMON_NAME = 'alerting.browser.scout.test';
const CERT_ISSUER = 'Browser Test CA';
// Browser network events carry no sha256 fingerprint, so the rule derives a
// stable, fingerprint-free alert id from the subject common name + issuer
// (see getTLSCertAlertId in server/alert_rules/tls_rule/message_utils.ts).
const EXPECTED_ALERT_ID = `browser-cert:${CERT_COMMON_NAME}:${CERT_ISSUER}`;

/**
 * End-to-end coverage for the browser-certificate path of the Synthetics TLS
 * rule. Unlike `tls_rule_browser_certs.spec.ts` (which only exercises the rule
 * executor's monitor-selection step via `inspect_tls_rule`), this spec stands
 * up a real `xpack.synthetics.alerts.tls` rule and asserts the full lifecycle:
 *
 *  - a `journey/network_info` browser event carrying `tls.server.x509.*` and no
 *    `sha256` makes the rule fire an alert keyed on the fingerprint-free
 *    `browser-cert:{commonName}:{issuer}` identity, and
 *  - removing that certificate event recovers the alert on the next run.
 *
 * Tests share worker-scoped Kibana/ES state and run sequentially: the first
 * test fires the alert, the second recovers it.
 */
apiTest.describe(
  'tlsRuleBrowserCertsAlert',
  {
    tag: ['@local-stateful-classic', '@local-serverless-observability_complete'],
  },
  () => {
    let editorHeaders: Record<string, string>;
    let browserMonitorId: string;
    let ruleId: string;

    // Seeds an expiring browser network event (`synthetics.type:
    // journey/network_info`) carrying a TLS certificate but no sha256, attached
    // to the browser monitor by reusing its id as `monitor.id`/`config_id` (the
    // rule scopes browser certs by monitor id, not by saved-object type).
    const indexExpiringBrowserCert = async (esClient: EsClient) => {
      const now = Date.now();
      const document: Record<string, any> = {
        '@timestamp': new Date(now).toISOString(),
        config_id: browserMonitorId,
        monitor: {
          id: browserMonitorId,
          name: 'TLS rule browser monitor',
          type: 'browser',
          timespan: {
            gte: new Date(now - 3 * 60 * 1000).toISOString(),
            lt: new Date(now).toISOString(),
          },
        },
        synthetics: { type: 'journey/network_info' },
        url: { full: 'https://alerting.browser.scout.test/' },
        observer: { name: LOCAL_PUBLIC_LOCATION.id, geo: { name: LOCAL_PUBLIC_LOCATION.label } },
        agent: { name: 'scout-agent' },
        http: { response: { mime_type: 'text/html' } },
        tls: {
          server: {
            x509: {
              subject: {
                common_name: CERT_COMMON_NAME,
                distinguished_name: `CN=${CERT_COMMON_NAME}`,
              },
              issuer: { common_name: CERT_ISSUER },
              // Within the rule's expiration threshold, so the cert is reported.
              not_after: new Date(now + 5 * DAY_MS).toISOString(),
              not_before: new Date(now - 300 * DAY_MS).toISOString(),
            },
          },
        },
        tags: [TLS_RULE_TAG],
      };
      await esClient.index({
        index: BROWSER_NETWORK_DATA_STREAM,
        document,
        refresh: 'wait_for',
      });
    };

    const getAlert = async (esClient: EsClient): Promise<SyntheticsAlertDoc | undefined> => {
      const res = await esClient.search<SyntheticsAlertDoc>({
        index: SYNTHETICS_ALERTS_INDEX,
        ignore_unavailable: true,
        size: 1,
        query: {
          bool: {
            filter: [
              { term: { 'kibana.alert.rule.uuid': ruleId } },
              { term: { 'kibana.alert.instance.id': EXPECTED_ALERT_ID } },
            ],
          },
        },
        sort: [{ '@timestamp': 'desc' }],
      });
      return res.hits.hits[0]?._source;
    };

    // Re-runs the rule and polls the alerts-as-data index until the browser-cert
    // alert reaches the expected status. The rule executor uses the alerting
    // framework's task scheduler, so the index write is eventually consistent.
    const runRuleAndWaitForAlertStatus = async (
      esClient: EsClient,
      apiServices: SyntheticsApiServicesFixture,
      status: 'active' | 'recovered',
      timeoutMs = 60_000
    ): Promise<SyntheticsAlertDoc> => {
      await apiServices.alerting.rules.runSoon(ruleId);
      const deadline = Date.now() + timeoutMs;
      let last: SyntheticsAlertDoc | undefined;
      while (Date.now() < deadline) {
        last = await getAlert(esClient);
        if (last?.['kibana.alert.status'] === status) {
          return last;
        }
        // Nudge another execution in case the seeded change landed mid-run.
        await apiServices.alerting.rules.runSoon(ruleId);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      throw new Error(
        `Timed out waiting for alert ${EXPECTED_ALERT_ID} to reach status "${status}". ` +
          `Last seen: ${JSON.stringify(last)}`
      );
    };

    apiTest.beforeAll(async ({ requestAuth, apiClient, apiServices, esClient, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      await apiServices.alerting.cleanup.deleteRulesByTags([TLS_RULE_TAG]);
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });
      await apiServices.syntheticsPrivateLocations.getSharedPrivateLocation();

      const browserRes = await addMonitor(apiClient, editorHeaders, {
        type: 'browser',
        locations: [LOCAL_PUBLIC_LOCATION.id],
        name: 'TLS rule browser monitor',
        'source.inline.script': 'step("simple journey", async () => {});',
        tags: [TLS_RULE_TAG],
      });
      browserMonitorId = (browserRes.body as { id: string }).id;

      await indexExpiringBrowserCert(esClient);

      const created = await apiServices.alerting.rules.create({
        name: 'Scout browser TLS rule',
        ruleTypeId: TLS_RULE_TYPE_ID,
        consumer: TLS_RULE_CONSUMER,
        params: {
          includeBrowserCerts: true,
          certExpirationThreshold: 30,
          tags: [TLS_RULE_TAG],
        },
        schedule: { interval: '1m' },
        enabled: true,
        tags: [TLS_RULE_TAG],
      });
      expect(created).toHaveStatusCode(200);
      ruleId = created.data.id;
    });

    apiTest.afterAll(async ({ apiServices, esClient, kbnClient }) => {
      await apiServices.alerting.cleanup.deleteRulesByTags([TLS_RULE_TAG]);
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      await esClient.deleteByQuery({
        index: `${BROWSER_NETWORK_DATA_STREAM}*`,
        query: { terms: { tags: [TLS_RULE_TAG] } },
        conflicts: 'proceed',
        refresh: true,
        ignore_unavailable: true,
      });
    });

    apiTest(
      'fires an alert for an expiring browser-monitor certificate',
      async ({ apiServices, esClient }) => {
        const alert = await runRuleAndWaitForAlertStatus(esClient, apiServices, 'active');

        expect(alert['kibana.alert.instance.id']).toBe(EXPECTED_ALERT_ID);
        expect(alert['kibana.alert.status']).toBe('active');
      }
    );

    apiTest(
      'recovers the alert once the browser certificate is no longer evaluated',
      async ({ apiServices, esClient }) => {
        // Drop the certificate event so the next run no longer reports the cert;
        // the alerting framework then recovers the previously active alert.
        await esClient.deleteByQuery({
          index: `${BROWSER_NETWORK_DATA_STREAM}*`,
          query: { terms: { tags: [TLS_RULE_TAG] } },
          conflicts: 'proceed',
          refresh: true,
          ignore_unavailable: true,
        });

        const alert = await runRuleAndWaitForAlertStatus(esClient, apiServices, 'recovered');

        expect(alert['kibana.alert.instance.id']).toBe(EXPECTED_ALERT_ID);
        expect(alert['kibana.alert.status']).toBe('recovered');
      }
    );
  }
);
