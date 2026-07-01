/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataStreamsSetup } from '@kbn/core-data-streams-server';
import { mappings, type MappingsDefinition } from '@kbn/es-mappings';

/**
 * Name of the append-only data stream that backs the Notification Center.
 * Documents are immutable and collapsed by `notification_id` at query time;
 * per-user read state lives separately in `core.userStorage`.
 */
export const NOTIFICATION_DATA_STREAM_NAME = '.kibana-notification-center' as const;

/**
 * Data retention ceiling across all severity tiers. This is the lifecycle
 * backstop; finer per-severity TTLs (info 30d / warning 60d / error+critical
 * 180d) are enforced by the Notification Center cleanup task, since lifecycle
 * retention cannot express per-document severity.
 */
export const NOTIFICATION_DATA_RETENTION = '180d' as const;

/**
 * Mappings for the notification data stream.
 *
 * Only fields queried against in ES are mapped. Display-only fields (`title`,
 * `description`, `cta`) are stored in `_source` but left unmapped.
 *
 * `dynamic: false` — unknown fields written by a newer Kibana node during a
 * rolling upgrade are persisted in `_source` and read back (matching the
 * lenient read schema), rather than rejected as they would be under `strict`.
 * Bump `version` when a new field needs to become queryable.
 */
export const notificationDataStreamMappings = {
  dynamic: false,
  properties: {
    /** Ingest time into the data stream; drives ordering and retention. */
    '@timestamp': mappings.date(),
    /** Deterministic idempotency key; collapse field at query time. */
    notification_id: mappings.keyword(),
    /** Timestamp of the underlying notification event. */
    event_timestamp: mappings.date(),
    /** Registered notification type, e.g. `inferenceModelStatus`. */
    type: mappings.keyword(),
    /** App id of the producing application, e.g. `inference`. */
    source_app_id: mappings.keyword(),
    /** Severity tier; drives severity-based retention. */
    severity: mappings.keyword(),
  },
} satisfies MappingsDefinition;

/**
 * Registers the notification data stream with core. This eagerly creates and
 * updates the index template and mappings; the data stream itself is created
 * lazily on first write.
 */
export const registerNotificationDataStream = (dataStreams: DataStreamsSetup) => {
  return dataStreams.registerDataStream({
    name: NOTIFICATION_DATA_STREAM_NAME,
    version: 1,
    hidden: true,
    template: {
      priority: 500,
      lifecycle: {
        data_retention: NOTIFICATION_DATA_RETENTION,
      },
      mappings: notificationDataStreamMappings,
    },
  });
};
