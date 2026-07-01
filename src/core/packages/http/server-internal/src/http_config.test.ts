/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { v4 as uuidv4 } from 'uuid';
import { config, HttpConfig } from './http_config';
import { cspConfig } from './csp';
import { permissionsPolicyConfig } from './permissions_policy';
import { ExternalUrlConfig } from './external_url';

const validHostnames = ['www.example.com', '8.8.8.8', '::1', 'localhost', '0.0.0.0'];
const invalidHostnames = ['asdf$%^', '0'];

let mockHostname = 'kibana-hostname';

jest.mock('node:os', () => {
  const original = jest.requireActual('node:os');

  return {
    ...original,
    hostname: () => mockHostname,
  };
});

beforeEach(() => {
  mockHostname = 'kibana-hostname';
});

test('has defaults for config', () => {
  const httpSchema = config.schema;
  const obj = {};
  expect(httpSchema.validate(obj)).toMatchSnapshot();
});

test('accepts valid hostnames', () => {
  for (const val of validHostnames) {
    const { host } = config.schema.validate({ host: val });
    expect({ host }).toMatchSnapshot();
  }
});

test('throws if invalid hostname', () => {
  for (const host of invalidHostnames) {
    const httpSchema = config.schema;
    expect(() => httpSchema.validate({ host })).toThrowErrorMatchingSnapshot();
  }
});

describe('requestId', () => {
  test('accepts valid ip addresses', () => {
    const {
      requestId: { ipAllowlist },
    } = config.schema.validate({
      requestId: {
        allowFromAnyIp: false,
        ipAllowlist: ['0.0.0.0', '123.123.123.123', '1200:0000:AB00:1234:0000:2552:7777:1313'],
      },
    });
    expect(ipAllowlist).toMatchInlineSnapshot(`
      Array [
        "0.0.0.0",
        "123.123.123.123",
        "1200:0000:AB00:1234:0000:2552:7777:1313",
      ]
    `);
  });

  test('rejects invalid ip addresses', () => {
    expect(() => {
      config.schema.validate({
        requestId: {
          allowFromAnyIp: false,
          ipAllowlist: ['1200:0000:AB00:1234:O000:2552:7777:1313', '[2001:db8:0:1]:80'],
        },
      });
    }).toThrowErrorMatchingInlineSnapshot(
      `"[requestId.ipAllowlist.0]: value must be a valid ipv4 or ipv6 address"`
    );
  });

  test('rejects if allowFromAnyIp is `true` and `ipAllowlist` is non-empty', () => {
    expect(() => {
      config.schema.validate({
        requestId: {
          allowFromAnyIp: true,
          ipAllowlist: ['0.0.0.0', '123.123.123.123', '1200:0000:AB00:1234:0000:2552:7777:1313'],
        },
      });
    }).toThrowErrorMatchingInlineSnapshot(
      `"[requestId]: allowFromAnyIp must be set to 'false' if any values are specified in ipAllowlist"`
    );

    expect(() => {
      config.schema.validate({
        requestId: {
          allowFromAnyIp: true,
          ipAllowlist: ['0.0.0.0', '123.123.123.123', '1200:0000:AB00:1234:0000:2552:7777:1313'],
        },
      });
    }).toThrowErrorMatchingInlineSnapshot(
      `"[requestId]: allowFromAnyIp must be set to 'false' if any values are specified in ipAllowlist"`
    );
  });
});

test('can specify max payload as string', () => {
  const obj = {
    maxPayload: '2mb',
  };
  const configValue = config.schema.validate(obj);
  expect(configValue.maxPayload.getValueInBytes()).toBe(2 * 1024 * 1024);
});

describe('shutdownTimeout', () => {
  test('can specify a valid shutdownTimeout', () => {
    const configValue = config.schema.validate({ shutdownTimeout: '5s' });
    expect(configValue.shutdownTimeout.asMilliseconds()).toBe(5000);
  });

  test('can specify a valid shutdownTimeout (lower-edge of 1 second)', () => {
    const configValue = config.schema.validate({ shutdownTimeout: '1s' });
    expect(configValue.shutdownTimeout.asMilliseconds()).toBe(1000);
  });

  test('can specify a valid shutdownTimeout (upper-edge of 2 minutes)', () => {
    const configValue = config.schema.validate({ shutdownTimeout: '2m' });
    expect(configValue.shutdownTimeout.asMilliseconds()).toBe(120000);
  });

  test('should error if below 1s', () => {
    expect(() => config.schema.validate({ shutdownTimeout: '100ms' })).toThrow(
      '[shutdownTimeout]: the value should be between 1 second and 2 minutes'
    );
  });

  test('should error if over 2 minutes', () => {
    expect(() => config.schema.validate({ shutdownTimeout: '3m' })).toThrow(
      '[shutdownTimeout]: the value should be between 1 second and 2 minutes'
    );
  });
});

describe('basePath', () => {
  test('throws if missing prepended slash', () => {
    const httpSchema = config.schema;
    const obj = {
      basePath: 'foo',
    };
    expect(() => httpSchema.validate(obj)).toThrowErrorMatchingSnapshot();
  });

  test('throws if appends a slash', () => {
    const httpSchema = config.schema;
    const obj = {
      basePath: '/foo/',
    };
    expect(() => httpSchema.validate(obj)).toThrowErrorMatchingSnapshot();
  });

  test('throws if is an empty string', () => {
    const httpSchema = config.schema;
    const obj = {
      basePath: '',
    };
    expect(() => httpSchema.validate(obj)).toThrowErrorMatchingSnapshot();
  });

  test('throws if not specified, but rewriteBasePath is set', () => {
    const httpSchema = config.schema;
    const obj = {
      rewriteBasePath: true,
    };
    expect(() => httpSchema.validate(obj)).toThrowErrorMatchingSnapshot();
  });
});

describe('publicBaseUrl', () => {
  test('throws if invalid HTTP(S) URL', () => {
    const httpSchema = config.schema;
    expect(() =>
      httpSchema.validate({ publicBaseUrl: 'myhost.com' })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[publicBaseUrl]: expected URI with scheme [http|https]."`
    );
    expect(() =>
      httpSchema.validate({ publicBaseUrl: '//myhost.com' })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[publicBaseUrl]: expected URI with scheme [http|https]."`
    );
    expect(() =>
      httpSchema.validate({ publicBaseUrl: 'ftp://myhost.com' })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[publicBaseUrl]: expected URI with scheme [http|https]."`
    );
  });

  test('throws if includes hash, query, or auth', () => {
    const httpSchema = config.schema;
    expect(() =>
      httpSchema.validate({ publicBaseUrl: 'http://myhost.com/?a=b' })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[publicBaseUrl] may only contain a protocol, host, port, and pathname"`
    );
    expect(() =>
      httpSchema.validate({ publicBaseUrl: 'http://myhost.com/#a' })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[publicBaseUrl] may only contain a protocol, host, port, and pathname"`
    );
    expect(() =>
      httpSchema.validate({ publicBaseUrl: 'http://user:pass@myhost.com' })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[publicBaseUrl] may only contain a protocol, host, port, and pathname"`
    );
  });

  test('throws if basePath and publicBaseUrl are specified, but do not match', () => {
    const httpSchema = config.schema;
    expect(() =>
      httpSchema.validate({
        basePath: '/foo',
        publicBaseUrl: 'https://myhost.com/',
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[publicBaseUrl] must contain the [basePath]: / !== /foo"`
    );
  });

  test('does not throw if valid URL and matches basePath', () => {
    const httpSchema = config.schema;
    expect(() => httpSchema.validate({ publicBaseUrl: 'http://myhost.com' })).not.toThrow();
    expect(() => httpSchema.validate({ publicBaseUrl: 'http://myhost.com/' })).not.toThrow();
    expect(() => httpSchema.validate({ publicBaseUrl: 'https://myhost.com' })).not.toThrow();
    expect(() =>
      httpSchema.validate({ publicBaseUrl: 'https://myhost.com/foo', basePath: '/foo' })
    ).not.toThrow();
    expect(() => httpSchema.validate({ publicBaseUrl: 'http://myhost.com:8080' })).not.toThrow();
    expect(() =>
      httpSchema.validate({ publicBaseUrl: 'http://myhost.com:4/foo', basePath: '/foo' })
    ).not.toThrow();
  });
});

test('accepts only valid uuids for server.uuid', () => {
  const httpSchema = config.schema;
  expect(() => httpSchema.validate({ uuid: uuidv4() })).not.toThrow();
  expect(() => httpSchema.validate({ uuid: 'not an uuid' })).toThrowErrorMatchingInlineSnapshot(
    `"[uuid]: must be a valid uuid"`
  );
});

describe('server.name', () => {
  test('uses os.hostname() as default for server.name', () => {
    const httpSchema = config.schema;
    const validated = httpSchema.validate({});
    expect(validated.name).toEqual('kibana-hostname');
  });

  test('removes non-ascii characters from os.hostname() when used as default', () => {
    mockHostname = 'Apple’s amazing idea♥';
    const httpSchema = config.schema;
    const validated = httpSchema.validate({});
    expect(validated.name).toEqual('Apples amazing idea');
  });
});

test('throws if xsrf.allowlist element does not start with a slash', () => {
  const httpSchema = config.schema;
  const obj = {
    xsrf: {
      allowlist: ['/valid-path', 'invalid-path'],
    },
  };
  expect(() => httpSchema.validate(obj)).toThrowErrorMatchingInlineSnapshot(
    `"[xsrf.allowlist.1]: must start with a slash"`
  );
});

describe('xsrf.allowedSchemes', () => {
  it('rejects schemes outside the apikey/bearer safe set', () => {
    const httpSchema = config.schema;
    expect(() =>
      httpSchema.validate({ xsrf: { allowedSchemes: ['basic'] } })
    ).toThrowErrorMatchingInlineSnapshot(
      `"[xsrf.allowedSchemes.0]: must be one of [apikey, bearer]"`
    );
    expect(() => httpSchema.validate({ xsrf: { allowedSchemes: ['foo'] } })).toThrow(
      /must be one of \[apikey, bearer\]/
    );
  });

  it('rejects a scalar string — allowedSchemes must be an array', () => {
    expect(() => config.schema.validate({ xsrf: { allowedSchemes: 'apikey' as any } })).toThrow(
      /\[xsrf.allowedSchemes\]/
    );
  });

  it('accepts apikey and bearer case-insensitively and an empty list', () => {
    const httpSchema = config.schema;
    expect(
      httpSchema.validate({ xsrf: { allowedSchemes: ['ApiKey', 'BEARER'] } }).xsrf.allowedSchemes
    ).toEqual(['ApiKey', 'BEARER']);
    expect(
      httpSchema.validate({ xsrf: { allowedSchemes: [] } }, { serverless: true }).xsrf
        .allowedSchemes
    ).toEqual([]);
  });

  it('defaults to apikey and bearer on serverless and empty on traditional', () => {
    const httpSchema = config.schema;
    expect(httpSchema.validate({}, { serverless: true }).xsrf.allowedSchemes).toEqual([
      'apikey',
      'bearer',
    ]);
    expect(httpSchema.validate({}, { traditional: true }).xsrf.allowedSchemes).toEqual([]);
  });
});

test('accepts any type of objects for custom headers', () => {
  const httpSchema = config.schema;
  const obj = {
    customResponseHeaders: {
      string: 'string',
      bool: true,
      number: 12,
      array: [1, 2, 3],
      nested: {
        foo: 1,
        bar: 'dolly',
      },
    },
  };
  expect(() => httpSchema.validate(obj)).not.toThrow();
});

test('forbids the "location" custom response header', () => {
  const httpSchema = config.schema;
  const obj = {
    customResponseHeaders: {
      location: 'string',
      Location: 'string',
      lOcAtIoN: 'string',
    },
  };
  expect(() => httpSchema.validate(obj)).toThrowErrorMatchingInlineSnapshot(
    `"[customResponseHeaders]: The following custom response headers are not allowed to be set: location, Location, lOcAtIoN"`
  );
});

test('forbids the "refresh" custom response header', () => {
  const httpSchema = config.schema;
  const obj = {
    customResponseHeaders: {
      refresh: 'string',
      Refresh: 'string',
      rEfReSh: 'string',
    },
  };
  expect(() => httpSchema.validate(obj)).toThrowErrorMatchingInlineSnapshot(
    `"[customResponseHeaders]: The following custom response headers are not allowed to be set: refresh, Refresh, rEfReSh"`
  );
});

describe('with TLS', () => {
  test('throws if TLS is enabled but `redirectHttpFromPort` is equal to `port`', () => {
    const httpSchema = config.schema;
    const obj = {
      port: 1234,
      ssl: {
        certificate: '/path/to/certificate',
        enabled: true,
        key: '/path/to/key',
        redirectHttpFromPort: 1234,
      },
    };
    expect(() => httpSchema.validate(obj)).toThrowErrorMatchingSnapshot();
  });
});

test('can specify socket timeouts', () => {
  const obj = {
    keepaliveTimeout: 1e5,
    socketTimeout: 5e5,
  };
  const { keepaliveTimeout, socketTimeout } = config.schema.validate(obj);
  expect(keepaliveTimeout).toBe(1e5);
  expect(socketTimeout).toBe(5e5);
});

test('can specify payload timeouts', () => {
  const obj = {
    payloadTimeout: 654321,
  };
  const { payloadTimeout } = config.schema.validate(obj);
  expect(payloadTimeout).toBe(654321);
});

describe('with compression', () => {
  test('accepts valid referrer whitelist', () => {
    const {
      compression: { referrerWhitelist },
    } = config.schema.validate({
      compression: {
        referrerWhitelist: validHostnames,
      },
    });

    expect(referrerWhitelist).toMatchSnapshot();
  });

  test('throws if invalid referrer whitelist', () => {
    const httpSchema = config.schema;
    const nonEmptyArray = {
      compression: {
        referrerWhitelist: invalidHostnames,
      },
    };
    const emptyArray = {
      compression: {
        referrerWhitelist: [],
      },
    };
    expect(() => httpSchema.validate(nonEmptyArray)).toThrowErrorMatchingSnapshot();
    expect(() => httpSchema.validate(emptyArray)).toThrowErrorMatchingSnapshot();
  });

  test('throws if referrer whitelist is specified and compression is disabled', () => {
    const httpSchema = config.schema;
    const obj = {
      compression: {
        enabled: false,
        referrerWhitelist: validHostnames,
      },
    };
    expect(() => httpSchema.validate(obj)).toThrowErrorMatchingSnapshot();
  });
});

describe('compression.brotli', () => {
  describe('enabled', () => {
    it('defaults to `false`', () => {
      expect(config.schema.validate({}).compression.brotli.enabled).toEqual(false);
    });
  });
  describe('quality', () => {
    it('defaults to `3`', () => {
      expect(config.schema.validate({}).compression.brotli.quality).toEqual(3);
    });
    it('does not accepts value superior to `11`', () => {
      expect(() =>
        config.schema.validate({ compression: { brotli: { quality: 12 } } })
      ).toThrowErrorMatchingInlineSnapshot(
        `"[compression.brotli.quality]: Value must be equal to or lower than [11]."`
      );
    });
    it('does not accepts value inferior to `0`', () => {
      expect(() =>
        config.schema.validate({ compression: { brotli: { quality: -1 } } })
      ).toThrowErrorMatchingInlineSnapshot(
        `"[compression.brotli.quality]: Value must be equal to or greater than [0]."`
      );
    });
  });
});

describe('cors', () => {
  describe('allowOrigin', () => {
    it('list cannot be empty', () => {
      expect(() =>
        config.schema.validate({
          cors: {
            allowOrigin: [],
          },
        })
      ).toThrowErrorMatchingInlineSnapshot(`
        "[cors.allowOrigin]: types that failed validation:
        - [cors.allowOrigin.0]: array size is [0], but cannot be smaller than [1]
        - [cors.allowOrigin.1]: array size is [0], but cannot be smaller than [1]"
      `);
    });

    it('list of valid URLs', () => {
      const allowOrigin = ['http://127.0.0.1:3000', 'https://elastic.co'];
      expect(
        config.schema.validate({
          cors: { allowOrigin },
        }).cors.allowOrigin
      ).toStrictEqual(allowOrigin);

      expect(() =>
        config.schema.validate({
          cors: {
            allowOrigin: ['*://elastic.co/*'],
          },
        })
      ).toThrow();
    });

    it('can be configured as "*" wildcard', () => {
      expect(config.schema.validate({ cors: { allowOrigin: ['*'] } }).cors.allowOrigin).toEqual([
        '*',
      ]);
    });

    it('cannot mix wildcard "*" with valid URLs', () => {
      expect(
        () =>
          config.schema.validate({ cors: { allowOrigin: ['*', 'https://elastic.co'] } }).cors
            .allowOrigin
      ).toThrowErrorMatchingInlineSnapshot(`
        "[cors.allowOrigin]: types that failed validation:
        - [cors.allowOrigin.0.0]: expected URI with scheme [http|https].
        - [cors.allowOrigin.1.1]: expected value to equal [*]"
      `);
    });
  });
  describe('credentials', () => {
    it('cannot use wildcard allowOrigin if "credentials: true"', () => {
      expect(
        () =>
          config.schema.validate({ cors: { allowCredentials: true, allowOrigin: ['*'] } }).cors
            .allowOrigin
      ).toThrowErrorMatchingInlineSnapshot(
        `"[cors]: Cannot specify wildcard origin \\"*\\" with \\"credentials: true\\". Please provide a list of allowed origins."`
      );
      expect(
        () => config.schema.validate({ cors: { allowCredentials: true } }).cors.allowOrigin
      ).toThrowErrorMatchingInlineSnapshot(
        `"[cors]: Cannot specify wildcard origin \\"*\\" with \\"credentials: true\\". Please provide a list of allowed origins."`
      );
    });
  });
});

test('oas is disabled by default', () => {
  const { oas } = config.schema.validate({});
  expect(oas.enabled).toBe(false);
});

describe('versioned', () => {
  it('defaults version resolution "oldest" not in dev', () => {
    expect(config.schema.validate({}, { dev: undefined })).toMatchObject({
      versioned: { versionResolution: 'oldest' },
    });
    expect(config.schema.validate({}, { dev: false })).toMatchObject({
      versioned: { versionResolution: 'oldest' },
    });
  });

  it('does not allow "none" when not in dev', () => {
    expect(() =>
      config.schema.validate({ versioned: { versionResolution: 'none' } }, { dev: false })
    ).toThrow(/failed validation/);
  });

  it('defaults version resolution "oldest" when in dev', () => {
    expect(config.schema.validate({}, { dev: true })).toMatchObject({
      versioned: { versionResolution: 'oldest' },
    });
  });
});

describe('serverTiming', () => {
  it('defaults to true in dev', () => {
    expect(config.schema.validate({}, { dev: true })).toMatchObject({
      serverTiming: true,
    });
  });

  it('defaults to false in production', () => {
    expect(config.schema.validate({}, { dev: false })).toMatchObject({
      serverTiming: false,
    });
  });

  it('allows enabling in dev', () => {
    expect(config.schema.validate({ serverTiming: true }, { dev: true })).toMatchObject({
      serverTiming: true,
    });
  });

  it('allows disabling in dev', () => {
    expect(config.schema.validate({ serverTiming: false }, { dev: true })).toMatchObject({
      serverTiming: false,
    });
  });

  it('throws when trying to enable in production', () => {
    expect(() => config.schema.validate({ serverTiming: true }, { dev: false })).toThrow();
  });
});

describe('serverTimingElasticsearch', () => {
  it('defaults to true in dev', () => {
    expect(config.schema.validate({}, { dev: true })).toMatchObject({
      serverTimingElasticsearch: true,
    });
  });

  it('defaults to false in production', () => {
    expect(config.schema.validate({}, { dev: false })).toMatchObject({
      serverTimingElasticsearch: false,
    });
  });

  it('allows enabling in dev', () => {
    expect(
      config.schema.validate({ serverTimingElasticsearch: true }, { dev: true })
    ).toMatchObject({
      serverTimingElasticsearch: true,
    });
  });

  it('allows disabling in dev', () => {
    expect(
      config.schema.validate({ serverTimingElasticsearch: false }, { dev: true })
    ).toMatchObject({
      serverTimingElasticsearch: false,
    });
  });

  it('throws when trying to enable in production', () => {
    expect(() =>
      config.schema.validate({ serverTimingElasticsearch: true }, { dev: false })
    ).toThrow();
  });
});

describe('restrictInternalApis', () => {
  it('is allowed on serverless and traditional', () => {
    expect(() => config.schema.validate({ restrictInternalApis: false }, {})).not.toThrow();
    expect(() => config.schema.validate({ restrictInternalApis: true }, {})).not.toThrow();
    expect(
      config.schema.validate({ restrictInternalApis: true }, { serverless: true })
    ).toMatchObject({
      restrictInternalApis: true,
    });
    expect(
      config.schema.validate({ restrictInternalApis: true }, { traditional: true })
    ).toMatchObject({
      restrictInternalApis: true,
    });
  });
  it('defaults to true', () => {
    expect(
      config.schema.validate({ restrictInternalApis: undefined }, { serverless: true })
    ).toMatchObject({ restrictInternalApis: true });
    expect(
      config.schema.validate({ restrictInternalApis: undefined }, { traditional: true })
    ).toMatchObject({ restrictInternalApis: true });
  });
});

describe('excludeRoutes', () => {
  it('defaults to empty array', () => {
    expect(config.schema.validate({}).excludeRoutes).toEqual([]);
  });

  it('accepts a list of paths', () => {
    expect(config.schema.validate({ excludeRoutes: ['/api/status'] })).toMatchObject({
      excludeRoutes: ['/api/status'],
    });
  });

  it('rejects entries without a leading slash', () => {
    expect(() => config.schema.validate({ excludeRoutes: ['api/status'] })).toThrow(
      'must start with a slash'
    );
  });
});

describe('cdn', () => {
  it('allows correct URL', () => {
    expect(config.schema.validate({ cdn: { url: 'https://cdn.example.com' } })).toMatchObject({
      cdn: { url: 'https://cdn.example.com' },
    });
  });
  it('can be "unset" using "null"', () => {
    expect(config.schema.validate({ cdn: { url: null } })).toMatchObject({
      cdn: { url: null },
    });
  });
  it.each([['foo'], ['http:./']])('throws for invalid URL %s', (url) => {
    expect(() => config.schema.validate({ cdn: { url } })).toThrow(
      /expected URI with scheme \[http\|https\]/
    );
  });
  it.each([
    ['https://cdn.example.com:1234/asd?thing=1', 'URL query string not allowed'],
    ['https://cdn.example.com:1234/asd#cool', 'URL fragment not allowed'],
    [
      'https://cdn.example.com:1234/asd?thing=1#cool',
      'URL fragment not allowed, but found "#cool"\nURL query string not allowed, but found "?thing=1"',
    ],
  ])('throws for disallowed values %s', (url, expecterError) => {
    expect(() => config.schema.validate({ cdn: { url } })).toThrow(expecterError);
  });
});

describe('http1 protocol', () => {
  it('uses http1 as default if protocol is empty and ssl is not enabled', () => {
    expect(
      config.schema.validate({
        ssl: {
          enabled: false,
        },
      })
    ).toEqual(
      expect.objectContaining({
        protocol: 'http1',
      })
    );
  });
});

describe('http2 protocol', () => {
  it('throws if http2 is enabled but TLS is not', () => {
    expect(() =>
      config.schema.validate({
        protocol: 'http2',
        ssl: {
          enabled: false,
        },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"http2 requires TLS to be enabled. Use 'http2.allowUnsecure: true' to allow running http2 without a valid h2c setup"`
    );
  });
  it('throws if http2 is enabled but TLS has no suitable versions', () => {
    expect(() =>
      config.schema.validate({
        protocol: 'http2',
        ssl: {
          enabled: true,
          supportedProtocols: ['TLSv1.1'],
          certificate: '/path/to/certificate',
          key: '/path/to/key',
        },
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `"http2 requires 'ssl.supportedProtocols' to include TLSv1.2 or TLSv1.3. Use 'http2.allowUnsecure: true' to allow running http2 without a valid h2c setup"`
    );
  });
  it('does not throws if http2 is enabled and TLS is not if http2.allowUnsecure is true', () => {
    expect(
      config.schema.validate({
        protocol: 'http2',
        http2: {
          allowUnsecure: true,
        },
        ssl: {
          enabled: false,
        },
      })
    ).toEqual(
      expect.objectContaining({
        protocol: 'http2',
      })
    );
  });
  it('does not throws if supportedProtocols are not valid for h2c if http2.allowUnsecure is true', () => {
    expect(
      config.schema.validate({
        protocol: 'http2',
        http2: {
          allowUnsecure: true,
        },
        ssl: {
          enabled: true,
          supportedProtocols: ['TLSv1.1'],
          certificate: '/path/to/certificate',
          key: '/path/to/key',
        },
      })
    ).toEqual(
      expect.objectContaining({
        protocol: 'http2',
      })
    );
  });
  it('uses http2 as default if protocol is empty and ssl is enabled', () => {
    expect(
      config.schema.validate({
        ssl: {
          enabled: true,
          supportedProtocols: ['TLSv1.2'],
          certificate: '/path/to/certificate',
          key: '/path/to/key',
        },
      })
    ).toEqual(
      expect.objectContaining({
        protocol: 'http2',
      })
    );
  });
});

describe('prototypeHardening', () => {
  it('defaults to true', () => {
    expect(config.schema.validate({}).prototypeHardening).toBe(true);
  });

  it('can be set to false', () => {
    expect(config.schema.validate({ prototypeHardening: false }).prototypeHardening).toBe(false);
  });
});

describe('HttpConfig', () => {
  it('converts customResponseHeaders to strings or arrays of strings', () => {
    const httpSchema = config.schema;
    const rawConfig = httpSchema.validate({
      customResponseHeaders: {
        string: 'string',
        bool: true,
        number: 12,
        array: [1, 2, 3],
        nested: {
          foo: 1,
          bar: 'dolly',
        },
      },
    });
    const rawCspConfig = cspConfig.schema.validate({});
    const rawPermissionsPolicyConfig = permissionsPolicyConfig.schema.validate({});
    const httpConfig = new HttpConfig(
      rawConfig,
      rawCspConfig,
      ExternalUrlConfig.DEFAULT,
      rawPermissionsPolicyConfig
    );

    expect(httpConfig.customResponseHeaders).toEqual({
      string: 'string',
      bool: 'true',
      number: '12',
      array: ['1', '2', '3'],
      nested: '{"foo":1,"bar":"dolly"}',
    });
  });

  it('defaults restrictInternalApis to true', () => {
    const rawConfig = config.schema.validate({}, {});
    const rawCspConfig = cspConfig.schema.validate({});
    const rawPermissionsPolicyConfig = permissionsPolicyConfig.schema.validate({});
    const httpConfig = new HttpConfig(
      rawConfig,
      rawCspConfig,
      ExternalUrlConfig.DEFAULT,
      rawPermissionsPolicyConfig
    );
    expect(httpConfig.restrictInternalApis).toBe(true);
  });

  it('normalizes xsrf.allowedSchemes to a deduped, lower-cased list', () => {
    const rawConfig = config.schema.validate({
      xsrf: { allowedSchemes: ['ApiKey', ' bearer ', 'apikey'] },
    });
    const rawCspConfig = cspConfig.schema.validate({});
    const rawPermissionsPolicyConfig = permissionsPolicyConfig.schema.validate({});
    const httpConfig = new HttpConfig(
      rawConfig,
      rawCspConfig,
      ExternalUrlConfig.DEFAULT,
      rawPermissionsPolicyConfig
    );
    expect(httpConfig.xsrf.allowedSchemes).toEqual(['apikey', 'bearer']);
  });
});
