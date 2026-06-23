/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Separator between the segments of a `notification_id`.
 */
export const NOTIFICATION_ID_SEPARATOR = ':';

/**
 * Inputs for a static-state notification id: `<producer>:<entity>:<state>`.
 *
 * Use when a notification represents the *current state* of an entity. Re-push
 * with the same `(producer, entity, state)` is a no-op via query-time collapse;
 * a new `state` produces a new id (the previous state's notification ages out
 * under its retention TTL).
 */
export interface StaticStateNotificationIdParts {
  /** Producing application/plugin, e.g. `inference`. */
  producer: string;
  /** Stable id of the entity the notification is about, e.g. an inference endpoint id. */
  entity: string;
  /** Current state of the entity, e.g. `deprecated`. */
  state: string;
}

/**
 * Inputs for a per-event notification id: `<producer>:<event>:<epochMs>`.
 *
 * Use when each occurrence is distinct and should not collapse. The `epochMs`
 * segment makes every push unique and avoids colon collisions with ISO 8601.
 */
export interface EventNotificationIdParts {
  /** Producing application/plugin, e.g. `autoOps`. */
  producer: string;
  /** Event name, e.g. `memoryLimit`. */
  event: string;
  /** Unix timestamp in milliseconds that makes this occurrence unique. */
  epochMs: number;
}

/**
 * Build a static-state notification id (`<producer>:<entity>:<state>`).
 */
export const buildStaticStateNotificationId: (parts: StaticStateNotificationIdParts) => string = ({
  producer,
  entity,
  state,
}) => joinNotificationIdSegments([producer, entity, state]);

/**
 * Build a per-event notification id (`<producer>:<event>:<epochMs>`).
 */
export const buildEventNotificationId: (parts: EventNotificationIdParts) => string = ({
  producer,
  event,
  epochMs,
}) => {
  if (!Number.isFinite(epochMs)) {
    throw new Error('notification_id epochMs must be a finite number');
  }
  return joinNotificationIdSegments([producer, event, String(epochMs)]);
};

const joinNotificationIdSegments = (segments: string[]): string => {
  segments.forEach((segment) => {
    if (segment.length === 0) {
      throw new Error('notification_id segments must be non-empty');
    }
    if (segment.includes(NOTIFICATION_ID_SEPARATOR)) {
      throw new Error(
        `notification_id segments must not contain the separator "${NOTIFICATION_ID_SEPARATOR}"`
      );
    }
  });
  return segments.join(NOTIFICATION_ID_SEPARATOR);
};
