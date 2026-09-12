/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ApiClientFixture } from '@kbn/scout';
import {
  INTERNAL_HEADERS,
  GET_NOTIFICATIONS_PATH,
  GET_UNREAD_STATUS_PATH,
  MARK_READ_PATH,
  MARK_ALL_READ_PATH,
  NOTIFICATION_DATA_STREAM_NAME,
} from './constants';

export type Severity = 'info' | 'warning' | 'error' | 'critical';

/** The stored-document shape the GET route reads back. */
export interface NotificationDoc {
  '@timestamp': string;
  notification_id: string;
  namespace: string;
  type: string;
  title: string;
  description: string;
  severity: Severity;
}

export const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

export const makeDoc = (id: string, overrides: Partial<NotificationDoc> = {}): NotificationDoc => ({
  '@timestamp': daysAgo(1),
  notification_id: id,
  namespace: 'inference',
  type: 'modelStatus',
  title: `Title for ${id}`,
  description: `Description for ${id}`,
  severity: 'info',
  ...overrides,
});

/**
 * Append notifications directly to the backing data stream and wait for them to become
 * searchable. Mirrors how the plugin writes (append-only `create`), so the GET route sees
 * them exactly as produced notifications.
 */
export const seedNotifications = async (esClient: Client, docs: NotificationDoc[]) => {
  await esClient.bulk({
    refresh: true,
    operations: docs.flatMap((doc) => [{ create: { _index: NOTIFICATION_DATA_STREAM_NAME } }, doc]),
  });
};

/** Remove every seeded doc for a namespace so suites don't leak state into each other. */
export const clearNotifications = async (esClient: Client, namespace: string) => {
  await esClient.deleteByQuery({
    index: NOTIFICATION_DATA_STREAM_NAME,
    refresh: true,
    query: { term: { namespace } },
    conflicts: 'proceed',
  });
};

export type QueryParams = Record<string, string | string[]>;

/** apiClient takes no query option, so encode params into the path (arrays become repeated keys). */
const withQuery = (path: string, params?: QueryParams): string => {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      search.append(key, v);
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
};

export const createHelpers = (authHeaderGetter: () => Record<string, string>) => {
  const headers = () => ({ ...INTERNAL_HEADERS, ...authHeaderGetter() });

  return {
    getNotifications: (apiClient: ApiClientFixture, params?: QueryParams) =>
      apiClient.get(withQuery(GET_NOTIFICATIONS_PATH, params), {
        headers: headers(),
        responseType: 'json',
      }),

    getUnreadStatus: (apiClient: ApiClientFixture) =>
      apiClient.get(GET_UNREAD_STATUS_PATH, {
        headers: headers(),
        responseType: 'json',
      }),

    markRead: (apiClient: ApiClientFixture, body: unknown) =>
      apiClient.post(MARK_READ_PATH, { headers: headers(), body, responseType: 'json' }),

    markAllRead: (apiClient: ApiClientFixture) =>
      apiClient.post(MARK_ALL_READ_PATH, { headers: headers(), responseType: 'json' }),
  };
};
