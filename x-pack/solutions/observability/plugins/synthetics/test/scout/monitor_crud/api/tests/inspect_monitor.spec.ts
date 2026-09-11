/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/api';
import { tags } from '@kbn/scout-oblt';
import {
  apiTest,
  mergeSyntheticsApiHeaders,
  SYNTHETICS_MONITOR_SO_TYPES,
} from '../../../common/fixtures';
import { enableSynthetics, inspectMonitor } from '../../../common/fixtures/monitors';
import { createParam } from '../../../common/fixtures/params';
import { httpMonitorFixture } from '../../../common/fixtures/data/http_monitor';
import { inspectBrowserMonitorFixture } from '../fixtures/data/browser_monitor_fixture';

const LOCAL_PUBLIC_LOCATION = {
  id: 'dev',
  label: 'Dev Service',
  isServiceManaged: true,
};

const testParamWithNewLine = {
  key: 'testWithNewLine',
  value: `-----BEGIN CERTIFICATE-----\nMIICMzBgNV\n\npAqEAJlQND\n-----END CERTIFICATE-----`,
};

/**
 * Security regression guard: the resolved secret (with `hideParams: false`) must
 * never surface anywhere in the inspect response, regardless of which field emits
 * it. Asserts each non-empty line of the cert independently since `JSON.stringify`
 * escapes the embedded newlines.
 */
const assertNoRawSecret = (apiResponse: unknown) => {
  const serialized = JSON.stringify(apiResponse);
  for (const line of testParamWithNewLine.value.split('\n')) {
    if (line.trim().length > 0) {
      expect(serialized).not.toContain(line);
    }
  }
};

const DECODED_BROWSER_CODE =
  '// asset:/Users/vigneshh/elastic/synthetics/examples/todos/basic.journey.ts\nimport { journey, step, expect } from "@elastic/synthetics";\njourney("check if title is present", ({ page, params }) => {\n  step("launch app", async () => {\n    await page.goto(params.url);\n  });\n  step("assert title", async () => {\n    const header = await page.$("h1");\n    expect(await header.textContent()).toBe("todos");\n  });\n});\n';

/**
 * Ported from FTR
 * `x-pack/solutions/observability/test/api_integration_deployment_agnostic/apis/synthetics/inspect_monitor.ts`.
 *
 * Exercises `POST /internal/synthetics/service/monitor/inspect` for a public
 * HTTP monitor, a project browser monitor, and an HTTP monitor on a private
 * location. The original suite leaned on jest asymmetric matchers
 * (`expect.objectContaining` / `expect.any`); Scout's `expect` has none, so the
 * dynamic fields (`cloud_id`, `license_level`, `output.hosts`, `kibanaUrl`) are
 * asserted by type/shape and the rest is compared via deep equality.
 */
apiTest.describe(
  'inspectSyntheticsMonitor',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let editorHeaders: Record<string, string>;
    let adminHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth, apiClient, kbnClient }) => {
      const { apiKeyHeader: editorKey } = await requestAuth.getApiKey('editor');
      editorHeaders = mergeSyntheticsApiHeaders(editorKey);
      const { apiKeyHeader: adminKey } = await requestAuth.getApiKey('admin');
      adminHeaders = mergeSyntheticsApiHeaders(adminKey);

      await kbnClient.savedObjects.clean({
        types: [...SYNTHETICS_MONITOR_SO_TYPES, 'synthetics-param'],
      });
      await enableSynthetics(apiClient, editorHeaders);

      // add a test param with a newline; the http monitor references it via `${testWithNewLine}`
      await createParam(apiClient, adminHeaders, testParamWithNewLine);
    });

    apiTest.afterAll(async ({ kbnClient }) => {
      await kbnClient.savedObjects.clean({
        types: [...SYNTHETICS_MONITOR_SO_TYPES, 'synthetics-param'],
      });
    });

    apiTest('inspect http monitor', async ({ apiClient }) => {
      const apiResponse = await inspectMonitor(
        apiClient,
        adminHeaders,
        {
          ...httpMonitorFixture,
          password: '${testWithNewLine}',
          locations: [LOCAL_PUBLIC_LOCATION],
        },
        { hideParams: false }
      );

      expect(apiResponse.hasMissingReferences).toBe(false);
      expect(apiResponse.packagePolicyLinks).toStrictEqual([]);
      expect(apiResponse.result.privateConfig).toBeNull();
      expect(apiResponse.decodedCode).toBe('');
      expect(apiResponse.result.publicConfigs).toHaveLength(1);

      const publicConfig = apiResponse.result.publicConfigs![0];
      expect(typeof publicConfig.cloud_id).toBe('string');
      expect(typeof publicConfig.license_level).toBe('string');
      expect(Array.isArray(publicConfig.output.hosts)).toBe(true);

      const kibanaUrl = publicConfig.monitors[0].streams[0].fields.kibanaUrl;
      expect(typeof kibanaUrl).toBe('string');

      expect(publicConfig.monitors).toStrictEqual([
        {
          type: 'http',
          schedule: '@every 5m',
          enabled: true,
          data_stream: { namespace: 'testnamespace' },
          streams: [
            {
              data_stream: { dataset: 'http', type: 'synthetics' },
              type: 'http',
              enabled: true,
              schedule: '@every 5m',
              tags: ['tag1', 'tag2'],
              timeout: '180s',
              name: 'test-monitor-name',
              namespace: 'testnamespace',
              origin: 'ui',
              urls: 'https://nextjs-test-synthetics.vercel.app/api/users',
              max_redirects: '3',
              max_attempts: 2,
              password: '********',
              proxy_url: 'http://proxy.com',
              'response.include_body': 'never',
              'response.include_headers': true,
              'check.response.status': ['200', '201'],
              'check.request.body': '********',
              'check.request.headers': '********',
              username: '********',
              'response.include_body_max_bytes': '1024',
              ipv4: true,
              ipv6: true,
              fields: {
                kibanaUrl,
                meta: { space_id: ['default'] },
                'monitor.interval': 300,
              },
              fields_under_root: true,
              spaces: ['default'],
              maintenance_windows: [],
            },
          ],
        },
      ]);

      assertNoRawSecret(apiResponse);
    });

    apiTest('inspect project browser monitor', async ({ apiClient }) => {
      const apiResponse = await inspectMonitor(apiClient, editorHeaders, {
        ...inspectBrowserMonitorFixture,
        timeout: '30',
        params: JSON.stringify({
          username: 'elastic',
          password: 'changeme',
        }),
        locations: [LOCAL_PUBLIC_LOCATION],
      });

      expect(apiResponse.hasMissingReferences).toBe(false);
      expect(apiResponse.packagePolicyLinks).toStrictEqual([]);
      expect(apiResponse.result.privateConfig).toBeNull();
      expect(apiResponse.decodedCode).toBe(DECODED_BROWSER_CODE);
      expect(apiResponse.result.publicConfigs).toHaveLength(1);

      const publicConfig = apiResponse.result.publicConfigs![0];
      expect(typeof publicConfig.cloud_id).toBe('string');
      expect(typeof publicConfig.license_level).toBe('string');
      expect(Array.isArray(publicConfig.output.hosts)).toBe(true);

      const kibanaUrl = publicConfig.monitors[0].streams[0].fields.kibanaUrl;
      expect(typeof kibanaUrl).toBe('string');

      expect(publicConfig.monitors).toStrictEqual([
        {
          type: 'browser',
          schedule: '@every 10m',
          enabled: true,
          data_stream: { namespace: 'default' },
          streams: [
            {
              data_stream: { dataset: 'browser', type: 'synthetics' },
              type: 'browser',
              enabled: true,
              schedule: '@every 10m',
              name: 'check if title is present',
              namespace: 'default',
              origin: 'project',
              params: {
                username: '"********"',
                password: '"********"',
                testWithNewLine: '"*******"',
              },
              playwright_options: { headless: true, chromiumSandbox: false },
              'source.project.content': inspectBrowserMonitorFixture['source.project.content'],
              'filter_journeys.match': 'check if title is present',
              ignore_https_errors: false,
              throttling: { download: 5, upload: 3, latency: 20 },
              original_space: 'default',
              fields: {
                kibanaUrl,
                meta: { space_id: ['default'] },
                'monitor.interval': 600,
                'monitor.project.name': 'test-project-cb47c83a-45e7-416a-9301-cb476b5bff01',
                'monitor.project.id': 'test-project-cb47c83a-45e7-416a-9301-cb476b5bff01',
              },
              fields_under_root: true,
              max_attempts: 2,
              spaces: [],
              maintenance_windows: [],
            },
          ],
        },
      ]);

      expect(publicConfig.monitors[0].streams[0].timeout).toBeUndefined();
    });

    apiTest('inspect http monitor in private location', async ({ apiClient, apiServices }) => {
      const location = await apiServices.syntheticsPrivateLocations.addTestPrivateLocation();
      const apiResponse = await inspectMonitor(
        apiClient,
        editorHeaders,
        {
          ...httpMonitorFixture,
          password: '${testWithNewLine}',
          locations: [
            {
              id: location.id,
              label: location.label,
              isServiceManaged: false,
            },
          ],
        },
        { hideParams: false }
      );

      const privateConfig = apiResponse.result.privateConfig!;

      const enabledStream = privateConfig.inputs
        .find((input: { enabled: boolean }) => input.enabled)
        ?.streams.find((stream: { enabled: boolean }) => stream.enabled);

      const compiledStream = enabledStream?.compiled_stream;

      delete compiledStream.id;
      delete compiledStream.processors[0].add_fields.fields.config_id;
      delete compiledStream.processors[0].add_fields.fields.kibanaUrl;

      // Fleet `vars` entries keep their `{ value, type }` shape; only the value is redacted.
      expect(enabledStream?.vars?.password?.value).toBe('********');

      assertNoRawSecret(apiResponse);

      // The `synthetics` Fleet package omits `enabled` (when true, the Heartbeat
      // default), `check.request.method` (when unset) and `__ui` (falsy UI-only
      // metadata) from the compiled stream instead of always emitting them -
      // tolerate either representation rather than pinning the test to one
      // package version.
      expect(compiledStream.enabled ?? true).toBe(true);
      expect(compiledStream['check.request.method'] ?? null).toBeNull();
      expect(compiledStream.__ui ?? null).toBeNull();
      delete compiledStream.enabled;
      delete compiledStream['check.request.method'];
      delete compiledStream.__ui;

      expect(enabledStream?.compiled_stream).toStrictEqual({
        type: 'http',
        name: 'test-monitor-name',
        origin: 'ui',
        'run_from.id': location.id,
        'run_from.geo.name': location.label,
        urls: 'https://nextjs-test-synthetics.vercel.app/api/users',
        schedule: '@every 5m',
        timeout: '180s',
        max_redirects: 3,
        max_attempts: 2,
        proxy_url: 'http://proxy.com',
        tags: ['tag1', 'tag2'],
        username: '********',
        password: '********',
        'response.include_headers': true,
        'response.include_body': 'never',
        'response.include_body_max_bytes': 1024,
        'check.request.headers': '********',
        'check.request.body': '********',
        'check.response.status': ['200', '201'],
        ipv4: true,
        ipv6: true,
        processors: [
          {
            add_fields: {
              target: '',
              fields: {
                meta: { space_id: 'default' },
                'monitor.fleet_managed': true,
                'monitor.interval': 300,
              },
            },
          },
        ],
        maintenance_windows: null,
      });
    });
  }
);
