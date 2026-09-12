/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Every NC route is `access: 'internal'` and pinned to a single API version. */
export const INTERNAL_HEADERS = {
  'kbn-xsrf': 'scout',
  'x-elastic-internal-origin': 'kibana',
  'elastic-api-version': '1',
} as const;

// Route paths and the data stream name are hardcoded to keep the test tsconfig free of a
// dependency on the plugin package. Keep these in sync with the plugin's `common/routes.ts`
// and `server/storage/notification_data_stream.ts`.
export const GET_NOTIFICATIONS_PATH = 'internal/notification_center/notifications';
export const GET_UNREAD_STATUS_PATH = 'internal/notification_center/notifications/_unread_status';
export const MARK_READ_PATH = 'internal/notification_center/notifications/_mark_read';
export const MARK_ALL_READ_PATH = 'internal/notification_center/notifications/_mark_all_read';

export const NOTIFICATION_DATA_STREAM_NAME = '.kibana-notification-center';
