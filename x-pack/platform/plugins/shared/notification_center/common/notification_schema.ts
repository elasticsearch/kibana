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
 * The canonical notification document stored in the `.kibana-notification-center`
 * data stream. Documents are append-only and immutable; per-user state (read,
 * subscriptions, horizons) lives separately in `core.userStorage`.
 *
 * This is the **write** contract: the shape a producer must provide to submit a
 * notification. It is `strict()` so that an unexpected field or typo
 * is rejected at submit time rather than silently persisted.
 *
 * Note there is no `@timestamp` here: that is the data stream ingest time,
 * stamped by the Notification Center at write time, never supplied by a
 * producer. Producers express event time via `event_timestamp`.
 */
export const notificationWriteSchema = z
  .object({
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

/**
 * The **read** contract: validates documents read back from the
 * `.kibana-notification-center` data stream.
 *
 * It is the write contract plus `@timestamp` (the data stream ingest time the
 * Notification Center stamps on write), and is deliberately more permissive
 * than the write schema because a single data stream is read and written by
 * many Kibana nodes that may run different versions during an upgrade:
 *
 * - `loose()` (vs. the write schema's `strict()`) — a document written by a
 *   *newer* node may carry a field this node does not yet know about.
 * - `severity` falls back to `info` via `.catch('info')` — an *older* node
 *   reading a document whose severity is a tier added in a *newer* version
 *   (unknown to this node's enum) keeps a usable value rather than failing the
 *   whole document.
 *
 * When a future field is added it should be `.optional()` on the write side so
 * that documents predating it continue to validate here.
 */
export const notificationReadSchema = notificationWriteSchema
  .extend({
    /** Ingest time into the data stream, ISO 8601. Determines ordering and retention. */
    '@timestamp': z.iso.datetime(),
    severity: z.enum(SEVERITIES).default('info').catch('info'),
  })
  .loose();
