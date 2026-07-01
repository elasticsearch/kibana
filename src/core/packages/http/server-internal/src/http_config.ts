/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EOL, hostname } from 'node:os';
import url, { URL } from 'node:url';
import type { Duration } from 'moment';
import type { ByteSizeValue, TypeOf } from '@kbn/config-schema';
import { offeringBasedSchema, schema } from '@kbn/config-schema';
import type { IHttpConfig } from '@kbn/server-http-tools';
import { SslConfig, sslSchema, TLS_V1_2, TLS_V1_3 } from '@kbn/server-http-tools';
import type { ServiceConfigDescriptor } from '@kbn/core-base-server-internal';
import { uuidRegexp } from '@kbn/core-base-server-internal';
import type { HttpProtocol, ICspConfig, IExternalUrlConfig } from '@kbn/core-http-server';
import type { IHttpEluMonitorConfig } from '@kbn/core-http-server/src/elu_monitor';
import type { HandlerResolutionStrategy } from '@kbn/core-http-router-server-internal';
import { get } from 'lodash';
import type { CspConfigType } from './csp';
import { CspConfig } from './csp';
import type { ExternalUrlConfig } from './external_url';
import {
  parseRawSecurityResponseHeadersConfig,
  securityResponseHeadersSchema,
} from './security_response_headers_config';
import { CdnConfig } from './cdn_config';
import type { PermissionsPolicyConfigType } from './permissions_policy';
import { type RateLimiterConfig, rateLimiterConfigSchema } from './rate_limiter';

const SECOND = 1000;

const validBasePathRegex = /^\/.*[^\/]$/;

const hostURISchema = schema.uri({ scheme: ['http', 'https'] });
const match = (regex: RegExp, errorMsg: string) => (str: string) =>
  regex.test(str) ? undefined : errorMsg;

// The lower-case set of response headers which are forbidden within `customResponseHeaders`.
const RESPONSE_HEADER_DENY_LIST = ['location', 'refresh'];

// Auth schemes operators may exempt from the kbn-xsrf check via `server.xsrf.allowedSchemes`.
// All must be stateless, per-request credentials that cannot carry a browser session. `basic` is
// intentionally excluded: browsers can cache Basic credentials and replay them cross-origin.
const XSRF_EXEMPTABLE_SCHEMES = new Set(['apikey', 'bearer']);

const validateXsrfScheme = (value: string) =>
  XSRF_EXEMPTABLE_SCHEMES.has(value.trim().toLowerCase())
    ? undefined
    : `must be one of [${[...XSRF_EXEMPTABLE_SCHEMES].join(', ')}]`;

const validHostName = () => {
  // see https://github.com/elastic/kibana/issues/139730
  return hostname().replace(/[^\x00-\x7F]/g, '');
};

/**
 * We assume the URL does not contain anything after the pathname so that
 * we can safely append values to the pathname at runtime.
 */
export const validateCdnURL = (urlString: string) => {
  const cdnURL = new URL(urlString);
  const errors: string[] = [];
  if (cdnURL.hash.length) {
    errors.push(`URL fragment not allowed, but found "${cdnURL.hash}"`);
  }
  if (cdnURL.search.length) {
    errors.push(`URL query string not allowed, but found "${cdnURL.search}"`);
  }
  if (errors.length) {
    return `CDN URL "${cdnURL.href}" is invalid:${EOL}${errors.join(EOL)}`;
  }
};

const configSchema = schema.object(
  {
    name: schema.string({ defaultValue: () => validHostName() }),
    autoListen: schema.boolean({ defaultValue: true }),
    publicBaseUrl: schema.maybe(schema.uri({ scheme: ['http', 'https'] })),
    basePath: schema.maybe(
      schema.string({
        validate: match(validBasePathRegex, "must start with a slash, don't end with one"),
      })
    ),
    shutdownTimeout: schema.duration({
      defaultValue: '30s',
      validate: (duration) => {
        const durationMs = duration.asMilliseconds();
        if (durationMs < 1000 || durationMs > 2 * 60 * 1000) {
          return 'the value should be between 1 second and 2 minutes';
        }
      },
    }),
    cdn: schema.object({
      url: schema.nullable(
        schema.maybe(schema.uri({ scheme: ['http', 'https'], validate: validateCdnURL }))
      ),
    }),
    oas: schema.object({
      enabled: schema.boolean({ defaultValue: false }),
    }),
    cors: schema.object(
      {
        enabled: schema.boolean({ defaultValue: false }),
        allowCredentials: schema.boolean({ defaultValue: false }),
        allowOrigin: schema.oneOf(
          [
            schema.arrayOf(hostURISchema, { minSize: 1, maxSize: 100 }),
            schema.arrayOf(schema.literal('*'), { minSize: 1, maxSize: 1 }),
          ],
          {
            defaultValue: ['*'],
          }
        ),
      },
      {
        validate(value) {
          if (value.allowCredentials === true && value.allowOrigin.includes('*')) {
            return 'Cannot specify wildcard origin "*" with "credentials: true". Please provide a list of allowed origins.';
          }
        },
      }
    ),
    securityResponseHeaders: securityResponseHeadersSchema,
    customResponseHeaders: schema.recordOf(schema.string(), schema.any(), {
      defaultValue: {},
      validate(value) {
        const forbiddenKeys = Object.keys(value).filter((headerName) =>
          RESPONSE_HEADER_DENY_LIST.includes(headerName.toLowerCase())
        );
        if (forbiddenKeys.length > 0) {
          return `The following custom response headers are not allowed to be set: ${forbiddenKeys.join(
            ', '
          )}`;
        }
      },
    }),
    protocol: schema.conditional(
      schema.siblingRef('ssl.enabled'),
      schema.literal(true),
      schema.oneOf([schema.literal('http1'), schema.literal('http2')], {
        defaultValue: 'http2',
      }),
      schema.oneOf([schema.literal('http1'), schema.literal('http2')], {
        defaultValue: 'http1',
      })
    ),
    prototypeHardening: schema.boolean({ defaultValue: true }),
    host: schema.string({
      defaultValue: 'localhost',
      hostname: true,
    }),
    maxPayload: schema.byteSize({
      defaultValue: '1048576b',
    }),
    port: schema.number({
      defaultValue: 5601,
    }),
    rewriteBasePath: schema.boolean({ defaultValue: false }),
    ssl: sslSchema,
    keepaliveTimeout: schema.number({
      defaultValue: 120 * SECOND,
    }),
    socketTimeout: schema.number({
      defaultValue: 120 * SECOND,
    }),
    payloadTimeout: schema.number({
      defaultValue: 20 * SECOND,
    }),
    http2: schema.object({
      allowUnsecure: schema.boolean({ defaultValue: false }),
    }),
    compression: schema.object({
      enabled: schema.boolean({ defaultValue: true }),
      brotli: schema.object({
        enabled: schema.boolean({ defaultValue: false }),
        quality: schema.number({ defaultValue: 3, min: 0, max: 11 }),
      }),
      referrerWhitelist: schema.maybe(
        schema.arrayOf(
          schema.string({
            hostname: true,
          }),
          { minSize: 1, maxSize: 100 }
        )
      ),
    }),
    uuid: schema.maybe(
      schema.string({
        validate: match(uuidRegexp, 'must be a valid uuid'),
      })
    ),
    xsrf: schema.object({
      disableProtection: schema.boolean({ defaultValue: false }),
      allowlist: schema.arrayOf(
        schema.string({ validate: match(/^\//, 'must start with a slash') }),
        { defaultValue: [], maxSize: 100 }
      ),
      allowedSchemes: offeringBasedSchema({
        serverless: schema.arrayOf(schema.string({ validate: validateXsrfScheme, maxLength: 50 }), {
          defaultValue: ['apikey', 'bearer'],
          maxSize: 100,
        }),
        traditional: schema.arrayOf(
          schema.string({ validate: validateXsrfScheme, maxLength: 50 }),
          {
            defaultValue: [],
            maxSize: 100,
          }
        ),
      }),
    }),
    excludeRoutes: schema.arrayOf(
      schema.string({ validate: match(/^\//, 'must start with a slash') }),
      { defaultValue: [], maxSize: 100 }
    ),
    eluMonitor: schema.object({
      enabled: schema.boolean({ defaultValue: true }),
      logging: schema.object({
        enabled: schema.conditional(
          schema.contextRef('dist'),
          false,
          schema.boolean({ defaultValue: true }),
          schema.boolean({ defaultValue: false })
        ),
        threshold: schema.object({
          elu: schema.number({ defaultValue: 0.15, min: 0, max: 1 }),
          ela: schema.number({ defaultValue: 250, min: 0 }),
        }),
      }),
    }),
    rateLimiter: rateLimiterConfigSchema,
    requestId: schema.object(
      {
        allowFromAnyIp: schema.boolean({ defaultValue: false }),
        ipAllowlist: schema.arrayOf(schema.ip(), { defaultValue: [], maxSize: 100 }),
      },
      {
        validate(value) {
          if (value.allowFromAnyIp === true && value.ipAllowlist?.length > 0) {
            return `allowFromAnyIp must be set to 'false' if any values are specified in ipAllowlist`;
          }
        },
      }
    ),
    // disable access to internal routes by default
    restrictInternalApis: schema.boolean({ defaultValue: true }),

    versioned: schema.object({
      /**
       * Which handler resolution algo to use for public routes: "newest" or "oldest".
       *
       * @note Internal routes always require a version to be specified.
       * @note in development we have an additional option "none".
       *       This prevents any fallbacks and requires that a version specified.
       *       Useful for ensuring that a given client always specifies a version.
       */
      versionResolution: schema.conditional(
        schema.contextRef('dev'),
        true,
        schema.oneOf([schema.literal('newest'), schema.literal('oldest'), schema.literal('none')], {
          defaultValue: 'oldest',
        }),
        schema.oneOf([schema.literal('newest'), schema.literal('oldest')], {
          defaultValue: 'oldest',
        })
      ),

      /**
       * Whether we require the Kibana browser build version to match the Kibana server build version.
       *
       * This number is determined when a distributable version of Kibana is built and ensures that only
       * same-build browsers can access the Kibana server.
       */
      strictClientVersionCheck: schema.boolean({ defaultValue: true }),

      /** This should not be configurable in serverless */
      useVersionResolutionStrategyForInternalPaths: offeringBasedSchema({
        traditional: schema.arrayOf(schema.string(), { defaultValue: [], maxSize: 100 }),
        serverless: schema.never(),
      }),
    }),

    serverTiming: schema.conditional(
      schema.contextRef('dev'),
      true,
      /** In dev mode: allow true/false, default to true */
      schema.boolean({ defaultValue: true }),
      /** In production: only allow false, default to false */
      schema.oneOf([schema.literal(false)], { defaultValue: false })
    ),

    serverTimingElasticsearch: schema.conditional(
      schema.contextRef('dev'),
      true,
      /** In dev mode: allow true/false, default to true */
      schema.boolean({ defaultValue: true }),
      /** In production: only allow false, default to false */
      schema.oneOf([schema.literal(false)], { defaultValue: false })
    ),
  },
  {
    validate: (rawConfig) => {
      if (!rawConfig.basePath && rawConfig.rewriteBasePath) {
        return 'cannot use [rewriteBasePath] when [basePath] is not specified';
      }

      if (rawConfig.publicBaseUrl) {
        const parsedUrl = url.parse(rawConfig.publicBaseUrl);
        if (parsedUrl.query || parsedUrl.hash || parsedUrl.auth) {
          return `[publicBaseUrl] may only contain a protocol, host, port, and pathname`;
        }
        if (parsedUrl.path !== (rawConfig.basePath ?? '/')) {
          return `[publicBaseUrl] must contain the [basePath]: ${parsedUrl.path} !== ${rawConfig.basePath}`;
        }
      }

      if (!rawConfig.compression.enabled && rawConfig.compression.referrerWhitelist) {
        return 'cannot use [compression.referrerWhitelist] when [compression.enabled] is set to false';
      }

      if (rawConfig.protocol === 'http2' && !rawConfig.http2.allowUnsecure) {
        const err = ensureValidTLSConfigForH2C(rawConfig.ssl);
        if (err) {
          return err;
        }
      }

      if (
        rawConfig.ssl.enabled &&
        rawConfig.ssl.redirectHttpFromPort !== undefined &&
        rawConfig.ssl.redirectHttpFromPort === rawConfig.port
      ) {
        return (
          'Kibana does not accept http traffic to [port] when ssl is ' +
          'enabled (only https is allowed), so [ssl.redirectHttpFromPort] ' +
          `cannot be configured to the same value. Both are [${rawConfig.port}].`
        );
      }
    },
  }
);

export type HttpConfigType = TypeOf<typeof configSchema>;

export const config: ServiceConfigDescriptor<HttpConfigType> = {
  path: 'server' as const,
  schema: configSchema,
  deprecations: ({ rename }) => [
    rename('maxPayloadBytes', 'maxPayload', { level: 'warning' }),
    (settings, fromPath, addDeprecation, { docLinks }) => {
      const cfg = get(settings, fromPath);
      if (!cfg?.ssl?.enabled || cfg?.protocol === 'http1') {
        addDeprecation({
          level: 'warning',
          title: `Consider enabling TLS and using HTTP/2 to improve security and performance.`,
          configPath: `${fromPath}.protocol,${fromPath}.ssl.enabled`,
          message: `TLS is not enabled, or the HTTP protocol is set to HTTP/1. Enabling TLS and using HTTP/2 improves security and performance.`,
          correctiveActions: {
            manualSteps: [
              `Set up TLS by configuring ${fromPath}.ssl.`,
              `Set the protocol to 'http2' by updating ${fromPath}.protocol to 'http2' in your configuration.`,
            ],
          },
          documentationUrl: docLinks.server.protocol,
        });
      }
    },
  ],
};

export class HttpConfig implements IHttpConfig {
  public name: string;
  public autoListen: boolean;
  public protocol: HttpProtocol;
  public host: string;
  public keepaliveTimeout: number;
  public socketTimeout: number;
  public payloadTimeout: number;
  public port: number;
  public cors: {
    enabled: boolean;
    allowCredentials: boolean;
    allowOrigin: string[];
  };
  public oas: {
    enabled: boolean;
  };
  public securityResponseHeaders: Record<string, string | string[]>;
  public customResponseHeaders: Record<string, string | string[]>;
  public maxPayload: ByteSizeValue;
  public basePath?: string;
  public publicBaseUrl?: string;
  public rewriteBasePath: boolean;
  public cdn: CdnConfig;
  public ssl: SslConfig;
  public compression: {
    enabled: boolean;
    referrerWhitelist?: string[];
    brotli: { enabled: boolean; quality: number };
  };
  public csp: ICspConfig;
  public prototypeHardening: boolean;
  public externalUrl: IExternalUrlConfig;
  public xsrf: { disableProtection: boolean; allowlist: string[]; allowedSchemes: string[] };
  public excludeRoutes: string[];
  public requestId: { allowFromAnyIp: boolean; ipAllowlist: string[] };
  public versioned: {
    versionResolution: HandlerResolutionStrategy;
    strictClientVersionCheck: boolean;
    useVersionResolutionStrategyForInternalPaths: string[];
  };
  public shutdownTimeout: Duration;
  public restrictInternalApis: boolean;
  public rateLimiter: RateLimiterConfig;
  public serverTiming: boolean;
  public serverTimingElasticsearch: boolean;

  public eluMonitor: IHttpEluMonitorConfig;

  /**
   * @internal
   */
  constructor(
    rawHttpConfig: HttpConfigType,
    rawCspConfig: CspConfigType,
    rawExternalUrlConfig: ExternalUrlConfig,
    rawPermissionsPolicyConfig: PermissionsPolicyConfigType
  ) {
    this.autoListen = rawHttpConfig.autoListen;
    this.host = rawHttpConfig.host;
    this.port = rawHttpConfig.port;
    this.cors = rawHttpConfig.cors;
    const { securityResponseHeaders, disableEmbedding } = parseRawSecurityResponseHeadersConfig(
      rawHttpConfig.securityResponseHeaders,
      rawPermissionsPolicyConfig
    );
    this.securityResponseHeaders = securityResponseHeaders;
    this.customResponseHeaders = Object.entries(rawHttpConfig.customResponseHeaders ?? {}).reduce(
      (headers, [key, value]) => {
        headers[key] = Array.isArray(value)
          ? value.map((e) => convertHeader(e))
          : convertHeader(value);
        return headers;
      },
      {} as Record<string, string | string[]>
    );
    this.maxPayload = rawHttpConfig.maxPayload;
    this.name = rawHttpConfig.name;
    this.protocol = rawHttpConfig.protocol;
    this.basePath = rawHttpConfig.basePath;
    this.publicBaseUrl = rawHttpConfig.publicBaseUrl;
    this.keepaliveTimeout = rawHttpConfig.keepaliveTimeout;
    this.socketTimeout = rawHttpConfig.socketTimeout;
    this.payloadTimeout = rawHttpConfig.payloadTimeout;
    this.rewriteBasePath = rawHttpConfig.rewriteBasePath;
    this.ssl = new SslConfig(rawHttpConfig.ssl || {});
    this.compression = rawHttpConfig.compression;
    this.cdn = CdnConfig.from(rawHttpConfig.cdn);
    this.csp = new CspConfig({ ...rawCspConfig, disableEmbedding }, this.cdn.getCspConfig());
    this.prototypeHardening = rawHttpConfig.prototypeHardening;
    this.externalUrl = rawExternalUrlConfig;
    this.xsrf = {
      ...rawHttpConfig.xsrf,
      allowedSchemes: [
        ...new Set(
          (rawHttpConfig.xsrf.allowedSchemes ?? []).map((scheme) => scheme.trim().toLowerCase())
        ),
      ],
    };
    this.excludeRoutes = rawHttpConfig.excludeRoutes;
    this.requestId = rawHttpConfig.requestId;
    this.shutdownTimeout = rawHttpConfig.shutdownTimeout;
    this.rateLimiter = rawHttpConfig.rateLimiter;
    this.serverTiming = rawHttpConfig.serverTiming;
    this.serverTimingElasticsearch = rawHttpConfig.serverTimingElasticsearch;

    // defaults to `true` if not set through config.
    this.restrictInternalApis = rawHttpConfig.restrictInternalApis;
    this.eluMonitor = rawHttpConfig.eluMonitor;
    this.versioned = rawHttpConfig.versioned;
    this.oas = rawHttpConfig.oas;
  }
}

const convertHeader = (entry: any): string => {
  return typeof entry === 'object' ? JSON.stringify(entry) : String(entry);
};

const ensureValidTLSConfigForH2C = (tlsConfig: TypeOf<typeof sslSchema>): string | undefined => {
  if (!tlsConfig.enabled) {
    return `http2 requires TLS to be enabled. Use 'http2.allowUnsecure: true' to allow running http2 without a valid h2c setup`;
  }
  if (
    !tlsConfig.supportedProtocols.includes(TLS_V1_2) &&
    !tlsConfig.supportedProtocols.includes(TLS_V1_3)
  ) {
    return `http2 requires 'ssl.supportedProtocols' to include ${TLS_V1_2} or ${TLS_V1_3}. Use 'http2.allowUnsecure: true' to allow running http2 without a valid h2c setup`;
  }
  return undefined;
};
