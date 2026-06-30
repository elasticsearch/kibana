/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createSecureContext } from 'tls';
import { isNil } from 'lodash';
import { set } from '@kbn/safer-lodash-set';
import type { Ecs } from '@elastic/ecs';
import type { OTLPLogExporter as OTLPLogExporterHTTP } from '@opentelemetry/exporter-logs-otlp-http';
import type { OTLPLogExporter as OTLPLogExporterGRPC } from '@opentelemetry/exporter-logs-otlp-grpc';
import type { OTLPLogExporter as OTLPLogExporterPROTO } from '@opentelemetry/exporter-logs-otlp-proto';
import { schema } from '@kbn/config-schema';
import type { DisposableAppender, Layout, LogLevel, LogRecord } from '@kbn/logging';
import {
  ROOT_CONTEXT,
  TraceFlags,
  trace,
  type Context,
  type Attributes,
  type AttributeValue,
} from '@opentelemetry/api';
import type { AnyValueMap } from '@opentelemetry/api-logs';
import { SeverityNumber, type Logger } from '@opentelemetry/api-logs';
import { resources } from '@elastic/opentelemetry-node/sdk';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import type { OtelAppenderConfig, LayoutConfigType } from '@kbn/core-logging-server';
import { buildOtelResources } from '@kbn/telemetry';
import { getFlattenedObject } from '@kbn/std';
import { Layouts } from '../../layouts/layouts';
import { JsonLayout } from '../../layouts/json_layout';
import {
  buildGrpcVerifyOptions,
  buildHttpsAgentTlsOptions,
  resolveTlsMaterial,
  toGrpcRootCerts,
} from './otel_tls';

const DISPOSE_TIMEOUT_MS = 5_000;

/**
 * Maps a Kibana log level to the corresponding OTel SeverityNumber.
 * Returns `0` for filter-only levels ('all', 'off') so even though the level is incorrect, the record is still logged.
 */
const toSeverityNumber = (level: LogLevel): SeverityNumber => {
  switch (level.id) {
    case 'trace':
      return SeverityNumber.TRACE;
    case 'debug':
      return SeverityNumber.DEBUG;
    case 'info':
      return SeverityNumber.INFO;
    case 'warn':
      return SeverityNumber.WARN;
    case 'error':
      return SeverityNumber.ERROR;
    case 'fatal':
      return SeverityNumber.FATAL;
    default:
      // 'all' and 'off' are filter thresholds, not record severities.
      return SeverityNumber.UNSPECIFIED;
  }
};

/**
 * Builds an OTel Context from a Kibana LogRecord's trace identifiers so that
 * the OTLP exporter can set the top-level `trace_id` / `span_id` fields on
 * the log record, enabling trace ↔ log correlation in OTel-native backends.
 * Returns `undefined` when the record has no trace context.
 */
const toTraceContext = (record: LogRecord): Context | undefined => {
  if (!record.traceId || !record.spanId) {
    return undefined;
  }

  return trace.setSpanContext(ROOT_CONTEXT, {
    traceId: record.traceId,
    spanId: record.spanId,
    traceFlags: TraceFlags.NONE,
  });
};

/**
 * Resolves the effective layout config for the OTel appender.
 *
 * Defaults to pattern layout because Elastic's OTel ingest aliases `body.text`
 * to the ECS `message` field, while `body.structured` (used by JSON layout)
 * leaves `message` empty in Logs Explorer.
 *
 * When the user selects pattern layout without an explicit pattern string, an
 * OTel-specific default of `%message %error` is used: level, timestamp, and
 * logger name are already captured as dedicated top-level OTLP fields and do
 * not need repeating in the body text.
 */
const resolveLayoutConfig = (config?: LayoutConfigType): LayoutConfigType => {
  if (!config) {
    return { type: 'pattern', pattern: '%message %error' };
  }
  if (config.type === 'pattern' && !config.pattern) {
    return { ...config, pattern: '%message %error' };
  }
  return config;
};

/**
 * Builds the OTel attribute map from a Kibana LogRecord.
 *
 * Per the OTel Logs spec:
 * - `body` carries the primary log payload (see `append()` for layout variants).
 * - Process identity (pid, hostname, OS) is captured at the resource level by
 *   the resource detectors, so it is omitted here to avoid duplication.
 * - Trace correlation (`trace_id`, `span_id`) is passed via the OTel `context`
 *   on the log record, which maps to the top-level OTLP fields; it is omitted
 *   here for the same reason.
 * - When using the JSON layout, `meta` is already part of the structured body,
 *   so `log.meta` is omitted from attributes to avoid duplication.
 */
const toAttributes = (
  record: LogRecord,
  includeLogMeta: boolean,
  fieldRenames?: Record<string, string | string[]>
): Attributes => {
  const attrs: Attributes = {
    'log.logger': record.context,
  };

  if (record.transactionId) {
    // APM transaction ID - no standard OTel field exists for this.
    attrs['transaction.id'] = record.transactionId;
  }

  if (record.error) {
    // OTel semantic conventions for exceptions - backends use these for error detection.
    attrs['exception.type'] = record.error.name;
    attrs['exception.message'] = record.error.message;
    if (record.error.stack) {
      attrs['exception.stacktrace'] = record.error.stack;
    }
  }

  if (
    includeLogMeta &&
    record.meta &&
    typeof record.meta === 'object' &&
    !Array.isArray(record.meta)
  ) {
    // Extract the service object because we know that it always exists. Mapping it directly avoids calling the more expensive getFlattenedObject function for every log entry.
    const {
      service: { version, type, state, node: { roles } = {}, id, ...serviceRest } = {},
      ...metaRest
    } = record.meta;
    if (version !== undefined) attrs['service.version'] = version;
    if (type !== undefined) attrs['service.type'] = type;
    if (state !== undefined) attrs['service.state'] = state;
    if (roles !== undefined) attrs['service.node.roles'] = roles;
    if (id !== undefined) attrs['service.id'] = id;
    // Flatten anything that we don't know about into the service object (ideally, nothing).
    Object.entries(getFlattenedObject(serviceRest)).forEach(([key, value]) => {
      attrs[`service.${key}`] = value;
    });

    // Flatten non-service meta into individual OTel attributes so they are
    // discoverable as flat fields in backends.
    // Only included for pattern layout: with JSON layout the meta is part of
    // the structured body and repeating it here would be redundant.
    Object.entries(getFlattenedObject(metaRest)).forEach(([key, value]) => {
      attrs[key] = value as AttributeValue;
    });
  }

  if (fieldRenames) {
    for (const [oldKey, newKeys] of Object.entries(fieldRenames)) {
      if (oldKey in attrs) {
        const value = attrs[oldKey];
        delete attrs[oldKey];
        const targets = Array.isArray(newKeys) ? newKeys : [newKeys];
        for (const newKey of targets) {
          attrs[newKey] = value;
        }
      }
    }
  }

  return attrs;
};

/**
 * A Kibana log appender that ships log records to an OTLP-compatible endpoint
 * using the OpenTelemetry Logs SDK.  Records are buffered by the SDK's
 * {@link BatchLogRecordProcessor} and flushed periodically or on shutdown.
 * @internal
 */
export class OtelAppender implements DisposableAppender {
  public static configSchema = schema.object({
    type: schema.literal('otel'),
    protocol: schema.oneOf(
      [schema.literal('http'), schema.literal('proto'), schema.literal('grpc')],
      { defaultValue: 'proto' }
    ),
    url: schema.string(),
    headers: schema.recordOf(schema.string(), schema.string(), { defaultValue: {} }),
    /**
     * Optional layout config. Defaults to pattern layout (body.text, aliased to `message`).
     * Use `{ type: 'json' }` for a structured body (body.structured); note that the ECS
     * `message` field will be empty in that case because it aliases body.text.
     */
    layout: schema.maybe(Layouts.configSchema),
    // Optional: user-provided attributes override the service attributes derived from APM config.
    attributes: schema.maybe(schema.recordOf(schema.string(), schema.string())),
    fieldRenames: schema.maybe(
      schema.recordOf(
        schema.string(),
        schema.oneOf([schema.string(), schema.arrayOf(schema.string(), { minSize: 1 })])
      )
    ),
    ssl: schema.maybe(
      schema.object(
        {
          certificateAuthorities: schema.maybe(
            schema.oneOf([
              schema.string(),
              schema.arrayOf(schema.string(), { minSize: 1, maxSize: 100 }),
            ])
          ),
          certificate: schema.maybe(schema.string()),
          key: schema.maybe(schema.string()),
          keyPassphrase: schema.maybe(schema.string()),
          verificationMode: schema.oneOf(
            [schema.literal('none'), schema.literal('certificate'), schema.literal('full')],
            { defaultValue: 'full' }
          ),
          allowPartialTrustChain: schema.boolean({ defaultValue: true }),
        },
        {
          validate: (raw) => {
            if (raw.certificate && !raw.key) {
              return 'Must specify [ssl.key] when [ssl.certificate] is set';
            }
            if (raw.key && !raw.certificate) {
              return 'Must specify [ssl.certificate] when [ssl.key] is set';
            }
            if (raw.keyPassphrase && !raw.key) {
              return 'Must specify [ssl.key] when [ssl.keyPassphrase] is set';
            }
          },
        }
      )
    ),
  });

  private readonly loggerProvider: LoggerProvider;
  private readonly logger: Logger;
  private readonly layout: Layout;
  /** True when using JSON layout: the full LogRecord is sent as `body.structured`. */
  private readonly useStructuredBody: boolean;
  private readonly fieldRenames?: Record<string, string | string[]>;

  constructor(config: OtelAppenderConfig) {
    const exporter = createExporter(config);
    // Layer the resource from three sources (each overriding the previous):
    //   1. Auto-detected: host, OS, process, env-var OTel attributes
    //   2. Derived: service.name / service.version / deployment.environment from the
    //      APM config singleton (mirrors how initTelemetry builds trace resources)
    //   3. User overrides: explicit attributes from kibana.yml (optional)
    const resource = buildOtelResources().merge(
      resources.resourceFromAttributes(config.attributes ?? {})
    );
    this.loggerProvider = new LoggerProvider({
      processors: [new BatchLogRecordProcessor(exporter)],
      resource,
    });
    // The scope name 'kibana' identifies this instrumentation library.
    // Individual logger contexts are passed as the 'log.logger' attribute.
    this.logger = this.loggerProvider.getLogger('kibana');

    const layoutConfig = resolveLayoutConfig(config.layout);
    this.layout = Layouts.create(layoutConfig);
    // JSON layout → sanitised LogRecord as AnyValueMap → indexed as body.structured.
    // Pattern layout → formatted string → indexed as body.text (aliased to `message`).
    this.useStructuredBody = layoutConfig.type !== 'pattern';
    this.fieldRenames = config.fieldRenames;
  }

  public append(record: LogRecord): void {
    const severityNumber = toSeverityNumber(record.level);

    this.logger.emit({
      timestamp: record.timestamp,
      severityNumber,
      severityText: record.level.id.toUpperCase(),
      // JSON layout: send a ECS record as a structured object.
      // Elastic's OTel ingest indexes this as body.structured.
      //
      // Pattern layout (default): format the record to a human-readable string.
      // Elastic indexes this as body.text, aliased to the ECS `message` field.
      body:
        this.layout instanceof JsonLayout
          ? omitDeepNilValues(JsonLayout.ecsRecord(record))
          : this.layout.format(record),
      context: toTraceContext(record),
      // log.meta is omitted from attributes when using JSON layout because it
      // is already part of the structured body.
      attributes: toAttributes(record, !this.useStructuredBody, this.fieldRenames),
    });
  }

  public async dispose(): Promise<void> {
    // Wrap shutdown in a timeout to prevent indefinite hangs when the remote
    // endpoint is unreachable or slow (the spike confirmed this is a real risk).
    // Attach .catch() so that a late rejection from shutdown() after the timeout
    // fires does not produce an unhandled promise rejection.
    const shutdownPromise = this.loggerProvider.shutdown().catch(() => {});
    await Promise.race([
      shutdownPromise,
      new Promise<void>((resolve) => setTimeout(resolve, DISPOSE_TIMEOUT_MS)),
    ]);
  }
}

const omitDeepNilValues = (obj: Ecs) => {
  const result: AnyValueMap = {};
  Object.entries(getFlattenedObject(obj))
    .filter(([_, value]) => !isNil(value))
    .forEach(([key, value]) => set(result, key, value));
  return result;
};

const createExporter = (
  config: OtelAppenderConfig
): OTLPLogExporterHTTP | OTLPLogExporterGRPC | OTLPLogExporterPROTO => {
  const tls = resolveTlsMaterial(config.ssl);

  switch (config.protocol) {
    case 'http': {
      // No need to import the module at the top if not used in the switch statement.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
      return new OTLPLogExporter({
        url: config.url,
        headers: config.headers ?? {},
        ...(tls ? { httpAgentOptions: buildHttpsAgentTlsOptions(tls) } : {}),
      });
    }
    case 'proto': {
      // No need to import the module at the top if not used in the switch statement.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-proto');
      return new OTLPLogExporter({
        url: config.url,
        headers: config.headers ?? {},
        ...(tls ? { httpAgentOptions: buildHttpsAgentTlsOptions(tls) } : {}),
      });
    }
    case 'grpc': {
      // No need to import the module at the top if not used in the switch statement.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Metadata, credentials } = require('@grpc/grpc-js');
      const metadata = new Metadata();
      Object.entries(config.headers ?? {}).forEach(([key, value]) => {
        metadata.add(key, value);
      });
      // No need to import the module at the top if not used in the switch statement.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-grpc');
      return new OTLPLogExporter({
        url: config.url,
        metadata,
        ...(tls
          ? {
              // Using createFromSecureContext instead of createSsl because createSsl does not support allowPartialTrustChain.
              credentials: credentials.createFromSecureContext(
                createSecureContext({
                  ca: toGrpcRootCerts(tls),
                  key: tls.key,
                  cert: tls.cert,
                  allowPartialTrustChain: tls.allowPartialTrustChain,
                }),
                buildGrpcVerifyOptions(tls)
              ),
            }
          : {}),
      });
    }
  }
};
