/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LRUCache } from 'lru-cache';
import { buildPath } from '@kbn/core-http-browser';
import { SavedObjectNotFound } from '@kbn/kibana-utils-plugin/public';
import type { DeleteResult } from '@kbn/content-management-plugin/common';
import type { SavedObjectAccessControl } from '@kbn/core-saved-objects-common';
import type { SavedObjectsResolveResponse } from '@kbn/core/server';
import { PAGINATION_DEFAULT_PER_PAGE } from '@kbn/as-code-shared-schemas';

import type { LegacyDashboardSearchResponseBody } from '../../server/api/search/types';
import type {
  DashboardSearchRequestParams,
  DashboardSearchResponseBody,
  DashboardState,
} from '../../server';
import {
  DASHBOARD_API_PATH,
  DASHBOARD_API_VERSION,
  DASHBOARD_APP_API_PATH,
  DASHBOARD_APP_API_VERSION,
  DASHBOARD_SAVED_OBJECT_TYPE,
} from '../../common/constants';
import type {
  DashboardCreateResponseBody,
  DashboardReadResponseBody,
  DashboardUpdateResponseBody,
} from '../../server';
import { coreServices } from '../services/kibana_services';

const CACHE_SIZE = 20; // only store a max of 20 dashboards
const CACHE_TTL = 1000 * 60 * 5; // time to live = 5 minutes

export type ReadBodyWithResolve = DashboardReadResponseBody & {
  resolve: {
    outcome: SavedObjectsResolveResponse['outcome'] | undefined;
    aliasTargetId: SavedObjectsResolveResponse['alias_target_id'];
    aliasPurpose: SavedObjectsResolveResponse['alias_purpose'];
  };
};

const cache = new LRUCache<string, ReadBodyWithResolve>({
  max: CACHE_SIZE,
  ttl: CACHE_TTL,
});

const buildDashboardPath = (id: string) => buildPath(`${DASHBOARD_API_PATH}/{id}`, { id });
const buildDashboardAppPath = (id: string) => buildPath(`${DASHBOARD_APP_API_PATH}/{id}`, { id });

export const dashboardClient = {
  create: async (
    dashboardState: DashboardState,
    accessMode?: SavedObjectAccessControl['accessMode']
  ) => {
    return coreServices.http.post<DashboardCreateResponseBody>(DASHBOARD_APP_API_PATH, {
      version: DASHBOARD_APP_API_VERSION,
      body: JSON.stringify({
        ...dashboardState,
        ...(accessMode && { access_control: { access_mode: accessMode } }),
      }),
    });
  },
  delete: async (id: string): Promise<DeleteResult> => {
    cache.delete(id);
    return coreServices.http.delete(buildDashboardPath(id), {
      version: DASHBOARD_API_VERSION,
    });
  },
  get: async (id: string): Promise<ReadBodyWithResolve> => {
    if (cache.has(id)) {
      return cache.get(id)!;
    }

    const { body, response } = await coreServices.http
      .get<DashboardReadResponseBody>(buildDashboardAppPath(id), {
        version: DASHBOARD_APP_API_VERSION,
        asResponse: true,
      })
      .catch((e) => {
        if (e.response?.status === 404) {
          throw new SavedObjectNotFound({ type: DASHBOARD_SAVED_OBJECT_TYPE, id });
        }
        const message = (e.body as { message?: string })?.message ?? e.message;
        throw new Error(message);
      });

    const result = {
      ...body,
      resolve: {
        outcome: response?.headers.get('kbn-resolve-outcome') ?? undefined,
        aliasTargetId: response?.headers.get('kbn-resolve-alias-target-id') ?? undefined,
        aliasPurpose: response?.headers.get('kbn-resolve-purpose') ?? undefined,
      },
    } as ReadBodyWithResolve;

    if (result.resolve.outcome !== 'aliasMatch') {
      /**
       * Only add the dashboard to the cache if it does not require a redirect - otherwise, the meta
       * alias info gets cached and prevents the dashboard contents from being updated
       */
      cache.set(id, result);
    }
    return result;
  },
  search: async (searchParams: Partial<DashboardSearchRequestParams>) => {
    const { query, ...params } = searchParams;

    const response = await coreServices.http.get<
      DashboardSearchResponseBody | LegacyDashboardSearchResponseBody
    >(DASHBOARD_API_PATH, {
      version: DASHBOARD_API_VERSION,
      query: {
        ...params,
        ...(query ? { query: `${query}*` } : {}),
      },
    });

    // Normalize the legacy response shape to the GA shape so callers always receive `{ data, meta }`,
    // regardless of whether the server has the `asCode.useGASchemas` feature flag enabled.
    if ('dashboards' in response) {
      return {
        data: response.dashboards,
        meta: {
          page: response.page,
          per_page: params.per_page ?? PAGINATION_DEFAULT_PER_PAGE,
          total: response.total,
        },
      };
    }

    return response;
  },
  update: async (id: string, dashboardState: DashboardState) => {
    const updateResponse = await coreServices.http.put<DashboardUpdateResponseBody>(
      buildDashboardAppPath(id),
      {
        version: DASHBOARD_APP_API_VERSION,
        body: JSON.stringify(dashboardState),
      }
    );
    cache.delete(id);
    return updateResponse;
  },
  invalidateCache: async (id: string) => {
    if (cache.has(id)) {
      cache.delete(id);
    }
  },
};
