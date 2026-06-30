/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ByteSizeValue, offeringBasedSchema, schema } from '@kbn/config-schema';
import ipaddr from 'ipaddr.js';
import { sum } from 'lodash';
import moment from 'moment';

const KibanaServerSchema = schema.object({
  hostname: schema.maybe(
    schema.string({
      hostname: true,
      validate(value) {
        if (ipaddr.isValid(value) && !sum(ipaddr.parse(value).toByteArray())) {
          // prevent setting a hostname that fails in Chromium on Windows
          return `cannot use '0.0.0.0' as Kibana host name, consider using the default (localhost) instead`;
        }
      },
    })
  ),
  port: schema.maybe(schema.number()),
  protocol: schema.maybe(
    schema.string({
      validate(value) {
        if (!/^https?$/.test(value)) {
          return 'must be "http" or "https"';
        }
      },
    })
  ),
}); // default values are all dynamic in createConfig$

const QueueSchema = schema.object({
  indexInterval: schema.string({ defaultValue: 'week' }),
  pollEnabled: schema.boolean({ defaultValue: true }),
  pollInterval: schema.oneOf([schema.number(), schema.duration()], {
    defaultValue: moment.duration({ seconds: 3 }),
  }),
  pollIntervalErrorMultiplier: schema.number({ defaultValue: 10 }),
  timeout: schema.oneOf([schema.number(), schema.duration()], {
    defaultValue: moment.duration({ minutes: 4 }),
  }),
});

const CaptureSchema = schema.object({
  maxAttempts: schema.conditional(
    schema.contextRef('dist'),
    true,
    schema.number({ defaultValue: 3 }),
    schema.number({ defaultValue: 1 })
  ),
});

const CsvSchema = schema.object({
  checkForFormulas: schema.boolean({ defaultValue: true }),
  escapeFormulaValues: schema.boolean({ defaultValue: false }),
  enablePanelActionDownload: schema.maybe(schema.boolean({ defaultValue: false })), // unused as of 9.0
  maxSizeBytes: schema.oneOf([schema.number(), schema.byteSize()], {
    defaultValue: ByteSizeValue.parse('250mb'),
  }),
  useByteOrderMarkEncoding: schema.boolean({ defaultValue: false }),
  scroll: schema.object({
    strategy: schema.oneOf(
      [
        // point-in-time API or scroll API is supported
        schema.literal('pit'),
        schema.literal('scroll'),
      ],
      { defaultValue: 'pit' }
    ),
    duration: schema.string({
      defaultValue: '120s', // values other than "auto" are passed directly to ES, so string only format is preferred
      validate(value) {
        if (!/(^[0-9]+(d|h|m|s|ms|micros|nanos)|auto)$/.test(value)) {
          return 'must be either "auto" or a duration string';
        }
      },
    }),
    size: schema.number({ defaultValue: 500 }),
  }),
  maxConcurrentShardRequests: schema.number({ defaultValue: 5 }),
  maxRows: schema.number({ min: 1, defaultValue: 10000 }),
});

const EncryptionKeySchema = schema.conditional(
  schema.contextRef('dist'),
  true,
  schema.maybe(schema.string()), // default value is dynamic in createConfig$
  schema.string({ defaultValue: 'a'.repeat(32) })
);

const RolesSchema = schema.maybe(
  schema.object({
    enabled: schema.boolean(),
    allow: schema.arrayOf(schema.string()),
  })
); // unused as of 9.0

// Browser side polling: job completion notifier, management table auto-refresh
// NOTE: can not use schema.duration, a bug prevents it being passed to the browser correctly
const PollSchema = schema.object({
  jobCompletionNotifier: schema.object({
    interval: schema.number({ defaultValue: 10000 }),
    intervalErrorMultiplier: schema.number({ defaultValue: 5 }), // deprecated as unused since 7.10
  }),
  jobsRefresh: schema.object({
    interval: schema.number({ defaultValue: 5000 }),
    intervalErrorMultiplier: schema.number({ defaultValue: 5 }), // deprecated as unused since 7.10
  }),
});

const ExportTypeSchema = schema.object({
  // Csv reports are enabled in all offerings
  csv: schema.object({
    enabled: schema.boolean({ defaultValue: true }),
  }),
  // Png reports are disabled in serverless
  png: schema.object({
    enabled: offeringBasedSchema({
      serverless: schema.boolean({ defaultValue: false }),
      traditional: schema.boolean({ defaultValue: true }),
    }),
  }),
  // Pdf reports are disabled in serverless
  pdf: schema.object({
    enabled: offeringBasedSchema({
      serverless: schema.boolean({ defaultValue: false }),
      traditional: schema.boolean({ defaultValue: true }),
    }),
  }),
});

const SettingsSchema = schema.object({
  enabled: offeringBasedSchema({
    serverless: schema.boolean({ defaultValue: false }),
    traditional: schema.boolean({ defaultValue: true }),
  }),
});

/**
 * When enabled, screenshot-backed exports (PDFv2 / PNGv2) run inside a standalone HTTP executor.
 * Kibana forwards decrypted authentication headers over TLS to that service — restrict network path accordingly.
 */
const RemoteExecutionSchema = schema.object({
  enabled: schema.boolean({ defaultValue: false }),
  url: schema.maybe(
    schema.string({
      validate(value) {
        try {
          const parsed = new URL(value);
          if (!/^https?:$/.test(parsed.protocol)) {
            return 'must use http or https';
          }
        } catch {
          return 'must be a valid absolute URL';
        }
      },
    })
  ),
  apiKey: schema.maybe(schema.string()),
});

export const ConfigSchema = schema.object({
  enabled: schema.boolean({ defaultValue: true }),
  kibanaServer: KibanaServerSchema,
  queue: QueueSchema,
  capture: CaptureSchema,
  csv: CsvSchema,
  encryptionKey: EncryptionKeySchema,
  roles: RolesSchema,
  poll: PollSchema,
  export_types: ExportTypeSchema,
  remoteExecution: RemoteExecutionSchema,
  statefulSettings: SettingsSchema,
});
