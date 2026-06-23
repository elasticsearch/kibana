/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { configSchema } from './config';

describe('config validation', () => {
  test('alerting defaults', () => {
    const config: Record<string, unknown> = {};
    expect(configSchema.validate(config)).toMatchInlineSnapshot(`
      Object {
        "alertsService": Object {
          "totalFieldsLimit": 2800,
        },
        "cancelAlertsOnRuleTimeout": true,
        "enableFrameworkAlerts": true,
        "healthCheck": Object {
          "interval": "60m",
        },
        "invalidateApiKeysTask": Object {
          "interval": "5m",
          "removalDelay": "1h",
        },
        "ruleChangeTracking": Object {
          "enabled": false,
          "scope": Array [
            "security",
          ],
        },
        "rules": Object {
          "apiKeyType": "es",
          "maxScheduledPerMinute": 32000,
          "minimumScheduleInterval": Object {
            "enforce": false,
            "value": "1m",
          },
          "run": Object {
            "actions": Object {
              "max": 100000,
            },
            "alerts": Object {
              "max": 1000,
            },
          },
        },
        "rulesSettings": Object {
          "cacheInterval": 60000,
          "enabled": true,
        },
      }
    `);
  });

  describe('rules.minimumScheduleInterval.value', () => {
    test('allows 1d as a value', () => {
      const config: Record<string, unknown> = {
        rules: {
          minimumScheduleInterval: {
            value: '1d',
          },
        },
      };
      const validatedConfig = configSchema.validate(config);
      expect(validatedConfig.rules.minimumScheduleInterval.value).toMatchInlineSnapshot(`"1d"`);
    });

    test(`doesn't allow 2d as a value`, () => {
      const config: Record<string, unknown> = {
        rules: {
          minimumScheduleInterval: {
            value: '2d',
          },
        },
      };
      expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(
        `"[rules.minimumScheduleInterval.value]: duration cannot exceed one day"`
      );
    });

    test(`doesn't allow 25h as a value`, () => {
      const config: Record<string, unknown> = {
        rules: {
          minimumScheduleInterval: {
            value: '25h',
          },
        },
      };
      expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(
        `"[rules.minimumScheduleInterval.value]: duration cannot exceed one day"`
      );
    });
  });

  describe('rules.run.actions.max', () => {
    test('allows 100000 as a value', () => {
      const config: Record<string, unknown> = {
        rules: {
          run: {
            actions: {
              max: 100000,
            },
          },
        },
      };
      const validatedConfig = configSchema.validate(config);
      expect(validatedConfig.rules.run.actions.max).toMatchInlineSnapshot(`100000`);
    });

    test(`doesn't allow 100001 as a value`, () => {
      const config: Record<string, unknown> = {
        rules: {
          run: {
            actions: {
              max: 100001,
            },
          },
        },
      };
      expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(
        `"[rules.run.actions.max]: Value must be equal to or lower than [100000]."`
      );
    });
  });

  test('maxScheduledPerMinute allows more than 32000', () => {
    const config: Record<string, unknown> = {
      rules: {
        maxScheduledPerMinute: 50000,
      },
    };
    expect(() => configSchema.validate(config)).not.toThrow();
  });
});
