/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiClientFixture } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import {
  apiTest,
  LOCAL_PUBLIC_LOCATION,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_API_URLS,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import { addMonitor } from '../../../common/fixtures/monitors';

// A dedicated tag scopes the inspect query to just this suite's monitors, so the
// assertions are unaffected by any other monitors that may exist in the space.
const TLS_RULE_TAG = 'scout-tls-rule-browser';

interface TLSRuleInspectBody {
  monitors: Array<{ id: string; name: string; type: string }>;
}

/**
 * API coverage for the browser-certificate extension of the Synthetics TLS rule
 * (`POST internal/synthetics/inspect_tls_rule`, which runs the rule executor's
 * monitor-selection step). It verifies that browser monitors are only evaluated
 * when the rule opts in via `includeBrowserCerts`, while lightweight HTTP/TCP
 * monitors are always evaluated — i.e. the flag is a strict, backwards-compatible
 * superset.
 *
 * Tests share worker-scoped Kibana/ES state and run sequentially.
 */
apiTest.describe(
  'tlsRuleBrowserCerts',
  {
    tag: [...tags.stateful.classic, ...tags.serverless.observability.complete],
  },
  () => {
    let editorHeaders: Record<string, string>;
    let httpMonitorId: string;
    let browserMonitorId: string;

    const inspectTlsRule = async (apiClient: ApiClientFixture, params: Record<string, unknown>) => {
      const res = await apiClient.post(SYNTHETICS_API_URLS.INSPECT_TLS_RULE, {
        headers: editorHeaders,
        body: { ...params, tags: [TLS_RULE_TAG] },
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(200);
      return (res.body as TLSRuleInspectBody).monitors ?? [];
    };

    apiTest.beforeAll(async ({ requestAuth, apiClient, kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
      const { apiKeyHeader } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(apiKeyHeader, { Accept: 'application/json' });

      // A lightweight HTTP monitor (TLS alerting enabled by default) and a browser
      // monitor, both tagged so the inspect query can target them.
      const httpRes = await addMonitor(apiClient, editorHeaders, {
        type: 'http',
        locations: [LOCAL_PUBLIC_LOCATION.id],
        url: 'https://tls-rule.scout.test',
        name: 'TLS rule HTTP monitor',
        tags: [TLS_RULE_TAG],
      });
      httpMonitorId = (httpRes.body as { id: string }).id;

      const browserRes = await addMonitor(apiClient, editorHeaders, {
        type: 'browser',
        locations: [LOCAL_PUBLIC_LOCATION.id],
        name: 'TLS rule browser monitor',
        'source.inline.script': 'step("simple journey", async () => {});',
        tags: [TLS_RULE_TAG],
      });
      browserMonitorId = (browserRes.body as { id: string }).id;
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({ types: SYNTHETICS_MONITOR_SO_TYPES });
    });

    apiTest(
      'evaluates only lightweight monitors when includeBrowserCerts is unset',
      async ({ apiClient }) => {
        const monitors = await inspectTlsRule(apiClient, {});
        const ids = monitors.map((monitor) => monitor.id);

        expect(ids).toContain(httpMonitorId);
        expect(ids).not.toContain(browserMonitorId);
      }
    );

    apiTest(
      'also evaluates browser monitors when includeBrowserCerts is true',
      async ({ apiClient }) => {
        const monitors = await inspectTlsRule(apiClient, { includeBrowserCerts: true });
        const ids = monitors.map((monitor) => monitor.id);

        expect(ids).toContain(httpMonitorId);
        expect(ids).toContain(browserMonitorId);

        const browserMonitor = monitors.find((monitor) => monitor.id === browserMonitorId);
        expect(browserMonitor?.type).toBe('browser');
      }
    );
  }
);
