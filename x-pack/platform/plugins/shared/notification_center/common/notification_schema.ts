/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';

/**
 * The canonical notification document, as stored in the `.kibana-notification-center`
 * data stream. Documents are append-only and immutable; per-user state (read,
 * subscriptions, horizons) lives separately in `core.userStorage`.
 */
export const notificationSchema = z
  .object({
    /** Ingest time, into the datastream, ISO 8601. Determines ordering and retention. */
    '@timestamp': z.iso.datetime(),
    /**
     * Deterministic idempotency key. See the ID conventions in `notification_id.ts`.
     */
    notification_id: z.string().min(1).max(512),
    /** Timestamp of the notification event, ISO 8601. */
    event_timestamp: z.iso.datetime(),
    /** Registered notification type, e.g. `inferenceModelStatus`. */
    type: z.string().min(1).max(64),
    /** Short, human-readable headline. */
    title: z.string().min(1).max(256),
    /** Longer human-readable description. */
    description: z.string().min(1).max(2000),
    /** App id of the producing application, e.g. `inference`. */
    source_app_id: z.string().min(1).max(64),
  })
  .strict();
