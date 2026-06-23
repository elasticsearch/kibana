/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type SuperTest from 'supertest';
import {
  ELASTIC_HTTP_VERSION_HEADER,
  X_ELASTIC_INTERNAL_ORIGIN_REQUEST,
} from '@kbn/core-http-common';
import { API_VERSIONS } from '@kbn/security-solution-plugin/common/constants';
import {
  WATCHLISTS_URL,
  WATCHLISTS_DATA_SOURCE_URL,
  WATCHLISTS_DATA_SOURCE_LIST_URL,
  WATCHLISTS_SYNC_URL,
  WATCHLISTS_ENTITIES_ASSIGN_URL,
  WATCHLISTS_PREBUILT_INSTALL_URL,
} from '@kbn/security-solution-plugin/common/entity_analytics/watchlists/constants';
import type { CreateWatchlistRequestBody } from '@kbn/security-solution-plugin/common/api/entity_analytics/watchlists/management/create.gen';
import type { UpdateWatchlistRequestBody } from '@kbn/security-solution-plugin/common/api/entity_analytics/watchlists/management/update.gen';
import type { WatchlistObject } from '@kbn/security-solution-plugin/common/api/entity_analytics/watchlists/management/common.gen';
import type { CreateWatchlistEntitySourceRequestBody } from '@kbn/security-solution-plugin/common/api/entity_analytics/watchlists/data_source/create.gen';
import type { SupertestWithoutAuthProviderType } from '@kbn/ftr-common-functional-services';
import { routeWithNamespace } from '@kbn/detections-response-ftr-services';

interface PasswordBasedCredentials {
  username: string;
  password: string;
}

interface ApiKeyCredentials {
  apiKeyHeader: Record<string, string>;
}

type Credentials = PasswordBasedCredentials | ApiKeyCredentials;

const isApiKeyCredentials = (credentials: Credentials): credentials is ApiKeyCredentials =>
  'apiKeyHeader' in credentials;

const assertStatusCode = (statusCode: number, response: SuperTest.Response) => {
  if (response.status !== statusCode) {
    throw new Error(
      `Expected status code ${statusCode}, but got ${response.statusCode} \n` + response.text
    );
  }
};

export type WatchlistRouteHelpers = ReturnType<typeof watchlistRouteHelpersFactory>;

export const cleanUpWatchlists = async (watchlistRoutes: WatchlistRouteHelpers): Promise<void> => {
  const listResponse = await watchlistRoutes.list().catch(() => undefined);
  if (!listResponse) {
    return;
  }
  for (const watchlist of listResponse.body) {
    if (watchlist.id) {
      await watchlistRoutes.delete(watchlist.id).catch(() => undefined);
    }
  }
};

export const watchlistRouteHelpersFactory = (supertest: SuperTest.Agent, namespace?: string) => ({
  create: async (
    body: CreateWatchlistRequestBody,
    { expectStatusCode }: { expectStatusCode: number } = { expectStatusCode: 200 }
  ): Promise<SuperTest.Response & { body: WatchlistObject }> => {
    const response = await supertest
      .post(routeWithNamespace(WATCHLISTS_URL, namespace))
      .set('kbn-xsrf', 'true')
      .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
      .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
      .send(body)
      .expect(expectStatusCode);

    return response;
  },
  list: async (
    { expectStatusCode }: { expectStatusCode: number } = { expectStatusCode: 200 }
  ): Promise<SuperTest.Response & { body: WatchlistObject[] }> => {
    return supertest
      .get(routeWithNamespace(`${WATCHLISTS_URL}/list`, namespace))
      .set('kbn-xsrf', 'true')
      .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
      .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
      .expect(expectStatusCode);
  },
  get: async (
    id: string,
    { expectStatusCode }: { expectStatusCode: number } = { expectStatusCode: 200 }
  ): Promise<SuperTest.Response & { body: WatchlistObject }> => {
    return supertest
      .get(routeWithNamespace(`${WATCHLISTS_URL}/${id}`, namespace))
      .set('kbn-xsrf', 'true')
      .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
      .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
      .expect(expectStatusCode);
  },
  delete: async (
    id: string,
    { expectStatusCode }: { expectStatusCode: number } = { expectStatusCode: 200 }
  ): Promise<SuperTest.Response> => {
    return supertest
      .delete(routeWithNamespace(`${WATCHLISTS_URL}/${id}`, namespace))
      .set('kbn-xsrf', 'true')
      .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
      .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
      .expect(expectStatusCode);
  },
});

export const watchlistRouteHelpersFactoryNoAuth = (
  supertestWithoutAuth: SupertestWithoutAuthProviderType,
  namespace?: string
) => {
  const withDefaults = (req: SuperTest.Test, credentials: Credentials) => {
    const authedReq = isApiKeyCredentials(credentials)
      ? req.set(credentials.apiKeyHeader)
      : req.auth(credentials.username, credentials.password);

    return authedReq
      .set('kbn-xsrf', 'true')
      .set(ELASTIC_HTTP_VERSION_HEADER, API_VERSIONS.public.v1)
      .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana');
  };

  const resolveDataSourceUrl = (watchlistId: string) =>
    WATCHLISTS_DATA_SOURCE_URL.replace('{watchlist_id}', watchlistId);

  return {
    create: async (
      credentials: Credentials,
      body: CreateWatchlistRequestBody,
      expectStatusCode: number = 200
    ) => {
      const response = await withDefaults(
        supertestWithoutAuth.post(routeWithNamespace(WATCHLISTS_URL, namespace)),
        credentials
      ).send(body);

      assertStatusCode(expectStatusCode, response);
      return response;
    },
    list: async (credentials: Credentials, expectStatusCode: number = 200) => {
      const response = await withDefaults(
        supertestWithoutAuth.get(routeWithNamespace(`${WATCHLISTS_URL}/list`, namespace)),
        credentials
      ).send();

      assertStatusCode(expectStatusCode, response);
      return response;
    },
    get: async (credentials: Credentials, id: string, expectStatusCode: number = 200) => {
      const response = await withDefaults(
        supertestWithoutAuth.get(routeWithNamespace(`${WATCHLISTS_URL}/${id}`, namespace)),
        credentials
      ).send();

      assertStatusCode(expectStatusCode, response);
      return response;
    },
    update: async (
      credentials: Credentials,
      id: string,
      body: UpdateWatchlistRequestBody,
      expectStatusCode: number = 200
    ) => {
      const response = await withDefaults(
        supertestWithoutAuth.put(routeWithNamespace(`${WATCHLISTS_URL}/${id}`, namespace)),
        credentials
      ).send(body);

      assertStatusCode(expectStatusCode, response);
      return response;
    },
    delete: async (credentials: Credentials, id: string, expectStatusCode: number = 200) => {
      const response = await withDefaults(
        supertestWithoutAuth.delete(routeWithNamespace(`${WATCHLISTS_URL}/${id}`, namespace)),
        credentials
      ).send();

      assertStatusCode(expectStatusCode, response);
      return response;
    },
    sync: async (credentials: Credentials, watchlistId: string, expectStatusCode: number = 200) => {
      const response = await withDefaults(
        supertestWithoutAuth.post(
          routeWithNamespace(WATCHLISTS_SYNC_URL.replace('{watchlist_id}', watchlistId), namespace)
        ),
        credentials
      ).send();

      assertStatusCode(expectStatusCode, response);
      return response;
    },
    installPrebuilt: async (credentials: Credentials, expectStatusCode: number = 200) => {
      const response = await withDefaults(
        supertestWithoutAuth.post(routeWithNamespace(WATCHLISTS_PREBUILT_INSTALL_URL, namespace)),
        credentials
      ).send();

      assertStatusCode(expectStatusCode, response);
      return response;
    },
    createEntitySource: async (
      credentials: Credentials,
      watchlistId: string,
      body: CreateWatchlistEntitySourceRequestBody,
      expectStatusCode: number = 200
    ) => {
      const response = await withDefaults(
        supertestWithoutAuth.post(routeWithNamespace(resolveDataSourceUrl(watchlistId), namespace)),
        credentials
      ).send(body);

      assertStatusCode(expectStatusCode, response);
      return response;
    },
    listEntitySources: async (
      credentials: Credentials,
      watchlistId: string,
      expectStatusCode: number = 200
    ) => {
      const response = await withDefaults(
        supertestWithoutAuth.get(
          routeWithNamespace(
            WATCHLISTS_DATA_SOURCE_LIST_URL.replace('{watchlist_id}', watchlistId),
            namespace
          )
        ),
        credentials
      ).send();

      assertStatusCode(expectStatusCode, response);
      return response;
    },
    assignEntities: async (
      credentials: Credentials,
      watchlistId: string,
      body: { euids: string[] },
      expectStatusCode: number = 200
    ) => {
      const response = await withDefaults(
        supertestWithoutAuth.post(
          routeWithNamespace(
            WATCHLISTS_ENTITIES_ASSIGN_URL.replace('{watchlist_id}', watchlistId),
            namespace
          )
        ),
        credentials
      ).send(body);

      assertStatusCode(expectStatusCode, response);
      return response;
    },
  };
};
