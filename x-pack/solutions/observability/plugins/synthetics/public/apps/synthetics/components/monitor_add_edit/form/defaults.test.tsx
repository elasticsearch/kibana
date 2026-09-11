/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { SyntheticsMonitor } from '../types';
import { ConfigKey, MonitorTypeEnum, FormMonitorType } from '../types';
import { DEFAULT_FIELDS, PROFILE_VALUES_ENUM, PROFILES_MAP } from '../constants';
import { formatDefaultFormValues } from './defaults';

describe('defaults', () => {
  const testScript = 'testScript';
  const monitorValues = {
    __ui: {
      script_source: {
        file_name: '',
        is_generated_script: false,
      },
    },
    enabled: true,
    'filter_journeys.match': '',
    'filter_journeys.tags': [],
    form_monitor_type: 'multistep',
    ignore_https_errors: false,
    certificate_error_spki_allowlist: [],
    journey_id: '',
    locations: [
      {
        id: 'us_central',
        isServiceManaged: true,
        label: 'US Central',
      },
    ],
    name: 'Browser monitor',
    namespace: 'default',
    origin: 'ui',
    params: '',
    playwright_options: '',
    playwright_text_assertion: '',
    project_id: '',
    schedule: {
      number: '10',
      unit: 'm',
    },
    screenshots: 'on',
    'service.name': '',
    'source.inline.script': testScript,
    'source.project.content': '',
    'ssl.certificate': '',
    'ssl.certificate_authorities': '',
    'ssl.key': '',
    'ssl.key_passphrase': '',
    'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
    'ssl.verification_mode': 'full',
    synthetics_args: [],
    tags: [],
    throttling: {
      value: {
        download: '5',
        latency: '20',
        upload: '3',
      },
      id: 'default',
      label: 'Default',
    },
    timeout: '16',
    type: 'browser',
    'url.port': null,
    urls: '',
    id: '',
    config_id: '',
    max_attempts: 2,
  } as SyntheticsMonitor;

  it('correctly formats monitor type to form type', () => {
    expect(formatDefaultFormValues(monitorValues)).toEqual({
      ...monitorValues,
      __ui: {
        script_source: {
          file_name: '',
          is_generated_script: false,
        },
      },
      enabled: true,
      'filter_journeys.match': '',
      'filter_journeys.tags': [],
      form_monitor_type: 'multistep',
      ignore_https_errors: false,
      certificate_error_spki_allowlist: [],
      journey_id: '',
      locations: [
        {
          id: 'us_central',
          isServiceManaged: true,
          label: 'US Central',
        },
      ],
      name: 'Browser monitor',
      namespace: 'default',
      origin: 'ui',
      params: '',
      playwright_options: '',
      playwright_text_assertion: '',
      project_id: '',
      schedule: {
        number: '10',
        unit: 'm',
      },
      screenshots: 'on',
      'service.name': '',
      'source.inline': {
        fileName: '',
        script: 'testScript',
        type: 'inline',
      },
      'source.inline.script': 'testScript',
      'source.project.content': '',
      'ssl.certificate': '',
      'ssl.certificate_authorities': '',
      'ssl.key': '',
      'ssl.key_passphrase': '',
      'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
      'ssl.verification_mode': 'full',
      synthetics_args: [],
      tags: [],
      throttling: PROFILES_MAP[PROFILE_VALUES_ENUM.DEFAULT],
      timeout: '16',
      type: 'browser',
      'url.port': null,
      urls: '',
    });
  });

  it.each([
    [MonitorTypeEnum.HTTP, true],
    [MonitorTypeEnum.HTTP, false],
    [MonitorTypeEnum.TCP, true],
    [MonitorTypeEnum.TCP, false],
  ])('correctly formats isTLSEnabled', (formType, isTLSEnabled) => {
    const monitor = {
      ...DEFAULT_FIELDS[formType as MonitorTypeEnum],
      [ConfigKey.FORM_MONITOR_TYPE]: formType as unknown as FormMonitorType,
      [ConfigKey.TLS_CERTIFICATE_AUTHORITIES]: 'mockCA',
      [ConfigKey.METADATA]: {
        is_tls_enabled: isTLSEnabled,
      },
    };
    expect(formatDefaultFormValues(monitor)).toEqual({
      ...monitor,
      [ConfigKey.TLS_CERTIFICATE_AUTHORITIES]: 'mockCA',
      isTLSEnabled,
    });
  });

  it.each([
    [MonitorTypeEnum.HTTP, FormMonitorType.HTTP],
    [MonitorTypeEnum.TCP, FormMonitorType.TCP],
    [MonitorTypeEnum.ICMP, FormMonitorType.ICMP],
    [MonitorTypeEnum.BROWSER, FormMonitorType.MULTISTEP],
    [MonitorTypeEnum.API, FormMonitorType.API],
  ])(
    'correctly formats legacy uptime monitors to include ConfigKey.FORM_MONITOR_TYPE',
    (dataStream, formType) => {
      const monitor = {
        ...DEFAULT_FIELDS[dataStream],
        [ConfigKey.FORM_MONITOR_TYPE]: undefined,
      };
      expect(formatDefaultFormValues(monitor as unknown as SyntheticsMonitor)).toEqual(
        expect.objectContaining({
          [ConfigKey.FORM_MONITOR_TYPE]: formType,
        })
      );
    }
  );
});
