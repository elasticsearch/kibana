/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MAX_EMAIL_BODY_LENGTH } from '../common';
import type { ActionsConfig } from './config';
import { configSchema, getValidatedConfig } from './config';
import type { Logger } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';

const mockLogger = loggingSystemMock.create().get() as jest.Mocked<Logger>;

describe('config validation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('action defaults', () => {
    const config: Record<string, unknown> = {};
    expect(configSchema.validate(config)).toMatchInlineSnapshot(`
      Object {
        "allowedHosts": Array [
          "*",
        ],
        "auth": Object {
          "oauth_authorization_code": Object {
            "rate_limits": Object {
              "authorize": Object {
                "limit": 100,
                "lookbackWindow": "1h",
              },
              "callback": Object {
                "limit": 100,
                "lookbackWindow": "1h",
              },
            },
          },
        },
        "enableFooterInEmail": true,
        "enabledActionTypes": Array [
          "*",
        ],
        "maxResponseContentLength": ByteSizeValue {
          "valueInBytes": 1048576,
        },
        "microsoftExchangeUrl": "https://login.microsoftonline.com",
        "microsoftGraphApiScope": "https://graph.microsoft.com/.default",
        "microsoftGraphApiUrl": "https://graph.microsoft.com/v1.0",
        "preconfigured": Object {},
        "preconfiguredAlertHistoryEsIndex": false,
        "responseTimeout": "PT1M",
      }
    `);
  });

  test('action with preconfigured actions', () => {
    const config: Record<string, unknown> = {
      preconfigured: {
        mySlack1: {
          actionTypeId: '.slack',
          name: 'Slack #xyz',
          config: {
            webhookUrl: 'https://hooks.slack.com/services/abcd/efgh/ijklmnopqrstuvwxyz',
          },
        },
      },
    };
    expect(configSchema.validate(config)).toMatchInlineSnapshot(`
      Object {
        "allowedHosts": Array [
          "*",
        ],
        "auth": Object {
          "oauth_authorization_code": Object {
            "rate_limits": Object {
              "authorize": Object {
                "limit": 100,
                "lookbackWindow": "1h",
              },
              "callback": Object {
                "limit": 100,
                "lookbackWindow": "1h",
              },
            },
          },
        },
        "enableFooterInEmail": true,
        "enabledActionTypes": Array [
          "*",
        ],
        "maxResponseContentLength": ByteSizeValue {
          "valueInBytes": 1048576,
        },
        "microsoftExchangeUrl": "https://login.microsoftonline.com",
        "microsoftGraphApiScope": "https://graph.microsoft.com/.default",
        "microsoftGraphApiUrl": "https://graph.microsoft.com/v1.0",
        "preconfigured": Object {
          "mySlack1": Object {
            "actionTypeId": ".slack",
            "config": Object {
              "webhookUrl": "https://hooks.slack.com/services/abcd/efgh/ijklmnopqrstuvwxyz",
            },
            "name": "Slack #xyz",
            "secrets": Object {},
          },
        },
        "preconfiguredAlertHistoryEsIndex": false,
        "responseTimeout": "PT1M",
      }
    `);
  });

  test('validates preconfigured action ids', () => {
    expect(() =>
      configSchema.validate(preConfiguredActionConfig(''))
    ).toThrowErrorMatchingInlineSnapshot(
      `"[preconfigured]: invalid preconfigured action id \\"\\""`
    );

    expect(() =>
      configSchema.validate(preConfiguredActionConfig('constructor'))
    ).toThrowErrorMatchingInlineSnapshot(
      `"[preconfigured]: invalid preconfigured action id \\"constructor\\""`
    );

    expect(() =>
      configSchema.validate(preConfiguredActionConfig('__proto__'))
    ).toThrowErrorMatchingInlineSnapshot(
      `"[preconfigured]: invalid preconfigured action id \\"__proto__\\""`
    );
  });

  test('validates proxyBypassHosts and proxyOnlyHosts', () => {
    const bypassHosts = ['bypass.elastic.co'];
    const onlyHosts = ['only.elastic.co'];
    let validated: ActionsConfig;

    validated = configSchema.validate({});
    expect(validated.proxyBypassHosts).toEqual(undefined);
    expect(validated.proxyOnlyHosts).toEqual(undefined);

    validated = configSchema.validate({
      proxyBypassHosts: bypassHosts,
    });
    expect(validated.proxyBypassHosts).toEqual(bypassHosts);
    expect(validated.proxyOnlyHosts).toEqual(undefined);

    validated = configSchema.validate({
      proxyOnlyHosts: onlyHosts,
    });
    expect(validated.proxyBypassHosts).toEqual(undefined);
    expect(validated.proxyOnlyHosts).toEqual(onlyHosts);
  });

  test('validates proxyBypassHosts and proxyOnlyHosts used at the same time', () => {
    const bypassHosts = ['bypass.elastic.co'];
    const onlyHosts = ['only.elastic.co'];
    const config: Record<string, unknown> = {
      proxyBypassHosts: bypassHosts,
      proxyOnlyHosts: onlyHosts,
    };

    let validated: ActionsConfig;

    // the config schema validation validates with both set
    validated = configSchema.validate(config);
    expect(validated.proxyBypassHosts).toEqual(bypassHosts);
    expect(validated.proxyOnlyHosts).toEqual(onlyHosts);

    // getValidatedConfig will warn and set onlyHosts to undefined with both set
    validated = getValidatedConfig(mockLogger, validated);
    expect(validated.proxyBypassHosts).toEqual(bypassHosts);
    expect(validated.proxyOnlyHosts).toEqual(undefined);
    expect(mockLogger.warn.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "The configurations xpack.actions.proxyBypassHosts and xpack.actions.proxyOnlyHosts can not be used at the same time. The configuration xpack.actions.proxyOnlyHosts will be ignored.",
        ],
      ]
    `);
  });

  test('validates proxyUrl', () => {
    const proxyUrl = 'https://test.com';
    const badProxyUrl = 'bad url';
    let validated: ActionsConfig;

    validated = configSchema.validate({ proxyUrl });
    expect(validated.proxyUrl).toEqual(proxyUrl);
    expect(getValidatedConfig(mockLogger, validated).proxyUrl).toEqual(proxyUrl);
    expect(mockLogger.warn.mock.calls).toMatchInlineSnapshot(`Array []`);

    validated = configSchema.validate({ proxyUrl: badProxyUrl });
    expect(validated.proxyUrl).toEqual(badProxyUrl);
    expect(getValidatedConfig(mockLogger, validated).proxyUrl).toEqual(badProxyUrl);
    expect(mockLogger.warn.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "The configuration xpack.actions.proxyUrl: bad url is invalid.",
        ],
      ]
    `);
  });

  // Most of the customHostSettings tests are in ./lib/custom_host_settings.test.ts
  // but this one seemed more relevant for this test suite, since url is the one
  // required property.
  test('validates customHostSettings contains a URL', () => {
    const config: Record<string, unknown> = {
      customHostSettings: [{}],
    };

    expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(
      `"[customHostSettings.0.url]: expected value of type [string] but got [undefined]"`
    );
  });

  test('action with ssl configuration', () => {
    const config: Record<string, unknown> = {
      ssl: {
        verificationMode: 'none',
        proxyVerificationMode: 'none',
      },
    };
    expect(configSchema.validate(config)).toMatchInlineSnapshot(`
      Object {
        "allowedHosts": Array [
          "*",
        ],
        "auth": Object {
          "oauth_authorization_code": Object {
            "rate_limits": Object {
              "authorize": Object {
                "limit": 100,
                "lookbackWindow": "1h",
              },
              "callback": Object {
                "limit": 100,
                "lookbackWindow": "1h",
              },
            },
          },
        },
        "enableFooterInEmail": true,
        "enabledActionTypes": Array [
          "*",
        ],
        "maxResponseContentLength": ByteSizeValue {
          "valueInBytes": 1048576,
        },
        "microsoftExchangeUrl": "https://login.microsoftonline.com",
        "microsoftGraphApiScope": "https://graph.microsoft.com/.default",
        "microsoftGraphApiUrl": "https://graph.microsoft.com/v1.0",
        "preconfigured": Object {},
        "preconfiguredAlertHistoryEsIndex": false,
        "responseTimeout": "PT1M",
        "ssl": Object {
          "proxyVerificationMode": "none",
          "verificationMode": "none",
        },
      }
    `);
  });

  test('validates email.domain_allowlist', () => {
    const config: Record<string, unknown> = {};
    let result = configSchema.validate(config);
    expect(result.email === undefined);

    config.email = { domain_allowlist: [] };
    result = configSchema.validate(config);
    expect(result.email?.domain_allowlist).toEqual([]);

    config.email = { domain_allowlist: ['a.com', 'b.c.com', 'd.e.f.com'] };
    result = configSchema.validate(config);
    expect(result.email?.domain_allowlist).toEqual(['a.com', 'b.c.com', 'd.e.f.com']);
  });

  describe('email.recipient_allowlist', () => {
    const config: Record<string, unknown> = {};
    test('validates no email config at all', () => {
      const result = configSchema.validate(config);
      expect(result.email === undefined);
    });

    test('validates email config with recipient_allowlist = null', () => {
      config.email = { recipient_allowlist: null };
      expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(
        `"[email.recipient_allowlist]: expected value of type [array] but got [null]"`
      );
    });

    test('validates email config with recipient_allowlist = []', () => {
      config.email = { recipient_allowlist: [] };
      expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(
        `"[email.recipient_allowlist]: array size is [0], but cannot be smaller than [1]"`
      );
    });

    test('validates email config with recipient_allowlist', () => {
      config.email = {
        recipient_allowlist: ['*.bar@a.com', 'foo.*@b.com', '*@d.e.f.com'],
      };

      const result = configSchema.validate(config);
      expect(result.email?.recipient_allowlist).toEqual([
        '*.bar@a.com',
        'foo.*@b.com',
        '*@d.e.f.com',
      ]);
    });
  });

  describe('email.maximum_body_length', () => {
    // note, this just tests the current behavior, but if we change so the
    // default was ALWAYS the defined default, it's fine to change it.
    test('validates that the value is undefined with no email parent', () => {
      const validatedConfig = configSchema.validate({});
      expect(validatedConfig.email?.maximum_body_length).toBe(undefined);
    });

    test('validates with value 0', () => {
      const validatedConfig = configSchema.validate({
        email: {
          maximum_body_length: 0,
        },
      });
      expect(validatedConfig.email?.maximum_body_length).toBe(0);
    });

    test('validates valid value set', () => {
      const validatedConfig = configSchema.validate({
        email: {
          maximum_body_length: 42,
        },
      });
      expect(validatedConfig.email?.maximum_body_length).toBe(42);
    });

    test('throws error on negative value', () => {
      const config = {
        email: {
          maximum_body_length: -42,
        },
      };

      expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(
        `"[email.maximum_body_length]: Value must be equal to or greater than [0]."`
      );
    });

    test('logs warning when value is greater than max', () => {
      const config = {
        email: {
          maximum_body_length: MAX_EMAIL_BODY_LENGTH + 1,
        },
      };
      const validatedConfig = getValidatedConfig(mockLogger, configSchema.validate(config));

      // value is still > max here, fixed in actionConfigUtils getMaxEmailBodyLength()
      expect(validatedConfig.email?.maximum_body_length).toBe(MAX_EMAIL_BODY_LENGTH + 1);
      expect(mockLogger.warn.mock.calls[0][0]).toBe(
        'The configuration xpack.actions.email.maximum_body_length value 25000001 is larger than the maximum setting of 25000000 and the maximum value will be used instead'
      );
    });

    test('logs warning on zero value', () => {
      const config = {
        email: {
          maximum_body_length: 0,
        },
      };
      const validatedConfig = getValidatedConfig(mockLogger, configSchema.validate(config));

      expect(validatedConfig.email?.maximum_body_length).toBe(0);
      expect(mockLogger.warn.mock.calls[0][0]).toBe(
        'The configuration xpack.actions.email.maximum_body_length is set to 0 and will result in sending empty emails'
      );
    });
  });

  test('throws when domain_allowlist and recipient_allowlist are used at the same time', () => {
    const config: Record<string, unknown> = {};
    const result = configSchema.validate(config);
    expect(result.email === undefined);

    config.email = {
      domain_allowlist: ['a.com'],
      recipient_allowlist: ['*.bar@a.com'],
    };
    expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(
      `"[email]: email.domain_allowlist and email.recipient_allowlist can not be used at the same time"`
    );
  });

  test('validates rate limiter connector name', () => {
    let config: Record<string, unknown> = {
      rateLimiter: { slack: { limit: 10, lookbackWindow: '1m' } },
    };

    expect(() => configSchema.validate(config)).toThrow(
      'Rate limiter configuration for connector type "slack" is not supported. Supported types: email'
    );

    config = {
      rateLimiter: { email: { limit: 10, lookbackWindow: '1m' } },
    };

    expect(configSchema.validate(config)).toMatchInlineSnapshot(`
      Object {
        "allowedHosts": Array [
          "*",
        ],
        "auth": Object {
          "oauth_authorization_code": Object {
            "rate_limits": Object {
              "authorize": Object {
                "limit": 100,
                "lookbackWindow": "1h",
              },
              "callback": Object {
                "limit": 100,
                "lookbackWindow": "1h",
              },
            },
          },
        },
        "enableFooterInEmail": true,
        "enabledActionTypes": Array [
          "*",
        ],
        "maxResponseContentLength": ByteSizeValue {
          "valueInBytes": 1048576,
        },
        "microsoftExchangeUrl": "https://login.microsoftonline.com",
        "microsoftGraphApiScope": "https://graph.microsoft.com/.default",
        "microsoftGraphApiUrl": "https://graph.microsoft.com/v1.0",
        "preconfigured": Object {},
        "preconfiguredAlertHistoryEsIndex": false,
        "rateLimiter": Object {
          "email": Object {
            "limit": 10,
            "lookbackWindow": "1m",
          },
        },
        "responseTimeout": "PT1M",
      }
    `);
  });

  test('validates xpack.actions.webhook', () => {
    const config: Record<string, unknown> = {};
    let result = configSchema.validate(config);
    expect(result.webhook === undefined);

    config.webhook = {};
    result = configSchema.validate(config);
    expect(result.webhook?.ssl.pfx.enabled).toEqual(true);

    config.webhook = { ssl: {} };
    result = configSchema.validate(config);
    expect(result.webhook?.ssl.pfx.enabled).toEqual(true);

    config.webhook = { ssl: { pfx: {} } };
    result = configSchema.validate(config);
    expect(result.webhook?.ssl.pfx.enabled).toEqual(true);

    config.webhook = { ssl: { pfx: { enabled: false } } };
    result = configSchema.validate(config);
    expect(result.webhook?.ssl.pfx.enabled).toEqual(false);

    config.webhook = { ssl: { pfx: { enabled: true } } };
    result = configSchema.validate(config);
    expect(result.webhook?.ssl.pfx.enabled).toEqual(true);
  });

  describe('email.services.ses', () => {
    const config: Record<string, unknown> = {};
    test('validates no email config at all', () => {
      expect(configSchema.validate(config).email).toBe(undefined);
    });

    test('validates email config with empty services', () => {
      config.email = { services: {} };
      expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(
        `"[email.services]: email.services.enabled or email.services.ses must be defined"`
      );
    });

    test('validates email config with empty ses service', () => {
      config.email = { services: { ses: {} } };
      expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(
        `"[email.services.ses.host]: expected value of type [string] but got [undefined]"`
      );
    });

    test('validates ses config with host only', () => {
      config.email = { services: { ses: { host: 'ses.host.com' } } };
      expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(
        `"[email.services.ses.port]: expected value of type [number] but got [undefined]"`
      );
    });

    test('validates ses config with port only', () => {
      config.email = { services: { ses: { port: 1 } } };
      expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(
        `"[email.services.ses.host]: expected value of type [string] but got [undefined]"`
      );
    });

    test('validates ses service', () => {
      config.email = { services: { ses: { host: 'ses.host.com', port: 1 } } };
      const result = configSchema.validate(config);
      expect(result.email?.services?.ses).toEqual({ host: 'ses.host.com', port: 1 });
    });
  });

  describe('email.services.enabled', () => {
    const config: Record<string, unknown> = {};
    test('validates email config with empty enabled services', () => {
      config.email = { services: { enabled: [] } };
      expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(
        `"[email.services.enabled]: array size is [0], but cannot be smaller than [1]"`
      );
    });

    test('validates email config with enabled services', () => {
      config.email = { services: { enabled: ['elastic-cloud', 'amazon-ses'] } };
      const result = configSchema.validate(config);
      expect(result.email?.services?.enabled).toEqual(['elastic-cloud', 'amazon-ses']);
    });

    test('validates email config with unexistend service', () => {
      config.email = { services: { enabled: ['fake-service'] } };
      expect(() => configSchema.validate(config)).toThrowErrorMatchingInlineSnapshot(`
        "[email.services.enabled.0]: types that failed validation:
        - [email.services.enabled.0.0]: expected value to equal [google-mail]
        - [email.services.enabled.0.1]: expected value to equal [microsoft-exchange]
        - [email.services.enabled.0.2]: expected value to equal [microsoft-outlook]
        - [email.services.enabled.0.3]: expected value to equal [amazon-ses]
        - [email.services.enabled.0.4]: expected value to equal [elastic-cloud]
        - [email.services.enabled.0.5]: expected value to equal [other]
        - [email.services.enabled.0.6]: expected value to equal [*]"
      `);
    });

    test('validates enabled services but no ses service', () => {
      config.email = { services: { enabled: ['google-mail', 'amazon-ses'] } };
      const result = configSchema.validate(config);
      expect(result.email?.services?.enabled).toEqual(['google-mail', 'amazon-ses']);
      expect(result.email?.services?.ses).toBeUndefined();
    });
  });

  describe('auth.ears.ssl', () => {
    test('accepts certificate and key together', () => {
      const result = configSchema.validate({
        auth: {
          ears: {
            ssl: {
              verificationMode: 'full',
              certificate: '/path/to/cert.pem',
              key: '/path/to/key.pem',
            },
          },
        },
      });
      expect(result.auth?.ears?.ssl?.certificate).toBe('/path/to/cert.pem');
      expect(result.auth?.ears?.ssl?.key).toBe('/path/to/key.pem');
    });

    test('throws when certificate is specified without key', () => {
      expect(() =>
        configSchema.validate({
          auth: {
            ears: {
              ssl: {
                certificate: '/path/to/cert.pem',
              },
            },
          },
        })
      ).toThrowErrorMatchingInlineSnapshot(
        `"[auth.ears.ssl]: must specify [auth.ears.ssl.key] when [auth.ears.ssl.certificate] is specified"`
      );
    });

    test('throws when key is specified without certificate', () => {
      expect(() =>
        configSchema.validate({
          auth: {
            ears: {
              ssl: {
                key: '/path/to/key.pem',
              },
            },
          },
        })
      ).toThrowErrorMatchingInlineSnapshot(
        `"[auth.ears.ssl]: must specify [auth.ears.ssl.certificate] when [auth.ears.ssl.key] is specified"`
      );
    });
  });
});

// object creator that ensures we can create a property named __proto__ on an
// object, via JSON.parse()
function preConfiguredActionConfig(id: string) {
  return JSON.parse(`{
    "preconfigured": {
        ${JSON.stringify(id)}: {
            "actionTypeId": ".server-log",
            "name": "server log 1"
        },
        "serverLog": {
            "actionTypeId": ".server-log",
            "name": "server log 2"
        }
    }
  }`);
}
