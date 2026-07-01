/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const PLUGIN_ID = 'notificationCenter' as const;
export const PLUGIN_NAME = 'Notification Center' as const;

export {
  NOTIFICATION_CENTER_UI_ENABLED_FLAG,
  NOTIFICATION_CENTER_UI_ENABLED_DEFAULT,
  NOTIFICATION_TYPE_FLAGS,
  NOTIFICATION_TYPE_ENABLED_DEFAULT,
} from './feature_flags';
export type { NotificationTypeId } from './feature_flags';

export {
  notificationWriteSchema,
  notificationReadSchema,
  ctaSchema,
  SEVERITIES,
} from './notification_schema';

export {
  NOTIFICATION_ID_SEPARATOR,
  buildStaticStateNotificationId,
  buildEventNotificationId,
} from './notification_id';
export type { StaticStateNotificationIdParts, EventNotificationIdParts } from './notification_id';

export type { Notification, NotificationInput, NotificationDocument, Severity, Cta } from './types';
