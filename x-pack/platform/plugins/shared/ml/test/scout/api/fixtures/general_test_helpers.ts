/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ELASTIC_HTTP_VERSION_HEADER } from '@kbn/core-http-common';

const SAVED_OBJECTS_API_HEADERS = { [ELASTIC_HTTP_VERSION_HEADER]: '2023-10-31' } as const;

export interface KbnRequestable {
  request<T = unknown>(options: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<{ data: T }>;
}

export async function deleteSavedObject(
  kbnClient: KbnRequestable,
  type: string,
  id: string
): Promise<void> {
  await kbnClient
    .request({
      method: 'DELETE',
      path: `/api/saved_objects/${type}/${id}`,
      headers: SAVED_OBJECTS_API_HEADERS,
    })
    .catch(() => {});
}

export async function assertSavedObjectExists(
  kbnClient: KbnRequestable,
  type: string,
  id: string
): Promise<void> {
  await kbnClient.request({
    method: 'GET',
    path: `/api/saved_objects/${type}/${id}`,
    headers: SAVED_OBJECTS_API_HEADERS,
  });
}
