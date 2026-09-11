/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { ConfigKey, MonitorTypeEnum } from '../../../../common/runtime_types';
import { formatSyntheticsPolicy } from './format_synthetics_policy';
import { PROFILE_VALUES_ENUM, PROFILES_MAP } from '../../../../common/constants/monitor_defaults';
import type { MaintenanceWindow } from '@kbn/maintenance-windows-plugin/common';

const gParams = { proxyUrl: 'https://proxy.com' };
const testMW = [
  {
    id: '190bd51b-985a-4553-9fba-57222ddde6b7',
    title: 'test',
    enabled: true,
    duration: 1800000,
    expirationDate: '2026-06-10T11:43:25.175Z',
    events: [{ gte: '2025-06-10T11:40:29.124Z', lte: '2025-06-10T12:10:29.124Z' }],
    rRule: { dtstart: '2025-06-10T11:40:29.124Z', tzid: 'Europe/Berlin', freq: 0, count: 1 },
    createdBy: 'elastic',
    updatedBy: 'elastic',
    createdAt: '2025-06-10T11:43:25.176Z',
    updatedAt: '2025-06-10T11:43:25.176Z',
    eventStartTime: '2025-06-10T11:40:29.124Z',
    eventEndTime: '2025-06-10T12:10:29.124Z',
    status: 'running',
    categoryIds: null,
    scopedQuery: null,
  },
] as MaintenanceWindow[];

describe('formatSyntheticsPolicy', () => {
  it('formats browser policy', () => {
    const { formattedPolicy } = formatSyntheticsPolicy(
      testNewPolicy,
      MonitorTypeEnum.BROWSER,
      browserConfig,
      gParams,
      testMW
    );

    expect(formattedPolicy).toEqual({
      enabled: true,
      inputs: [
        {
          enabled: true,
          policy_template: 'synthetics',
          streams: [
            {
              data_stream: {
                dataset: 'browser',
                type: 'synthetics',
              },
              enabled: true,
              vars: {
                __ui: {
                  type: 'yaml',
                  value: null,
                },
                config_id: {
                  type: 'text',
                  value: '00bb3ceb-a242-4c7a-8405-8da963661374',
                },
                enabled: {
                  type: 'bool',
                  value: true,
                },
                'filter_journeys.match': {
                  type: 'text',
                  value: null,
                },
                'filter_journeys.tags': {
                  type: 'yaml',
                  value: null,
                },
                id: {
                  type: 'text',
                  value: '"00bb3ceb-a242-4c7a-8405-8da963661374"',
                },
                ignore_https_errors: {
                  type: 'bool',
                  value: false,
                },
                certificate_error_spki_allowlist: {
                  type: 'yaml',
                  value: null,
                },
                location_name: {
                  type: 'text',
                  value: 'Test private location 0',
                },
                'monitor.project.id': {
                  type: 'text',
                },
                'monitor.project.name': {
                  type: 'text',
                },
                name: {
                  type: 'text',
                  value: '"Test HTTP Monitor 03"',
                },
                origin: {
                  type: 'text',
                  value: 'ui',
                },
                params: {
                  type: 'yaml',
                  value:
                    '{"proxyUrl":"https://proxy.com/local","proxyUsername":"username","proxyPassword":"password"}',
                },
                playwright_options: {
                  type: 'yaml',
                  value: '',
                },
                run_once: {
                  type: 'bool',
                  value: false,
                },
                schedule: {
                  type: 'text',
                  value: '"@every 3m"',
                },
                screenshots: {
                  type: 'text',
                  value: null,
                },
                'service.name': {
                  type: 'text',
                  value: '"Local Service"',
                },
                'source.inline.script': {
                  type: 'yaml',
                  value:
                    'c3RlcCgiVmlzaXQgL3VzZXJzIGFwaSByb3V0ZSIsIGFzeW5jICgpID0+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBwYWdlLmdvdG8oJ2h0dHBzOi8vbmV4dGpzLXRlc3Qtc3ludGhldGljcy52ZXJjZWwuYXBwL2FwaS91c2VycycpO1xuICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzKCkpLnRvRXF1YWwoMjAwKTtcbn0pOw==',
                },
                'source.inline.encoding': {
                  type: 'text',
                  value: 'base64',
                },
                'source.project.content': {
                  type: 'text',
                  value: '',
                },
                synthetics_args: {
                  type: 'text',
                  value: null,
                },
                tags: {
                  type: 'yaml',
                  value: '["cookie-test","browser"]',
                },
                'throttling.config': {
                  type: 'text',
                  value: JSON.stringify({ download: 5, upload: 3, latency: 20 }),
                },
                timeout: {
                  type: 'text',
                  value: '30s',
                },
                type: {
                  type: 'text',
                  value: 'browser',
                },
                maintenance_windows: {
                  type: 'yaml',
                  value:
                    '[{"dtstart":"2025-06-10T11:40:29.124Z","tzid":"Europe/Berlin","freq":"yearly","count":1,"duration":"1800000ms"}]',
                },
              },
            },
            {
              data_stream: {
                dataset: 'browser.network',
                type: 'synthetics',
              },
              enabled: true,
            },
            {
              data_stream: {
                dataset: 'browser.screenshot',
                type: 'synthetics',
              },
              enabled: true,
            },
          ],
          type: 'synthetics/browser',
        },
      ],
      is_managed: true,
      name: 'Test HTTP Monitor 03-Test private location 0-default',
      namespace: 'testnamespace',
      package: {
        experimental_data_stream_features: [],
        name: 'synthetics',
        title: 'Elastic Synthetics',
        version: '0.11.4',
      },
      policy_ids: ['404812e0-90e1-11ed-8111-f7f9cad30b61'],
    });
  });

  it('formats certificate_error_spki_allowlist as JSON for private policy', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----';
    const { formattedPolicy } = formatSyntheticsPolicy(
      testNewPolicy,
      MonitorTypeEnum.BROWSER,
      {
        ...browserConfig,
        [ConfigKey.CERTIFICATE_ERROR_SPKI_ALLOWLIST]: [pem],
      },
      gParams,
      testMW
    );

    const browserStream = formattedPolicy.inputs
      .find((input) => input.type === 'synthetics/browser')
      ?.streams.find((stream) => stream.data_stream.dataset === 'browser');

    expect(browserStream?.vars?.certificate_error_spki_allowlist).toEqual({
      type: 'yaml',
      value: JSON.stringify([pem]),
    });
  });

  it.each([true, false])('formats http policy', (isTLSEnabled) => {
    const { formattedPolicy } = formatSyntheticsPolicy(
      testNewPolicy,
      MonitorTypeEnum.HTTP,
      {
        ...httpPolicy,
        [ConfigKey.METADATA]: { is_tls_enabled: isTLSEnabled },
      },
      gParams,
      []
    );

    expect(formattedPolicy).toEqual({
      enabled: true,
      inputs: [
        {
          enabled: true,
          policy_template: 'synthetics',
          streams: [
            {
              data_stream: {
                dataset: 'http',
                type: 'synthetics',
              },
              enabled: true,
              vars: {
                __ui: {
                  type: 'yaml',
                  value: null,
                },
                'check.request.body': {
                  type: 'yaml',
                  value: null,
                },
                'check.request.headers': {
                  type: 'yaml',
                  value: null,
                },
                'check.request.method': {
                  type: 'text',
                  value: null,
                },
                'check.response.body.negative': {
                  type: 'yaml',
                  value: null,
                },
                'check.response.body.positive': {
                  type: 'yaml',
                  value: null,
                },
                'check.response.headers': {
                  type: 'yaml',
                  value: null,
                },
                'check.response.status': {
                  type: 'yaml',
                  value: null,
                },
                config_id: {
                  type: 'text',
                  value: '51ccd9d9-fc3f-4718-ba9d-b6ef80e73fc5',
                },
                enabled: {
                  type: 'bool',
                  value: true,
                },
                id: {
                  type: 'text',
                  value: '"51ccd9d9-fc3f-4718-ba9d-b6ef80e73fc5"',
                },
                location_name: {
                  type: 'text',
                  value: 'Test private location 0',
                },
                max_redirects: {
                  type: 'integer',
                  value: null,
                },
                'monitor.project.id': {
                  type: 'text',
                },
                'monitor.project.name': {
                  type: 'text',
                },
                name: {
                  type: 'text',
                  value: '"Test Monitor"',
                },
                origin: {
                  type: 'text',
                  value: 'ui',
                },
                password: {
                  type: 'password',
                  value: '"changeme"',
                },
                proxy_url: {
                  type: 'text',
                  value: '"https://proxy.com"',
                },
                'response.include_body': {
                  type: 'text',
                  value: null,
                },
                'response.include_headers': {
                  type: 'bool',
                  value: true,
                },
                run_once: {
                  type: 'bool',
                  value: false,
                },
                schedule: {
                  type: 'text',
                  value: '"@every 3m"',
                },
                'service.name': {
                  type: 'text',
                  value: '"LocalService"',
                },
                'ssl.certificate': {
                  type: 'yaml',
                  value: null,
                },
                'ssl.certificate_authorities': {
                  type: 'yaml',
                  value: null,
                },
                'ssl.key': {
                  type: 'yaml',
                  value: null,
                },
                'ssl.key_passphrase': {
                  type: 'text',
                  value: null,
                },
                'ssl.supported_protocols': {
                  type: 'yaml',
                  value: isTLSEnabled ? '["TLSv1.1","TLSv1.2","TLSv1.3"]' : null,
                },
                'ssl.verification_mode': {
                  type: 'text',
                  value: isTLSEnabled ? 'full' : null,
                },
                tags: {
                  type: 'yaml',
                  value: null,
                },
                timeout: {
                  type: 'text',
                  value: null,
                },
                type: {
                  type: 'text',
                  value: 'http',
                },
                urls: {
                  type: 'text',
                  value: '"https://www.google.com"',
                },
                username: {
                  type: 'text',
                  value: '"admin"',
                },
                maintenance_windows: { type: 'yaml' },
              },
            },
          ],
          type: 'synthetics/http',
        },
      ],
      is_managed: true,
      name: 'Test HTTP Monitor 03-Test private location 0-default',
      namespace: 'testnamespace',
      package: {
        experimental_data_stream_features: [],
        name: 'synthetics',
        title: 'Elastic Synthetics',
        version: '0.11.4',
      },
      policy_ids: ['404812e0-90e1-11ed-8111-f7f9cad30b61'],
    });
  });
  it('keeps http fields that differ from the Heartbeat default', () => {
    const { formattedPolicy } = formatSyntheticsPolicy(
      testNewPolicy,
      MonitorTypeEnum.HTTP,
      {
        ...httpPolicy,
        [ConfigKey.REQUEST_METHOD_CHECK]: 'POST',
        [ConfigKey.MAX_REDIRECTS]: '5',
        [ConfigKey.RESPONSE_BODY_INDEX]: 'always',
        [ConfigKey.TIMEOUT]: '30',
      },
      gParams,
      []
    );

    const vars = formattedPolicy.inputs
      .find((input) => input.type === 'synthetics/http')
      ?.streams.find((stream) => stream.data_stream.dataset === 'http')?.vars;

    expect(vars?.['check.request.method'].value).toBe('POST');
    expect(vars?.max_redirects.value).toBe('5');
    expect(vars?.['response.include_body'].value).toBe('always');
    expect(vars?.timeout.value).toBe('30s');
  });

  it('omits http fields that equal the Heartbeat default', () => {
    const { formattedPolicy } = formatSyntheticsPolicy(
      testNewPolicy,
      MonitorTypeEnum.HTTP,
      httpPolicy,
      gParams,
      []
    );

    const vars = formattedPolicy.inputs
      .find((input) => input.type === 'synthetics/http')
      ?.streams.find((stream) => stream.data_stream.dataset === 'http')?.vars;

    // Defaults are dropped so the agent falls back to its own defaults.
    expect(vars?.['check.request.method'].value).toBeNull();
    expect(vars?.max_redirects.value).toBeNull();
    expect(vars?.['response.include_body'].value).toBeNull();
    expect(vars?.timeout.value).toBeNull();

    // __ui is UI-only metadata that Heartbeat ignores; it is dropped from the policy.
    expect(vars?.__ui.value).toBeNull();

    // response.include_headers (bool default true) is intentionally still sent.
    expect(vars?.['response.include_headers'].value).toBe(true);
  });

  // API monitors emit a companion `synthetics.api.network` document per request
  // via Heartbeat. Without enabling the `api.network` companion stream here,
  // Fleet generates an agent API key that lacks write privileges on
  // `synthetics-synthetics.api.network-default`, and ES rejects every network
  // event with a 403 — silently emptying the data stream while summary docs
  // continue to land. Mirror the long-standing browser → browser.network /
  // browser.screenshot wiring so the API key permissions match what
  // Heartbeat will actually publish.
  it('enables the api.network companion stream for api monitors', () => {
    const { formattedPolicy } = formatSyntheticsPolicy(
      makeApiPolicyV110(),
      MonitorTypeEnum.API,
      {
        type: 'api',
        enabled: true,
        name: 'API monitor',
        schedule: { number: '1', unit: 'm' },
        config_id: 'abc',
        location_name: 'Private',
      } as any,
      gParams,
      testMW
    );

    const apiInput = formattedPolicy.inputs.find((i) => i.type === 'synthetics/api');
    expect(apiInput?.enabled).toBe(true);
    const streams = apiInput?.streams ?? [];
    const apiStream = streams.find((s) => s.data_stream.dataset === 'api');
    const apiNetworkStream = streams.find((s) => s.data_stream.dataset === 'api.network');
    expect(apiStream?.enabled).toBe(true);
    expect(apiNetworkStream?.enabled).toBe(true);
  });

  it('base64-encodes inline API scripts using the 1.10.0 source.inline.encoding var', () => {
    const script =
      'apiJourney("health", async ({ request }) => { await request.get("https://example.com"); });';

    const { formattedPolicy, hasInput } = formatSyntheticsPolicy(
      makeApiPolicyV110(),
      MonitorTypeEnum.API,
      {
        type: 'api',
        enabled: true,
        name: 'API monitor',
        schedule: { number: '1', unit: 'm' },
        location_name: 'Private',
        'source.inline.script': script,
      } as any,
      gParams,
      testMW
    );

    expect(hasInput).toBe(true);
    const apiStream = formattedPolicy.inputs
      .find((i) => i.type === 'synthetics/api')
      ?.streams.find((s) => s.data_stream.dataset === 'api');
    expect(apiStream?.vars?.['source.inline.encoding']?.value).toBe('base64');
    expect(apiStream?.vars?.['source.inline.script']?.value).toBe(
      Buffer.from(script).toString('base64')
    );
  });

  it('reports hasInput false when the installed package has no synthetics/api input', () => {
    const { hasInput, hasDataStream } = formatSyntheticsPolicy(
      {
        ...testNewPolicy,
        package: { ...testNewPolicy.package, version: '1.9.0' },
      },
      MonitorTypeEnum.API,
      {
        type: 'api',
        enabled: true,
        name: 'API monitor',
        schedule: { number: '1', unit: 'm' },
      } as any,
      gParams,
      testMW
    );

    expect(hasInput).toBe(false);
    expect(hasDataStream).toBe(false);
  });
});

const testNewPolicy = {
  name: 'Test HTTP Monitor 03-Test private location 0-default',
  namespace: 'testnamespace',
  package: {
    name: 'synthetics',
    title: 'Elastic Synthetics',
    version: '0.11.4',
    experimental_data_stream_features: [],
  },
  enabled: true,
  policy_ids: ['404812e0-90e1-11ed-8111-f7f9cad30b61'],
  inputs: [
    {
      type: 'synthetics/http',
      policy_template: 'synthetics',
      enabled: false,
      streams: [
        {
          enabled: false,
          data_stream: { type: 'synthetics', dataset: 'http' },
          vars: {
            __ui: { type: 'yaml' },
            enabled: { value: true, type: 'bool' },
            type: { value: 'http', type: 'text' },
            name: { type: 'text' },
            schedule: { value: '"@every 3m"', type: 'text' },
            urls: { type: 'text' },
            'service.name': { type: 'text' },
            timeout: { type: 'text' },
            max_redirects: { type: 'integer' },
            proxy_url: { type: 'text' },
            tags: { type: 'yaml' },
            username: { type: 'text' },
            password: { type: 'password' },
            'response.include_headers': { type: 'bool' },
            'response.include_body': { type: 'text' },
            'check.request.method': { type: 'text' },
            'check.request.headers': { type: 'yaml' },
            'check.request.body': { type: 'yaml' },
            'check.response.status': { type: 'yaml' },
            'check.response.headers': { type: 'yaml' },
            'check.response.body.positive': { type: 'yaml' },
            'check.response.body.negative': { type: 'yaml' },
            'ssl.certificate_authorities': { type: 'yaml' },
            'ssl.certificate': { type: 'yaml' },
            'ssl.key': { type: 'yaml' },
            'ssl.key_passphrase': { type: 'text' },
            'ssl.verification_mode': { type: 'text' },
            'ssl.supported_protocols': { type: 'yaml' },
            location_name: { value: 'Fleet managed', type: 'text' },
            id: { type: 'text' },
            config_id: { type: 'text' },
            run_once: { value: false, type: 'bool' },
            origin: { type: 'text' },
            'monitor.project.id': { type: 'text' },
            'monitor.project.name': { type: 'text' },
            maintenance_windows: { type: 'yaml' },
          },
        },
      ],
    },
    {
      type: 'synthetics/tcp',
      policy_template: 'synthetics',
      enabled: false,
      streams: [
        {
          enabled: false,
          data_stream: { type: 'synthetics', dataset: 'tcp' },
          vars: {
            __ui: { type: 'yaml' },
            enabled: { value: true, type: 'bool' },
            type: { value: 'tcp', type: 'text' },
            name: { type: 'text' },
            schedule: { value: '"@every 3m"', type: 'text' },
            hosts: { type: 'text' },
            'service.name': { type: 'text' },
            timeout: { type: 'text' },
            proxy_url: { type: 'text' },
            proxy_use_local_resolver: { value: false, type: 'bool' },
            tags: { type: 'yaml' },
            'check.send': { type: 'text' },
            'check.receive': { type: 'text' },
            'ssl.certificate_authorities': { type: 'yaml' },
            'ssl.certificate': { type: 'yaml' },
            'ssl.key': { type: 'yaml' },
            'ssl.key_passphrase': { type: 'text' },
            'ssl.verification_mode': { type: 'text' },
            'ssl.supported_protocols': { type: 'yaml' },
            location_name: { value: 'Fleet managed', type: 'text' },
            id: { type: 'text' },
            config_id: { type: 'text' },
            run_once: { value: false, type: 'bool' },
            origin: { type: 'text' },
            'monitor.project.id': { type: 'text' },
            'monitor.project.name': { type: 'text' },
            maintenance_windows: { type: 'yaml' },
          },
        },
      ],
    },
    {
      type: 'synthetics/icmp',
      policy_template: 'synthetics',
      enabled: false,
      streams: [
        {
          enabled: false,
          data_stream: { type: 'synthetics', dataset: 'icmp' },
          vars: {
            __ui: { type: 'yaml' },
            enabled: { value: true, type: 'bool' },
            type: { value: 'icmp', type: 'text' },
            name: { type: 'text' },
            schedule: { value: '"@every 3m"', type: 'text' },
            wait: { value: '1s', type: 'text' },
            hosts: { type: 'text' },
            'service.name': { type: 'text' },
            timeout: { type: 'text' },
            tags: { type: 'yaml' },
            location_name: { value: 'Fleet managed', type: 'text' },
            id: { type: 'text' },
            config_id: { type: 'text' },
            run_once: { value: false, type: 'bool' },
            origin: { type: 'text' },
            'monitor.project.id': { type: 'text' },
            'monitor.project.name': { type: 'text' },
            maintenance_windows: { type: 'yaml' },
          },
        },
      ],
    },
    {
      type: 'synthetics/browser',
      policy_template: 'synthetics',
      enabled: true,
      streams: [
        {
          enabled: true,
          data_stream: { type: 'synthetics', dataset: 'browser' },
          vars: {
            __ui: { type: 'yaml' },
            enabled: { value: true, type: 'bool' },
            type: { value: 'browser', type: 'text' },
            name: { type: 'text' },
            schedule: { value: '"@every 3m"', type: 'text' },
            'service.name': { type: 'text' },
            timeout: { type: 'text' },
            tags: { type: 'yaml' },
            'source.inline.script': { type: 'yaml' },
            'source.inline.encoding': { type: 'text' },
            'source.project.content': { type: 'text' },
            params: { type: 'yaml' },
            playwright_options: { type: 'yaml' },
            screenshots: { type: 'text' },
            synthetics_args: { type: 'text' },
            ignore_https_errors: { type: 'bool' },
            certificate_error_spki_allowlist: { type: 'yaml' },
            'throttling.config': { type: 'text' },
            'filter_journeys.tags': { type: 'yaml' },
            'filter_journeys.match': { type: 'text' },
            location_name: { value: 'Fleet managed', type: 'text' },
            id: { type: 'text' },
            config_id: { type: 'text' },
            run_once: { value: false, type: 'bool' },
            origin: { type: 'text' },
            'monitor.project.id': { type: 'text' },
            'monitor.project.name': { type: 'text' },
            maintenance_windows: { type: 'yaml' },
          },
        },
        { enabled: false, data_stream: { type: 'synthetics', dataset: 'browser.network' } },
        { enabled: false, data_stream: { type: 'synthetics', dataset: 'browser.screenshot' } },
      ],
    },
  ],
  is_managed: true,
};

const browserConfig: any = {
  type: 'browser',
  form_monitor_type: 'multistep',
  enabled: true,
  alert: { status: { enabled: true } },
  schedule: { number: '3', unit: 'm' },
  'service.name': 'Local Service',
  config_id: '00bb3ceb-a242-4c7a-8405-8da963661374',
  tags: ['cookie-test', 'browser'],
  timeout: '60',
  name: 'Test HTTP Monitor 03',
  locations: [
    {
      id: '404812e0-90e1-11ed-8111-f7f9cad30b61',
      label: 'Test private location 0',
      isServiceManaged: false,
    },
  ],
  namespace: 'testnamespace',
  origin: 'ui',
  journey_id: '',
  hash: '',
  id: '00bb3ceb-a242-4c7a-8405-8da963661374',
  project_id: '',
  playwright_options: '',
  __ui: {
    script_source: { is_generated_script: false, file_name: '' },
    is_tls_enabled: false,
  },
  params:
    '{"proxyUrl":"https://proxy.com/local","proxyUsername":"username","proxyPassword":"password"}',
  'url.port': null,
  'source.inline.script':
    'step("Visit /users api route", async () => {\\n  const response = await page.goto(\'https://nextjs-test-synthetics.vercel.app/api/users\');\\n  expect(response.status()).toEqual(200);\\n});',
  'source.inline.encoding': 'base64',
  'source.project.content': '',
  playwright_text_assertion: '',
  urls: '',
  screenshots: 'on',
  synthetics_args: [],
  'filter_journeys.match': '',
  'filter_journeys.tags': [],
  ignore_https_errors: false,
  certificate_error_spki_allowlist: [],
  throttling: PROFILES_MAP[PROFILE_VALUES_ENUM.DEFAULT],
  'ssl.certificate_authorities': '',
  'ssl.certificate': '',
  'ssl.key': '',
  'ssl.key_passphrase': '',
  'ssl.verification_mode': 'full',
  'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
  revision: 1,
  fields: { config_id: '00bb3ceb-a242-4c7a-8405-8da963661374' },
  fields_under_root: true,
  location_name: 'Test private location 0',
  maintenance_windows: ['190bd51b-985a-4553-9fba-57222ddde6b7'],
};

const httpPolicy: any = {
  type: 'http',
  form_monitor_type: 'http',
  enabled: true,
  alert: { status: { enabled: true } },
  schedule: { number: '3', unit: 'm' },
  'service.name': 'LocalService',
  config_id: '51ccd9d9-fc3f-4718-ba9d-b6ef80e73fc5',
  tags: [],
  timeout: '16',
  name: 'Test Monitor',
  locations: [
    {
      id: '404812e0-90e1-11ed-8111-f7f9cad30b61',
      label: 'Test private location 0',
      geo: { lat: '', lon: '' },
      isServiceManaged: false,
    },
  ],
  namespace: 'default',
  origin: 'ui',
  journey_id: '',
  hash: '',
  id: '51ccd9d9-fc3f-4718-ba9d-b6ef80e73fc5',
  __ui: { is_tls_enabled: false },
  urls: 'https://www.google.com',
  max_redirects: '0',
  'url.port': null,
  password: 'changeme',
  proxy_url: '${proxyUrl}',
  'check.response.body.negative': [],
  'check.response.body.positive': [],
  'response.include_body': 'on_error',
  'check.response.headers': {},
  'response.include_headers': true,
  'check.response.status': [],
  'check.request.body': { type: 'text', value: '' },
  'check.request.headers': {},
  'check.request.method': 'GET',
  username: 'admin',
  'ssl.certificate_authorities': '',
  'ssl.certificate': '',
  'ssl.key': '',
  'ssl.key_passphrase': '',
  'ssl.verification_mode': 'full',
  'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
  fields: { config_id: '51ccd9d9-fc3f-4718-ba9d-b6ef80e73fc5' },
  fields_under_root: true,
  params: '{"proxyUrl":"https://proxy.com"}',
  location_name: 'Test private location 0',
};

/** Package-policy shape from synthetics 1.10.0 (`synthetics/api` + `api.network`). */
const makeApiPolicyV110 = () => ({
  name: 'api-private-default',
  namespace: 'default',
  package: { name: 'synthetics', title: 'Elastic Synthetics', version: '1.10.0' },
  enabled: true,
  policy_ids: ['loc-1'],
  inputs: [
    {
      type: 'synthetics/api',
      policy_template: 'synthetics',
      enabled: false,
      streams: [
        {
          enabled: false,
          data_stream: { type: 'synthetics', dataset: 'api' },
          vars: {
            __ui: { type: 'yaml' },
            enabled: { value: true, type: 'bool' },
            type: { value: 'api', type: 'text' },
            name: { type: 'text' },
            schedule: { value: '"@every 3m"', type: 'text' },
            'service.name': { type: 'text' },
            timeout: { type: 'text' },
            tags: { type: 'yaml' },
            'source.inline.script': { type: 'yaml' },
            'source.inline.encoding': { type: 'text' },
            'source.project.content': { type: 'text' },
            params: { type: 'yaml' },
            playwright_options: { type: 'yaml' },
            ignore_https_errors: { type: 'bool' },
            'filter_journeys.tags': { type: 'yaml' },
            'filter_journeys.match': { type: 'text' },
            location_name: { value: 'Fleet managed', type: 'text' },
            location_id: { value: 'fleet_managed', type: 'text' },
            id: { type: 'text' },
            origin: { type: 'text' },
            processors: { type: 'yaml' },
            max_attempts: { type: 'integer' },
            maintenance_windows: { type: 'yaml' },
          },
        },
        { enabled: false, data_stream: { type: 'synthetics', dataset: 'api.network' } },
      ],
    },
  ],
});
