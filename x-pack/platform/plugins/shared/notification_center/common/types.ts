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
  notificationQueryParamsSchema,
  ctaSchema,
} from './notification_schema';
import type {
  NotificationTypeRef,
  NotificationNamespace,
  NotificationTypeName,
  NotificationKindOf,
} from './notification_registry_utils';
import type { StateNotificationIdParts, TimeseriesNotificationIdParts } from './notification_id';

/** A stored notification (read contract); the shape the app programs against. */
export type Notification = z.infer<typeof notificationReadSchema>;

/**
 * Producer submit input.
 * `namespace` and `type` are replaced by the typed pair from NotificationTypeRef,
 * so a type from the wrong namespace does not pass typecheck.
 */
export type NotificationInput = Omit<
  z.input<typeof notificationWriteSchema>,
  'namespace' | 'type'
> &
  NotificationTypeRef;

/**
 * A fully-assembled draft handed to the submit path before validation
 */
export type NotificationDraft = z.input<typeof notificationWriteSchema>;

/** Custom fields a producer supplies for every notification to give it context. */
export interface NotificationContent {
  title: string;
  description: string;
  /** Defaults to `info`; reference the exported `SEVERITY` members. */
  severity?: Severity;
  cta?: Cta;
}

/** Producer id parts for a `state` type: the current state of an entity. */
export type StateSubmitIdParts = Omit<StateNotificationIdParts, 'namespace' | 'type'>;

/** Producer id parts for a `timeseries` type: a distinct occurrence. */
export type TimeseriesSubmitIdParts = Omit<TimeseriesNotificationIdParts, 'namespace' | 'type'>;

/**
 * Producer payload for `forType(ref).submit(...)`
 */
export type NotificationSubmitInput<
  N extends NotificationNamespace,
  T extends NotificationTypeName<N>
> = NotificationContent &
  (NotificationKindOf<N, T> extends 'timeseries' ? TimeseriesSubmitIdParts : StateSubmitIdParts);

/**
 * The exact document shape in the NC index: validated write payload (`severity` resolved) plus
 * the `@timestamp` generated during write by the NC plugin.
 */
export type NotificationDocument = z.output<typeof notificationWriteSchema> & {
  '@timestamp': string;
};

export type Severity = Notification['severity'];

export type Cta = z.infer<typeof ctaSchema>;

/** Params sent to internal query function, validated by the same schema as the HTTP GET route. */
export type NotificationQueryParams = z.input<typeof notificationQueryParamsSchema>;

/** Parsed params for the internal query function (after applying some normalization) */
export type NotificationQueryParamsParsed = z.output<typeof notificationQueryParamsSchema>;

/**
 * A notification as the list route returns it. `isRead` is omitted for callers without a
 * user profile (API keys, headless consumers), which have no read state to resolve.
 */
export type NotificationListItem = Notification & { isRead?: boolean };

/** The full collapsed, filtered notification set the client paginates over. */
export interface NotificationQueryResult {
  items: NotificationListItem[];
  /** Ensure the client knows if the query hit the result limit and older matches are omitted. */
  truncated: boolean;
}

/** Whether the caller's profile-scoped notification state has anything unread. */
export interface NotificationUnreadStatus {
  hasUnread: boolean;
}
