/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  BrowserAdvancedFields,
  BrowserFields,
  BrowserSimpleFields,
  CommonFields,
  HTTPAdvancedFields,
  HTTPFields,
  HTTPSimpleFields,
  ICMPSimpleFields,
  Metadata,
  MonitorFields,
  TCPAdvancedFields,
  TCPFields,
  TCPSimpleFields,
  TLSFields,
} from '../../../common/runtime_types';
import {
  CodeEditorMode,
  ConfigKey,
  MonitorTypeEnum,
  FormMonitorType,
  ResponseBodyIndexPolicy,
  ScheduleUnit,
  SourceType,
  TLSVersion,
  VerificationMode,
} from '../../../common/runtime_types';
import { normalizeAPIConfig, validateMonitor, validateProjectMonitor } from './monitor_validation';

describe('validateMonitor', () => {
  let testSchedule;
  let testTags: string[];
  let testCommonFields: CommonFields;
  let testMetaData: Metadata;
  let testICMPFields: ICMPSimpleFields;
  let testTCPSimpleFields: TCPSimpleFields;
  let testTCPAdvancedFields: TCPAdvancedFields;
  let testTCPFields: TCPFields;
  let testTLSFields: TLSFields;
  let testHTTPSimpleFields: HTTPSimpleFields;
  let testHTTPAdvancedFields: HTTPAdvancedFields;
  let testHTTPFields: HTTPFields;
  let testBrowserSimpleFields: BrowserSimpleFields;
  let testBrowserAdvancedFields: BrowserAdvancedFields;
  let testBrowserFields: BrowserFields;

  beforeEach(() => {
    testSchedule = { number: '5', unit: ScheduleUnit.MINUTES };
    testTags = ['tag1', 'tag2'];
    testCommonFields = {
      [ConfigKey.MONITOR_TYPE]: MonitorTypeEnum.ICMP,
      [ConfigKey.NAME]: 'test-monitor-name',
      [ConfigKey.CONFIG_ID]: 'test-monitor-id',
      [ConfigKey.MONITOR_QUERY_ID]: '',
      [ConfigKey.ENABLED]: true,
      [ConfigKey.TAGS]: testTags,
      [ConfigKey.SCHEDULE]: testSchedule,
      [ConfigKey.APM_SERVICE_NAME]: '',
      [ConfigKey.TIMEOUT]: '30',
      [ConfigKey.LOCATIONS]: [
        {
          id: 'eu-west-1',
          label: 'EU West',
          geo: {
            lat: 33.4354332,
            lon: 73.4453553,
          },
          isServiceManaged: true,
          url: 'https://test-url.com',
        },
      ],
      [ConfigKey.NAMESPACE]: 'testnamespace',
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.MULTISTEP,
      [ConfigKey.MAX_ATTEMPTS]: 2,
    };
    testMetaData = {
      is_tls_enabled: false,
      script_source: {
        is_generated_script: false,
        file_name: 'test-file.name',
      },
    };

    testICMPFields = {
      ...testCommonFields,
      [ConfigKey.HOSTS]: 'test-hosts',
      [ConfigKey.WAIT]: '',
      [ConfigKey.MONITOR_TYPE]: MonitorTypeEnum.ICMP,
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.ICMP,
    };

    testTLSFields = {
      [ConfigKey.TLS_CERTIFICATE_AUTHORITIES]: 't.string',
      [ConfigKey.TLS_CERTIFICATE]: 't.string',
      [ConfigKey.TLS_KEY]: 't.string',
      [ConfigKey.TLS_KEY_PASSPHRASE]: 't.string',
      [ConfigKey.TLS_VERIFICATION_MODE]: VerificationMode.CERTIFICATE,
      [ConfigKey.TLS_VERSION]: [TLSVersion.ONE_ONE, TLSVersion.ONE_TWO],
    };

    testTCPSimpleFields = {
      ...testCommonFields,
      [ConfigKey.METADATA]: testMetaData,
      [ConfigKey.HOSTS]: 'https://host1.com',
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.TCP,
      [ConfigKey.PORT]: null,
    };

    testTCPAdvancedFields = {
      [ConfigKey.PROXY_URL]: 'http://proxy-url.com',
      [ConfigKey.PROXY_USE_LOCAL_RESOLVER]: false,
      [ConfigKey.RESPONSE_RECEIVE_CHECK]: '',
      [ConfigKey.REQUEST_SEND_CHECK]: '',
    };

    testTCPFields = {
      ...testTCPSimpleFields,
      ...testTCPAdvancedFields,
      ...testTLSFields,
      [ConfigKey.MONITOR_TYPE]: MonitorTypeEnum.TCP,
    };

    testHTTPSimpleFields = {
      ...testCommonFields,
      [ConfigKey.METADATA]: testMetaData,
      [ConfigKey.MAX_REDIRECTS]: '3',
      [ConfigKey.URLS]: 'https://example.com',
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.HTTP,
      [ConfigKey.PORT]: null,
    };

    testHTTPAdvancedFields = {
      [ConfigKey.PASSWORD]: 'test',
      [ConfigKey.PROXY_URL]: 'http://proxy.com',
      [ConfigKey.RESPONSE_BODY_CHECK_NEGATIVE]: [],
      [ConfigKey.RESPONSE_BODY_CHECK_POSITIVE]: [],
      [ConfigKey.RESPONSE_BODY_INDEX]: ResponseBodyIndexPolicy.NEVER,
      [ConfigKey.RESPONSE_HEADERS_CHECK]: {},
      [ConfigKey.RESPONSE_HEADERS_INDEX]: true,
      [ConfigKey.RESPONSE_STATUS_CHECK]: ['200', '201'],
      [ConfigKey.REQUEST_BODY_CHECK]: { value: 'testValue', type: CodeEditorMode.JSON },
      [ConfigKey.REQUEST_HEADERS_CHECK]: {},
      [ConfigKey.REQUEST_METHOD_CHECK]: '',
      [ConfigKey.USERNAME]: 'test-username',
    };

    testHTTPFields = {
      ...testHTTPSimpleFields,
      ...testHTTPAdvancedFields,
      ...testTLSFields,
      [ConfigKey.MONITOR_TYPE]: MonitorTypeEnum.HTTP,
    };

    testBrowserSimpleFields = {
      ...testCommonFields,
      [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorType.MULTISTEP,
      [ConfigKey.MONITOR_SOURCE_TYPE]: SourceType.PROJECT,
      [ConfigKey.JOURNEY_ID]: '',
      [ConfigKey.PROJECT_ID]: '',
      [ConfigKey.METADATA]: testMetaData,
      [ConfigKey.SOURCE_INLINE]: '',
      [ConfigKey.SOURCE_PROJECT_CONTENT]: '',
      [ConfigKey.PARAMS]: '',
      [ConfigKey.URLS]: null,
      [ConfigKey.PORT]: null,
    };

    testBrowserAdvancedFields = {
      [ConfigKey.SYNTHETICS_ARGS]: ['arg1', 'arg2'],
      [ConfigKey.SCREENSHOTS]: 'false',
      [ConfigKey.JOURNEY_FILTERS_MATCH]: 'false',
      [ConfigKey.JOURNEY_FILTERS_TAGS]: testTags,
      [ConfigKey.IGNORE_HTTPS_ERRORS]: false,
      [ConfigKey.THROTTLING_CONFIG]: {
        value: {
          download: '5',
          upload: '3',
          latency: '20',
        },
        id: 'test',
        label: 'test',
      },
    };

    testBrowserFields = {
      ...testBrowserSimpleFields,
      ...testBrowserAdvancedFields,
      [ConfigKey.MONITOR_TYPE]: MonitorTypeEnum.BROWSER,
    };
  });

  describe('should invalidate', () => {
    it(`when 'type' is null or undefined`, () => {
      const testMonitor = {
        type: undefined,
        schedule: {
          unit: ScheduleUnit.MINUTES,
          number: '3',
        },
        locations: ['somewhere'],
      } as unknown as MonitorFields;
      const result = validateMonitor(testMonitor, 'default');
      expect(result).toMatchObject({
        valid: false,
        reason: 'Monitor type is invalid',
        details: 'Invalid value "undefined" supplied to "type"',
      });
    });

    it(`when 'type' is not an acceptable monitor type (DataStream)`, () => {
      const monitor = {
        type: 'non-HTTP',
        schedule: {
          unit: ScheduleUnit.MINUTES,
          number: '3',
        },
        locations: ['somewhere'],
      } as unknown as MonitorFields;
      const result = validateMonitor(monitor, 'default');
      expect(result).toMatchObject({
        valid: false,
        reason: 'Monitor type is invalid',
        details: 'Invalid value "non-HTTP" supplied to "type"',
      });
    });

    it(`when schedule is not valid`, () => {
      const result = validateMonitor(
        {
          ...testICMPFields,
          schedule: {
            number: '4',
            unit: ScheduleUnit.MINUTES,
          },
        } as unknown as MonitorFields,
        'default'
      );
      expect(result).toMatchObject({
        valid: false,
        reason: 'Monitor schedule is invalid',
        details:
          'Invalid schedule 4 minutes supplied to monitor configuration. Supported schedule values in minutes are 1, 2, 3, 5, 10, 15, 20, 30, 60, 120, 240',
      });
    });

    it(`when timeout is not valid`, () => {
      const result = validateMonitor(
        {
          ...testICMPFields,
          timeout: '3m',
        } as unknown as MonitorFields,
        'default'
      );
      expect(result).toMatchObject({
        valid: false,
        reason: 'Monitor is not a valid monitor of type icmp',
        details: 'Invalid value "3m" supplied to "timeout"',
      });
    });

    it(`when location is not valid`, () => {
      const result = validateMonitor(
        {
          ...testICMPFields,
          locations: ['invalid-location'],
        } as unknown as MonitorFields,
        'default'
      );
      expect(result).toMatchObject({
        valid: false,
        reason: 'Monitor is not a valid monitor of type icmp',
        details: 'Invalid value "invalid-location" supplied to "locations"',
      });
    });

    it('when browser timeout is less than 30 seconds with private locations', () => {
      const testMonitor = {
        ...testBrowserFields,
        [ConfigKey.SOURCE_INLINE]: 'step()',
        [ConfigKey.TIMEOUT]: '29',
        [ConfigKey.LOCATIONS]: [
          {
            id: 'private-1',
            label: 'Private Location',
            geo: { lat: 0, lon: 0 },
            isServiceManaged: false,
          },
        ],
      } as MonitorFields;
      const result = validateMonitor(testMonitor, 'default');
      expect(result).toMatchObject({
        valid: false,
        reason: 'Browser monitor timeout for private locations is invalid',
        details:
          'Timeout of 29 seconds is too low. Browser monitors on private locations require a minimum timeout of 30 seconds.',
        payload: testMonitor,
      });
    });
  });

  describe('should validate', () => {
    it('when browser timeout is less than 30 seconds with only public locations', () => {
      const testMonitor = {
        ...testBrowserFields,
        [ConfigKey.SOURCE_INLINE]: 'step()',
        [ConfigKey.TIMEOUT]: '10',
      } as MonitorFields;
      const result = validateMonitor(testMonitor, 'default');
      expect(result).toMatchObject({
        valid: true,
        reason: '',
        details: '',
        payload: testMonitor,
      });
    });

    it('when payload is a correct ICMP monitor', () => {
      const testMonitor = testICMPFields as MonitorFields;
      const result = validateMonitor(testMonitor, 'default');
      expect(result).toMatchObject({
        valid: true,
        reason: '',
        details: '',
        payload: testMonitor,
      });
    });

    it('when payload is a correct TCP monitor', () => {
      const testMonitor = testTCPFields as MonitorFields;
      const result = validateMonitor(testMonitor, 'default');
      expect(result).toMatchObject({
        valid: true,
        reason: '',
        details: '',
        payload: testMonitor,
      });
    });

    it('when payload is a correct HTTP monitor', () => {
      const testMonitor = testHTTPFields as MonitorFields;

      const result = validateMonitor(testMonitor, 'default');
      expect(result).toMatchObject({
        valid: true,
        reason: '',
        details: '',
        payload: testMonitor,
      });
    });

    it('when payload is not a correct Browser monitor', () => {
      const testMonitor = testBrowserFields as MonitorFields;
      const result = validateMonitor(testMonitor, 'default');
      expect(result).toMatchObject({
        valid: false,
        details: 'source.inline.script: Script is required for browser monitor.',
        reason: 'Monitor is not a valid monitor of type browser',
        payload: testMonitor,
      });
    });

    it('when payload is not a valid Browser monitor', () => {
      const testMonitor = {
        ...testBrowserFields,
        [ConfigKey.SOURCE_INLINE]: 'journey()',
      } as MonitorFields;
      const result = validateMonitor(testMonitor, 'default');
      expect(result).toMatchObject({
        valid: false,
        reason: 'Monitor is not a valid monitor of type browser',
        details:
          'source.inline.script: Monitor script is invalid. Inline scripts cannot be full journey scripts, they may only contain step definitions.',
        payload: testMonitor,
      });
    });

    it('when payload is a correct Browser monitor', () => {
      const testMonitor = {
        ...testBrowserFields,
        [ConfigKey.SOURCE_INLINE]: 'step()',
      } as MonitorFields;
      const result = validateMonitor(testMonitor, 'default');
      expect(result).toMatchObject({
        valid: true,
        reason: '',
        details: '',
        payload: testMonitor,
      });
    });
  });

  describe('should invalidate when incomplete properties are received', () => {
    it('for ICMP monitor', () => {
      const testMonitor = {
        ...testICMPFields,
        ...({
          [ConfigKey.HOSTS]: undefined,
        } as unknown as Partial<ICMPSimpleFields>),
      } as MonitorFields;

      const result = validateMonitor(testMonitor, 'default');

      expect(result.details).toEqual(expect.stringContaining('Invalid value'));
      expect(result.details).toEqual(expect.stringContaining(ConfigKey.HOSTS));
      expect(result).toMatchObject({
        valid: false,
        reason: `Monitor is not a valid monitor of type ${MonitorTypeEnum.ICMP}`,
        payload: testMonitor,
      });
    });

    it('for TCP monitor', () => {
      const testMonitor = {
        ...testTCPFields,
        ...({
          [ConfigKey.HOSTS]: undefined,
        } as unknown as Partial<TCPFields>),
      } as MonitorFields;

      const result = validateMonitor(testMonitor, 'default');

      expect(result.details).toEqual(
        expect.stringContaining('Invalid field "host", must be a non-empty string.')
      );
      expect(result).toMatchObject({
        valid: false,
        reason: `Monitor is not a valid monitor of type ${MonitorTypeEnum.TCP}`,
        payload: testMonitor,
      });
    });

    it('for HTTP monitor', () => {
      const testMonitor = {
        ...testHTTPFields,
        ...({
          [ConfigKey.URLS]: null,
        } as unknown as Partial<HTTPFields>),
      } as MonitorFields;

      const result = validateMonitor(testMonitor, 'default');

      expect(result.details).toEqual('Invalid field "url", must be a non-empty string.');
      expect(result).toMatchObject({
        valid: false,
        reason: `Monitor is not a valid monitor of type ${MonitorTypeEnum.HTTP}`,
        payload: testMonitor,
      });
    });

    it('for Browser monitor', () => {
      const testMonitor = {
        ...testBrowserFields,
        ...({
          [ConfigKey.SOURCE_INLINE]: undefined,
        } as unknown as Partial<BrowserFields>),
      } as MonitorFields;

      const result = validateMonitor(testMonitor, 'default');

      expect(result.details).toEqual(
        expect.stringContaining('source.inline.script: Inline script must be a non-empty string')
      );
      expect(result.details).toEqual(expect.stringContaining(ConfigKey.SOURCE_INLINE));
      expect(result).toMatchObject({
        valid: false,
        reason: `Monitor is not a valid monitor of type ${MonitorTypeEnum.BROWSER}`,
        payload: testMonitor,
      });
    });
  });

  // The following should fail when strict typing/validation is in place
  describe('should pass validation when mixed props', () => {
    it('of HTTP is provided into TCP', () => {
      const testMonitor = {
        ...testTCPFields,
        ...({
          [ConfigKey.RESPONSE_HEADERS_CHECK]: undefined,
        } as unknown as Partial<TCPFields>),
      } as MonitorFields;

      const result = validateMonitor(testMonitor, 'default');

      expect(result).toMatchObject({
        valid: true,
        reason: '',
        details: '',
        payload: testMonitor,
      });
    });
  });

  // Partial updates validate the *merged* monitor (previous + patch), not the patch alone.
  describe('merged partial-update gate', () => {
    const mergedWith = (patch: Record<string, unknown>) =>
      ({ ...testHTTPFields, ...patch } as unknown as MonitorFields);

    it('accepts a valid partial patch on a known field', () => {
      const result = validateMonitor(mergedWith({ [ConfigKey.ENABLED]: false }), 'default');
      expect(result.valid).toBe(true);
    });

    it('rejects an out-of-range value on a known field (schedule)', () => {
      const result = validateMonitor(
        mergedWith({ [ConfigKey.SCHEDULE]: { number: '4', unit: ScheduleUnit.MINUTES } }),
        'default'
      );
      expect(result).toMatchObject({ valid: false, reason: 'Monitor schedule is invalid' });
    });

    it('rejects a wrong-typed value on a known field (timeout)', () => {
      const result = validateMonitor(mergedWith({ [ConfigKey.TIMEOUT]: '3m' }), 'default');
      expect(result).toMatchObject({
        valid: false,
        reason: `Monitor is not a valid monitor of type ${MonitorTypeEnum.HTTP}`,
      });
    });

    it('strips unknown/foreign fields rather than rejecting (io-ts t.exact)', () => {
      const result = validateMonitor(
        mergedWith({ notAMonitorField: 'nope', anotherBogusKey: 123 }),
        'default'
      );
      // foreign keys do not fail validation...
      expect(result.valid).toBe(true);
      // ...but they are dropped from what actually gets persisted.
      expect(result.decodedMonitor).toBeDefined();
      expect(result.decodedMonitor).not.toHaveProperty('notAMonitorField');
      expect(result.decodedMonitor).not.toHaveProperty('anotherBogusKey');
    });
  });

  describe('should validate payload', () => {
    it('when parsed from serialized JSON', () => {
      const testMonitor = getJsonPayload() as MonitorFields;

      const result = validateMonitor(testMonitor, 'default');

      expect(result).toMatchObject({
        valid: true,
        reason: '',
        details: '',
        payload: testMonitor,
      });
    });
    it('when parsed from serialized JSON for alert', () => {
      const testMonitor = getJsonPayload() as MonitorFields;

      const result = validateMonitor(
        {
          ...testMonitor,
          alert: {},
        },
        'default'
      );

      expect(result).toMatchObject({
        valid: false,
        reason: 'Invalid alert configuration',
        details: '[status.enabled]: expected value of type [boolean] but got [undefined]',
        payload: testMonitor,
      });
    });
    it('when parsed from serialized JSON for alert invalid key', () => {
      const testMonitor = getJsonPayload() as MonitorFields;

      const result = validateMonitor(
        {
          ...testMonitor,
          alert: {
            // @ts-ignore
            invalidKey: 'invalid',
            enabled: true,
          },
        },
        'default'
      );

      expect(result).toMatchObject({
        valid: false,
        reason: 'Invalid alert configuration',
        details: '[status.enabled]: expected value of type [boolean] but got [undefined]',
        payload: testMonitor,
      });
    });
  });

  describe('Project Monitor', () => {
    it(`when schedule is not valid`, () => {
      const result = validateProjectMonitor(
        {
          ...testICMPFields,
          locations: [],
        } as any,
        [],
        []
      );
      expect(result).toMatchObject({
        valid: false,
        reason: "Couldn't save or update monitor because of an invalid configuration.",
        details:
          'Invalid value "{"number":"5","unit":"m"}" supplied to "schedule" | You must add at least one location or private location to this monitor.',
      });
    });

    it(`when location is not valid`, () => {
      const result = validateProjectMonitor(
        {
          ...testICMPFields,
          locations: ['invalid-location'],
          schedule: 5,
        } as any,
        [],
        []
      );
      expect(result).toMatchObject({
        valid: false,
        reason: "Couldn't save or update monitor because of an invalid configuration.",
        details:
          'Invalid location: "invalid-location". Remove it or replace it with a valid location.',
      });
    });
  });
});

describe('normalizeAPIConfig', () => {
  it('empty object', function () {
    const result = normalizeAPIConfig({} as any);

    expect(result).toEqual({
      errorMessage: 'Invalid value "undefined" supplied to "type"',
    });
  });

  it('only type', function () {
    const result = normalizeAPIConfig({ type: 'http' } as any);

    expect(result).toEqual({
      formattedConfig: {
        type: 'http',
      },
    });
  });

  it('urls key mappings', function () {
    expect(normalizeAPIConfig({ type: 'http', urls: 'https://www.google.com' } as any)).toEqual({
      formattedConfig: {
        urls: 'https://www.google.com',
        type: 'http',
      },
    });

    expect(normalizeAPIConfig({ type: 'http', url: 'https://www.google.com' } as any)).toEqual({
      formattedConfig: {
        urls: 'https://www.google.com',
        type: 'http',
      },
    });

    expect(normalizeAPIConfig({ type: 'browser', urls: 'https://www.google.com' } as any)).toEqual({
      errorMessage: 'Invalid monitor key(s) for browser type:  urls',
      formattedConfig: {
        type: 'browser',
      },
    });

    expect(normalizeAPIConfig({ type: 'browser', url: 'https://www.google.com' } as any)).toEqual({
      errorMessage: 'Invalid monitor key(s) for browser type:  url',
      formattedConfig: {
        type: 'browser',
      },
    });
  });

  it('host key mapping validation', function () {
    expect(normalizeAPIConfig({ type: 'tcp', hosts: 'https://www.google.com' } as any)).toEqual({
      formattedConfig: {
        hosts: 'https://www.google.com',
        type: 'tcp',
      },
    });

    expect(normalizeAPIConfig({ type: 'tcp', host: 'https://www.google.com' } as any)).toEqual({
      formattedConfig: {
        hosts: 'https://www.google.com',
        type: 'tcp',
      },
    });

    expect(normalizeAPIConfig({ type: 'browser', hosts: 'https://www.google.com' } as any)).toEqual(
      {
        errorMessage: 'Invalid monitor key(s) for browser type:  hosts',
        formattedConfig: {
          type: 'browser',
        },
      }
    );

    expect(normalizeAPIConfig({ type: 'browser', host: 'https://www.google.com' } as any)).toEqual({
      errorMessage: 'Invalid monitor key(s) for browser type:  host',
      formattedConfig: {
        type: 'browser',
      },
    });
  });

  it('inline script mapping validation', function () {
    expect(
      normalizeAPIConfig({ type: 'tcp', inline_script: 'https://www.google.com' } as any)
    ).toEqual({
      errorMessage: 'Invalid monitor key(s) for tcp type:  inline_script',
      formattedConfig: {
        type: 'tcp',
      },
    });

    expect(
      normalizeAPIConfig({ type: 'browser', inline_script: 'https://www.google.com' } as any)
    ).toEqual({
      formattedConfig: {
        type: 'browser',
        'source.inline.script': 'https://www.google.com',
      },
    });

    expect(
      normalizeAPIConfig({ type: 'tcp', 'source.inline.script': 'https://www.google.com' } as any)
    ).toEqual({
      errorMessage: 'Invalid monitor key(s) for tcp type:  source.inline.script',
      formattedConfig: {
        type: 'tcp',
      },
    });

    expect(
      normalizeAPIConfig({
        type: 'browser',
        'source.inline.script': 'https://www.google.com',
      } as any)
    ).toEqual({
      formattedConfig: {
        type: 'browser',
        'source.inline.script': 'https://www.google.com',
      },
    });
  });

  it('params key mapping validation', function () {
    expect(normalizeAPIConfig({ type: 'browser', params: '{}' } as any)).toEqual({
      formattedConfig: {
        type: 'browser',
        params: '{}',
      },
    });
    expect(normalizeAPIConfig({ type: 'browser', params: '{d}' } as any)).toEqual({
      errorMessage:
        "Invalid params: Expected property name or '}' in JSON at position 1 (line 1 column 2)",
      formattedConfig: {
        type: 'browser',
        params: '{d}',
      },
    });
    expect(normalizeAPIConfig({ type: 'browser', params: {} } as any)).toEqual({
      formattedConfig: {
        type: 'browser',
        params: '{}',
      },
    });
    expect(normalizeAPIConfig({ type: 'browser', params: { a: [] } } as any)).toEqual({
      errorMessage: 'Invalid params: [a]: expected value of type [string] but got [Array]',
      formattedConfig: {
        type: 'browser',
        params: { a: [] },
      },
    });
    expect(
      normalizeAPIConfig({ type: 'browser', params: { username: 'test', pass: 'test' } } as any)
    ).toEqual({
      formattedConfig: {
        type: 'browser',
        params: '{"username":"test","pass":"test"}',
      },
    });
  });

  it('playwright_options key mapping validation', function () {
    expect(normalizeAPIConfig({ type: 'browser', playwright_options: '{}' } as any)).toEqual({
      formattedConfig: {
        type: 'browser',
        playwright_options: '{}',
      },
    });
    expect(normalizeAPIConfig({ type: 'browser', playwright_options: '{d}' } as any)).toEqual({
      errorMessage:
        "Invalid playwright_options: Expected property name or '}' in JSON at position 1 (line 1 column 2)",
      formattedConfig: {
        playwright_options: '{d}',
        type: 'browser',
      },
    });
    expect(normalizeAPIConfig({ type: 'browser', playwright_options: {} } as any)).toEqual({
      formattedConfig: {
        type: 'browser',
        playwright_options: '{}',
      },
    });
    expect(normalizeAPIConfig({ type: 'browser', playwright_options: { a: [] } } as any)).toEqual({
      formattedConfig: {
        type: 'browser',
        playwright_options: '{"a":[]}',
      },
    });
    expect(
      normalizeAPIConfig({
        type: 'browser',
        playwright_options: {
          a: {
            b: 'c',
            d: 'e',
          },
        },
      } as any)
    ).toEqual({
      formattedConfig: {
        type: 'browser',
        playwright_options: '{"a":{"b":"c","d":"e"}}',
      },
    });
    expect(
      normalizeAPIConfig({
        type: 'browser',
        playwright_options: { username: 'test', pass: 'test' },
      } as any)
    ).toEqual({
      formattedConfig: {
        type: 'browser',
        playwright_options: '{"username":"test","pass":"test"}',
      },
    });
  });

  it('ssl key normalization', function () {
    expect(
      normalizeAPIConfig({
        type: 'http',
        ssl: {
          key: '',
          certificate: '',
          verification_mode: 'full',
          supported_protocols: ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
        },
      } as any)
    ).toEqual({
      formattedConfig: {
        __ui: {
          is_tls_enabled: true,
        },
        type: 'http',
        'ssl.certificate': '',
        'ssl.key': '',
        'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
        'ssl.verification_mode': 'full',
      },
    });
    expect(
      normalizeAPIConfig({
        type: 'http',
        __ui: { is_tls_enabled: false },
        ssl: {
          key: '',
          certificate: '',
          verification_mode: 'full',
          supported_protocols: ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
        },
      } as any)
    ).toEqual({
      formattedConfig: {
        __ui: { is_tls_enabled: false },
        type: 'http',
        'ssl.certificate': '',
        'ssl.key': '',
        'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
        'ssl.verification_mode': 'full',
      },
    });
  });
});

function getJsonPayload() {
  const json =
    '{' +
    '  "type": "http",' +
    '  "enabled": true, ' +
    '  "tags": [' +
    '    "tag1",' +
    '    "tag2"' +
    '  ],' +
    '  "schedule": {' +
    '    "number": "5",' +
    '    "unit": "m"' +
    '  },' +
    '  "service.name": "",' +
    '  "timeout": "30",' +
    '  "__ui": {' +
    '    "is_tls_enabled": false,' +
    '    "script_source": {' +
    '      "is_generated_script": false,' +
    '      "file_name": "test-file.name"' +
    '    }' +
    '  },' +
    '  "max_redirects": "3",' +
    '  "max_attempts": 2,' +
    '  "password": "test",' +
    '  "urls": "https://nextjs-test-synthetics.vercel.app/api/users",' +
    '  "proxy_url": "http://proxy.com",' +
    '  "check.response.body.negative": [],' +
    '  "check.response.body.positive": [],' +
    '  "response.include_body": "never",' +
    '  "check.response.headers": {},' +
    '  "response.include_headers": true,' +
    '  "form_monitor_type": "http",' +
    '  "check.response.status": [' +
    '    "200",' +
    '    "201"' +
    '  ],' +
    '  "check.request.body": {' +
    '    "value": "testValue",' +
    '    "type": "json"' +
    '  },' +
    '  "check.request.headers": {},' +
    '  "check.request.method": "",' +
    '  "username": "test-username",' +
    '  "ssl.certificate_authorities": "t.string",' +
    '  "ssl.certificate": "t.string",' +
    '  "ssl.key": "t.string",' +
    '  "ssl.key_passphrase": "t.string",' +
    '  "ssl.verification_mode": "certificate",' +
    '  "ssl.supported_protocols": [' +
    '    "TLSv1.1",' +
    '    "TLSv1.2"' +
    '  ],' +
    '  "name": "test-monitor-name",' +
    '  "config_id": "test-monitor-id",' +
    '  "id": "test-id",' +
    '  "namespace": "testnamespace",' +
    '  "locations": [{' +
    '    "id": "eu-west-01",' +
    '    "label": "Europe West",' +
    '    "geo": {' +
    '      "lat": 33.2343132435,' +
    '      "lon": 73.2342343434' +
    '    },' +
    '    "url": "https://example-url.com",' +
    '    "isServiceManaged": true' +
    '  }],' +
    '  "url.port": null' +
    '}';

  return JSON.parse(json);
}
