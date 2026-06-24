/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { isInternalURL } from '@kbn/std';

/**
 * Severity of a notification, lowest to highest. Drives the per-document
 * retention TTL applied by the Notification Center cleanup task.
 */
export const SEVERITIES = ['info', 'warning', 'error', 'critical'] as const;

/**
 * Call-to-action for a notification: a link the user can follow, with the text
 * to render for that link.
 */
export const ctaSchema = z
  .object({
    /**
     * Internal Kibana destination the call-to-action navigates to. Must be a
     * root-relative path beginning with a single `/`. External, protocol-relative
     * (`//host`), and backslash-prefixed (`/\host`) URLs are rejected via
     * `isInternalURL` — they resolve off-origin in the browser and would be an
     * open-redirect surface.
     */
    link: z
      .string()
      .min(1)
      .max(200)
      .refine((value) => value.startsWith('/') && isInternalURL(value), {
        message: 'link must be an internal path starting with a single "/"',
      }),
    /** Human-readable label rendered for the link. */
    linkText: z.string().min(1).max(200),
  })
  .strict();

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
    /**
     * Severity of the notification. Optional on submit; defaults to `info`.
     * Drives severity-based retention.
     */
    severity: z.enum(SEVERITIES).default('info'),
    /** Optional call-to-action link rendered with the notification. */
    cta: ctaSchema.optional(),
  })
  .strict();
