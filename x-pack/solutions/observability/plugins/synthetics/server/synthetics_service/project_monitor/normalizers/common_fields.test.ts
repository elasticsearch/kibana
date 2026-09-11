/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ScheduleUnit } from '../../../../common/runtime_types';
import type { NormalizedProjectProps } from './common_fields';
import {
  flattenAndFormatObject,
  getMaxAttempts,
  getMonitorSchedule,
  getNormalizeCommonFields,
  getUrlsField,
  InvalidScheduleError,
  isValidURL,
} from './common_fields';

describe('isValidUrl', () => {
  it('returns false for invalid URL', () => {
    expect(isValidURL('invalid')).toBeFalsy();
  });

  it('returns true for valid URL', () => {
    expect(isValidURL('https://elastic.co')).toBeTruthy();
  });

  it('returns skips validation vars', () => {
    expect(isValidURL('${urlParam}')).toBeTruthy();
  });

  it('returns skips validation vars with http', () => {
    expect(isValidURL('http://${urlParam}')).toBeTruthy();
  });
});

describe('getUrlsField', () => {
  it('supports a string value containing a comma', () => {
    expect(getUrlsField('https://elastic.co?foo=bar,baz')).toEqual([
      'https://elastic.co?foo=bar,baz',
    ]);
  });

  it('supports lists containing exactly one entry, even with commas', () => {
    expect(getUrlsField(['https://elastic.co?foo=bar,baz'])).toEqual([
      'https://elastic.co?foo=bar,baz',
    ]);
  });
});

describe('getMaxAttempts', () => {
  it('returns the default (2) when nothing is provided', () => {
    expect(getMaxAttempts()).toBe(2);
  });

  it('returns the default (2) when retest_on_failure is true', () => {
    expect(getMaxAttempts(true)).toBe(2);
  });

  it('returns 1 when retest_on_failure is false', () => {
    expect(getMaxAttempts(false)).toBe(1);
  });

  // Regression for #243891: on update the merged payload still carries the
  // previous max_attempts, which must not override an explicit disable request.
  it('returns 1 when retest_on_failure is false even if a stale max_attempts is present', () => {
    expect(getMaxAttempts(false, 2)).toBe(1);
  });

  it('returns the default (2) when retest_on_failure is true even if max_attempts is present', () => {
    expect(getMaxAttempts(true, 1)).toBe(2);
  });

  it('falls back to max_attempts when retest_on_failure is not provided', () => {
    expect(getMaxAttempts(undefined, 3)).toBe(3);
  });
});

describe('normalizeYamlConfig', () => {
  it('does not continue flattening when encountering an array', () => {
    const array = ['value1', 'value2'];
    const supportedKeys: string[] = [];
    const nestedObject = {
      a: {
        nested: {
          key: array,
        },
      },
    };
    expect(flattenAndFormatObject(nestedObject, '', supportedKeys)).toEqual({
      'a.nested.key': array,
    });
  });

  it('does not continue flattening when encountering a supported key', () => {
    const supportedKeys: string[] = ['a.supported.key'];
    const object = {
      with: {
        further: {
          nesting: '',
        },
      },
    };
    const nestedObject = {
      a: {
        supported: {
          key: object,
        },
      },
    };
    expect(flattenAndFormatObject(nestedObject, '', supportedKeys)).toEqual({
      'a.supported.key': object,
    });
  });

  it('flattens objects', () => {
    const supportedKeys: string[] = [];
    const nestedObject = {
      a: {
        nested: {
          key: 'value1',
        },
      },
      b: {
        nested: {
          key: 'value2',
        },
      },
    };
    expect(flattenAndFormatObject(nestedObject, '', supportedKeys)).toEqual({
      'a.nested.key': 'value1',
      'b.nested.key': 'value2',
    });
  });
});

describe('getNormalizeCommonFields', () => {
  it.each([true, false, undefined, null])(
    'handles configuring monitor alert config when defined',
    (statusEnabled) => {
      const locations = [
        {
          label: 'US North America',
          id: 'us_central',
          isServiceManaged: true,
        },
      ];
      const config = {
        locations,
        privateLocations: [],
        projectId: 'test-projectId',
        monitor: {
          name: 'A monitor',
          id: 'test-id',
          type: 'http',
          urls: 'https://elastic.co',
          locations: ['us_central'],
          schedule: 3,
          alert: {
            status: {
              enabled: statusEnabled,
            },
          },
          maintenanceWindows: ['mw-1', 'mw-2'],
        },
        namespace: 'test-namespace',
        version: '8.7.0',
        maintenanceWindows: [
          { id: 'mw-1', title: 'First maintenance window' },
          { id: 'mw-2', title: 'Second maintenance window' },
        ],
      };
      const normalizedFields = getNormalizeCommonFields(
        config as unknown as NormalizedProjectProps
      ); // typecasting to allow testing of invalid user configs
      expect(normalizedFields).toEqual({
        errors: [],
        normalizedFields: {
          alert: {
            status: {
              enabled: statusEnabled ?? true,
            },
            tls: {
              enabled: true,
            },
          },
          custom_heartbeat_id: 'test-id-test-projectId-test-namespace',
          enabled: true,
          hash: '',
          journey_id: 'test-id',
          locations: [
            {
              geo: undefined,
              id: 'us_central',
              isServiceManaged: true,
              label: 'US North America',
            },
          ],
          name: 'A monitor',
          namespace: 'test_namespace',
          origin: 'project',
          original_space: 'test-namespace',
          project_id: 'test-projectId',
          schedule: {
            number: '3',
            unit: 'm',
          },
          tags: [],
          timeout: '16',
          params: '',
          max_attempts: 2,
          labels: {},
          maintenance_windows: ['mw-1', 'mw-2'],
          spaces: [],
        },
      });
    }
  );

  it('handles configuring monitor alert config when alert config is not defined', () => {
    const locations = [
      {
        label: 'US North America',
        id: 'us_central',
        isServiceManaged: true,
      },
    ];
    const config = {
      locations,
      privateLocations: [],
      projectId: 'test-projectId',
      monitor: {
        name: 'A monitor',
        id: 'test-id',
        type: 'http',
        urls: 'https://elastic.co',
        locations: ['us_central'],
        schedule: 3,
        maintenanceWindows: ['mw-3'],
      },
      namespace: 'test-namespace',
      version: '8.7.0',
      maintenanceWindows: [{ id: 'mw-3', title: 'Maintenance window' }],
    };
    const normalizedFields = getNormalizeCommonFields(config as unknown as NormalizedProjectProps); // typecasting to allow testing of invalid user configs
    expect(normalizedFields).toEqual({
      errors: [],
      normalizedFields: {
        alert: {
          status: {
            enabled: true,
          },
          tls: {
            enabled: true,
          },
        },
        custom_heartbeat_id: 'test-id-test-projectId-test-namespace',
        enabled: true,
        hash: '',
        journey_id: 'test-id',
        locations: [
          {
            geo: undefined,
            id: 'us_central',
            isServiceManaged: true,
            label: 'US North America',
          },
        ],
        name: 'A monitor',
        namespace: 'test_namespace',
        origin: 'project',
        original_space: 'test-namespace',
        project_id: 'test-projectId',
        schedule: {
          number: '3',
          unit: 'm',
        },
        tags: [],
        timeout: '16',
        params: '',
        max_attempts: 2,
        labels: {},
        maintenance_windows: ['mw-3'],
        spaces: [],
      },
    });
  });
});

describe('getNormalizeCommonFields - maintenance windows', () => {
  const baseConfig = {
    locations: [{ label: 'US North America', id: 'us_central', isServiceManaged: true }],
    privateLocations: [],
    projectId: 'test-projectId',
    namespace: 'test-namespace',
    version: '8.7.0',
  };

  const baseMonitor = {
    name: 'A monitor',
    id: 'test-id',
    type: 'http',
    urls: 'https://elastic.co',
    locations: ['us_central'],
    schedule: 3,
  };

  const maintenanceWindows = [
    { id: 'mw-id-1', title: 'Weekend window' },
    { id: 'mw-id-2', title: 'Nightly Deploy' },
  ];

  it('keeps valid maintenance window ids', () => {
    const config = {
      ...baseConfig,
      monitor: { ...baseMonitor, maintenanceWindows: ['mw-id-1'] },
      maintenanceWindows,
    };
    const { normalizedFields } = getNormalizeCommonFields(
      config as unknown as NormalizedProjectProps
    );
    expect(normalizedFields.maintenance_windows).toEqual(['mw-id-1']);
  });

  it('resolves maintenance window names to ids', () => {
    const config = {
      ...baseConfig,
      monitor: { ...baseMonitor, maintenanceWindows: ['Weekend window', 'mw-id-2'] },
      maintenanceWindows,
    };
    const { normalizedFields } = getNormalizeCommonFields(
      config as unknown as NormalizedProjectProps
    );
    expect(normalizedFields.maintenance_windows).toEqual(['mw-id-1', 'mw-id-2']);
  });

  it('throws when a referenced maintenance window is unavailable', () => {
    const config = {
      ...baseConfig,
      monitor: { ...baseMonitor, maintenanceWindows: ['mw-id-1'] },
      maintenanceWindows: [],
    };
    expect(() => getNormalizeCommonFields(config as NormalizedProjectProps)).toThrow(/mw-id-1/);
  });

  it('throws for an unresolved maintenance window reference', () => {
    const config = {
      ...baseConfig,
      monitor: { ...baseMonitor, maintenanceWindows: ['does-not-exist'] },
      maintenanceWindows,
    };
    expect(() => getNormalizeCommonFields(config as unknown as NormalizedProjectProps)).toThrow(
      /does-not-exist/
    );
  });
});

describe('getMonitorSchedule', () => {
  it('should return default value if schedule is falsy', () => {
    const defaultValue = { number: '5', unit: ScheduleUnit.MINUTES };
    expect(getMonitorSchedule(null as any, defaultValue)).toEqual(defaultValue);
    expect(getMonitorSchedule(undefined as any, defaultValue)).toEqual(defaultValue);
  });

  it('should return a schedule object with minutes if schedule is a number', () => {
    expect(getMonitorSchedule(5)).toEqual({ number: '5', unit: ScheduleUnit.MINUTES });
  });

  it('should return a schedule object with minutes if schedule is a string without seconds', () => {
    expect(getMonitorSchedule('10')).toEqual({ number: '10', unit: ScheduleUnit.MINUTES });
  });

  it('should return a schedule object with seconds if schedule is allowed', () => {
    expect(getMonitorSchedule('10s')).toEqual({ number: '10', unit: ScheduleUnit.SECONDS });
    expect(getMonitorSchedule('30s')).toEqual({ number: '30', unit: ScheduleUnit.SECONDS });
  });

  it('should throw InvalidScheduleError if schedule in seconds is not allowed', () => {
    expect(() => getMonitorSchedule('20s')).toThrow(InvalidScheduleError);
  });

  it('should return the schedule object if schedule is already in the correct format', () => {
    const existingSchedule = { number: '15', unit: ScheduleUnit.MINUTES };
    expect(getMonitorSchedule(existingSchedule)).toEqual(existingSchedule);
  });

  it('should coerce a numeric object number to a string', () => {
    expect(getMonitorSchedule({ number: 3, unit: ScheduleUnit.MINUTES } as any)).toEqual({
      number: '3',
      unit: ScheduleUnit.MINUTES,
    });
    expect(getMonitorSchedule({ number: 10, unit: ScheduleUnit.SECONDS } as any)).toEqual({
      number: '10',
      unit: ScheduleUnit.SECONDS,
    });
  });
});
