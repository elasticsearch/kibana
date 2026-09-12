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

export {
  notificationIdSchema,
  notificationWriteSchema,
  notificationReadSchema,
  ctaSchema,
  SEVERITY,
  SEVERITIES,
} from './notification_schema';

export {
  NOTIFICATION_CENTER_API_BASE,
  GET_NOTIFICATIONS_PATH,
  GET_UNREAD_STATUS_PATH,
  MARK_READ_PATH,
  MARK_ALL_READ_PATH,
  NOTIFICATION_CENTER_API_VERSION,
} from './routes';

export { NOTIFICATION_REGISTRY } from './notification_registry';
export {
  NOTIFICATION_NAMESPACES,
  NOTIFICATION_TYPES,
  isRegisteredNotificationRef,
} from './notification_registry_utils';
export type {
  NotificationNamespace,
  NotificationTypeName,
  NotificationTypeRef,
} from './notification_registry_utils';
export type {
  NotificationDisplayMetadata,
  NotificationNamespaceDefinition,
  NotificationTypeDefinition,
  NotificationKind,
} from './notification_registry_types';

export type {
  Notification,
  NotificationListItem,
  NotificationInput,
  NotificationDocument,
  NotificationContent,
  NotificationSubmitInput,
  NotificationQueryParams,
  NotificationQueryResult,
  NotificationUnreadStatus,
  StateSubmitIdParts,
  TimeseriesSubmitIdParts,
  Severity,
  Cta,
} from './types';
