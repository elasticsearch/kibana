/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { LayoutConfigType } from '../layout';

/**
 * TLS / mTLS options for the OTLP log appender.
 *
 * Values may be **filesystem paths** to PEM files (recommended for production) or **inline PEM strings**
 * (strings containing `-----BEGIN`).
 *
 * Maps to Node.js TLS options for `http` / `proto` (via `https.Agent`) and to `grpc.credentials.createSsl`
 * for `grpc`.
 *
 * @public
 */
export interface OtelAppenderTlsConfig {
  /**
   * PEM-encoded certificate authority bundle(s) used to verify the OTLP endpoint.
   * Use a single string, or an array when multiple CA files are required.
   */
  certificateAuthorities?: string | string[];
  /** Client certificate for mutual TLS (requires {@link OtelAppenderTlsConfig.key}). */
  certificate?: string;
  /** Private key for the client certificate (requires {@link OtelAppenderTlsConfig.certificate}). */
  key?: string;
  /** Passphrase for {@link OtelAppenderTlsConfig.key} when the key is encrypted. */
  keyPassphrase?: string;
  /**
   * How strictly to verify the server certificate (aligned with Elasticsearch client semantics).
   * Defaults to `full`.
   */
  verificationMode: 'none' | 'certificate' | 'full';
  /**
   * Whether to allow partial trust chain verification.
   * Defaults to `true`.
   */
  allowPartialTrustChain?: boolean;
}

/**
 * Configuration of an OpenTelemetry (OTLP) log appender.
 * Ships log records to an OTLP-compatible endpoint over HTTP.
 *
 * @example
 * ```yaml
 * logging:
 *   appenders:
 *     otel:
 *       type: otel
 *       url: https://collector:4318/v1/logs
 *       headers:
 *         Authorization: "ApiKey <base64>"
 *       # layout defaults to pattern - body.text is aliased to the ECS `message` field
 * ```
 * @public
 */
export interface OtelAppenderConfig {
  /** Discriminator for this appender type. */
  type: 'otel';
  /**
   * The protocol to use for the OTLP exporter.
   * Defaults to `proto`.
   */
  protocol: 'http' | 'proto' | 'grpc';
  /** OTLP HTTP endpoint URL, e.g. https://collector:4318/v1/logs */
  url: string;
  /**
   * Optional HTTP headers sent with every request, e.g. for authentication.
   * Defaults to an empty object.
   */
  headers?: Record<string, string>;
  /**
   * Controls how the log record body is serialised.
   *
   * - `pattern` (**default**): the message is formatted to a human-readable string
   *   and indexed as `body.text` in Elastic. Elastic's ingest aliases `body.text`
   *   to the ECS `message` field, so records are visible in Logs Explorer.
   *   When no explicit `pattern` string is provided, the appender uses
   *   `%message %error` - level, timestamp, and logger name are omitted because
   *   they are already captured as dedicated top-level OTLP fields.
   *   Meta fields are included as a `log.meta` attribute.
   *
   * - `json`: the full `LogRecord` is sent as a structured object and indexed as
   *   `body.structured`. **Note**: the ECS `message` field will be empty in Logs
   *   Explorer because it aliases `body.text`, which JSON layout does not populate.
   *   Use this only when the consuming backend natively handles `body.structured`.
   *   Meta fields are part of the body (not repeated in attributes).
   */
  layout?: LayoutConfigType;
  /**
   * Additional resource attributes merged on top of the auto-detected host,
   * process, OS and service attributes. Can be used to override defaults such
   * as `service.name`. Because Kibana expands dotted YAML keys into nested
   * objects, wrap dotted attribute names in `[brackets]`:
   * `"[service.name]": my-kibana`
   */
  attributes?: Record<string, string>;
  /**
   * Optional TLS settings for HTTPS/gRPC to the OTLP endpoint, including mutual TLS (client certificates).
   */
  ssl?: OtelAppenderTlsConfig;
  /**
   * Optional map of source attribute paths to target attribute path(s) applied after meta fields are
   * flattened into OTel attributes. Use this to rename or fan-out fields without changing the
   * upstream `AuditEvent` / `LogRecord` shape.
   *
   * - Single target: `{ 'kibana.space_id': 'kibana.space.id' }` — rename in place.
   * - Multiple targets: `{ 'client.ip': ['source.address', 'source.ip'] }` — copy value to all
   *   listed keys and remove the original.
   *
   * Keys absent from the log record are silently skipped. Applied only when using pattern layout
   * (meta fields are part of the structured body for JSON layout and are not repeated in attributes).
   */
  fieldRenames?: Record<string, string | string[]>;
}
