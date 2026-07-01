/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod';
import type {
  notificationWriteSchema,
  notificationReadSchema,
  ctaSchema,
} from './notification_schema';

/**
 * A notification document as read back from the `.kibana-notification-center`
 * data stream. Derived from {@link notificationReadSchema}, the source of truth
 * for the read contract. This is the shape the rest of the application programs
 * against.
 */
export type Notification = z.infer<typeof notificationReadSchema>;

/**
 * The input a producer must provide to submit a notification. Derived from the
 * input side of {@link notificationWriteSchema} — fields with defaults (e.g.
 * `severity`) and optional fields (e.g. `cta`) may be omitted.
 */
export type NotificationInput = z.input<typeof notificationWriteSchema>;

/**
 * A notification document exactly as the Notification Center writes it into the
 * `.kibana-notification-center` data stream: the validated write payload (so
 * `severity` is resolved, not optional) plus the `@timestamp` the plugin stamps
 * at ingest time.
 *
 * `submit()` constructs a value of this type and hands it to the ES client.
 * Elasticsearch does not synthesise `@timestamp` for a data stream, so the doc
 * must carry it. This provides type safety around the document before it is
 * indexed.
 */
export type NotificationDocument = z.output<typeof notificationWriteSchema> & {
  '@timestamp': string;
};

/**
 * Severity of a notification. Derived from {@link notificationReadSchema}.
 */
export type Severity = Notification['severity'];

/**
 * Call-to-action for a notification. Derived from {@link ctaSchema}.
 */
export type Cta = z.infer<typeof ctaSchema>;
