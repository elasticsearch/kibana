/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { buildPath, isHttpFetchError } from '@kbn/core-http-browser';
import type { HttpStart } from '@kbn/core/public';
import { SavedObjectNotFound } from '@kbn/kibana-utils-plugin/public';
import { SavedSearchType, type DiscoverSession } from '@kbn/saved-search-plugin/common';
import {
  DISCOVER_SESSION_API_BASE_PATH,
  DISCOVER_SESSION_API_VERSION,
} from '../../common/constants';
import type {
  DiscoverSessionApiDataInput,
  DiscoverSessionApiResponse,
  DiscoverSessionGetResponse,
} from '../../server';
import type { deserializeEsqlControls } from '../../common/session/control_panels';

export interface DiscoverSessionClient {
  create: (data: DiscoverSessionRequestData) => Promise<DiscoverSessionApiResponse>;
  get: (id: string) => Promise<DiscoverSessionGetResult>;
  upsert: (id: string, data: DiscoverSessionRequestData) => Promise<DiscoverSessionApiResponse>;
}

export type DiscoverSessionRequestData = Omit<DiscoverSessionApiDataInput, 'tabs'> & {
  tabs: DiscoverSessionRequestTab[];
};

export type DiscoverSessionRequestTab<Tab = DiscoverSessionApiDataInput['tabs'][number]> = {
  [Key in keyof Tab]: Key extends 'control_panels'
    ? ReturnType<typeof deserializeEsqlControls>
    : Tab[Key];
};

export type DiscoverSessionResolve = Pick<
  NonNullable<DiscoverSession['sharingSavedObjectProps']>,
  'outcome' | 'aliasTargetId' | 'aliasPurpose'
>;

export type DiscoverSessionGetResult = DiscoverSessionGetResponse & {
  resolve: DiscoverSessionResolve;
};

/** Creates the browser client used by Discover's core session flows. */
export const createDiscoverSessionClient = (http: HttpStart): DiscoverSessionClient => ({
  create: (data) =>
    requestWithReadableError(() =>
      http.post<DiscoverSessionApiResponse>(DISCOVER_SESSION_API_BASE_PATH, {
        version: DISCOVER_SESSION_API_VERSION,
        body: JSON.stringify(data),
      })
    ),

  get: (id) =>
    requestWithReadableError(
      async () => {
        const { body, response } = await http.get<DiscoverSessionGetResponse>(
          buildDiscoverSessionPath(id),
          {
            version: DISCOVER_SESSION_API_VERSION,
            asResponse: true,
          }
        );

        return {
          ...body,
          resolve: {
            outcome: response?.headers.get('kbn-resolve-outcome') ?? undefined,
            aliasTargetId: response?.headers.get('kbn-resolve-alias-target-id') ?? undefined,
            aliasPurpose: response?.headers.get('kbn-resolve-purpose') ?? undefined,
          },
        } as DiscoverSessionGetResult;
      },
      () => new SavedObjectNotFound({ type: SavedSearchType, id })
    ),

  upsert: (id, data) =>
    requestWithReadableError(() =>
      http.put<DiscoverSessionApiResponse>(buildDiscoverSessionPath(id), {
        version: DISCOVER_SESSION_API_VERSION,
        body: JSON.stringify(data),
      })
    ),
  // TODO: Add DELETE when connecting Discover's session deletion flow to the HTTP API.
});

/** Builds the path for one Discover session. */
const buildDiscoverSessionPath = (id: string) =>
  buildPath(`${DISCOVER_SESSION_API_BASE_PATH}/{id}`, { id });

/** Preserves server error details while allowing callers to handle missing sessions separately. */
const requestWithReadableError = async <T>(
  request: () => Promise<T>,
  getNotFoundError?: () => Error
) => {
  try {
    return await request();
  } catch (error) {
    if (getNotFoundError && isHttpFetchError(error) && error.response?.status === 404) {
      throw getNotFoundError();
    }

    const message = getResponseErrorMessage(error);
    if (message) {
      throw new Error(message, { cause: error });
    }

    throw error;
  }
};

/** Returns the human-readable message included in an HTTP error response. */
const getResponseErrorMessage = (error: unknown) => {
  if (!isHttpFetchError(error) || !error.body || typeof error.body !== 'object') {
    return undefined;
  }

  const { message } = error.body as { message?: unknown };
  return typeof message === 'string' ? message : undefined;
};
