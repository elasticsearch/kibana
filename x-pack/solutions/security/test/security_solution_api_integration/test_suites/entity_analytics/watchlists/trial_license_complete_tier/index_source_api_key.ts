/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { X_ELASTIC_INTERNAL_ORIGIN_REQUEST } from '@kbn/core-http-common';
import { ELASTIC_HTTP_VERSION_HEADER } from '@kbn/core-http-common';
import { SECURITY_FEATURE_ID } from '@kbn/security-solution-plugin/common/constants';
import type { FtrProviderContext } from '../../../../ftr_provider_context';
import { WatchlistSyncUtils } from './utils/watchlist_sync_utils';
import { EntityStoreUtils } from './utils/entity_store_utils';
import { usersAndRolesFactory } from '../../utils/users_and_roles';

const USER_PASSWORD = 'changeme';
const sourceIndexName = 'watchlist-api-key-test-users';

const KIBANA_ONLY_ROLE = {
  name: 'watchlist_kibana_only',
  privileges: {
    kibana: [
      {
        feature: {
          [SECURITY_FEATURE_ID]: ['all'],
        },
        spaces: ['default'],
      },
    ],
    elasticsearch: {
      // intentionally empty — no index read privileges
    },
  },
};

export default ({ getService }: FtrProviderContext) => {
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const supertest = getService('supertest');
  const es = getService('es');
  const entityAnalyticsApi = getService('entityAnalyticsApi');
  const userHelper = usersAndRolesFactory(getService('security'));
  const config = getService('config');
  const isServerless = config.get('serverless');
  const samlAuth = isServerless ? getService('samlAuth') : null;

  const utils = WatchlistSyncUtils(getService, [sourceIndexName]);
  const entityStore = EntityStoreUtils(getService);

  const kibanaOnlyUser = 'watchlist_kibana_only_user';

  // Holds the API key header used by the restricted user in serverless.
  let restrictedUserApiKeyHeader: Record<string, string> = {};

  // Sends a request authenticated as a restricted user (no ES index read privileges).
  // ESS: basic auth with a native user. Serverless: M2M API key with a custom role.
  const makeEntitySourceRequest = (
    method: 'post' | 'put' | 'delete',
    path: string,
    body?: object
  ) => {
    const req =
      method === 'put'
        ? supertestWithoutAuth.put(path)
        : method === 'delete'
        ? supertestWithoutAuth.delete(path)
        : supertestWithoutAuth.post(path);

    const authedReq = isServerless
      ? req.set(restrictedUserApiKeyHeader)
      : req.auth(kibanaOnlyUser, USER_PASSWORD);

    authedReq
      .set('kbn-xsrf', 'true')
      .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
      .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana');

    return body ? authedReq.send(body) : authedReq.send();
  };

  describe('@ess @serverless @skipInServerlessMKI Index Source API Key Management', () => {
    before(async () => {
      if (isServerless) {
        await samlAuth!.setCustomRole(KIBANA_ONLY_ROLE.privileges);
        const credentials = await samlAuth!.createM2mApiKeyWithCustomRoleScope();
        restrictedUserApiKeyHeader = credentials.apiKeyHeader;
      } else {
        await userHelper.createRole(KIBANA_ONLY_ROLE);
        await userHelper.createUser({
          username: kibanaOnlyUser,
          password: USER_PASSWORD,
          roles: [KIBANA_ONLY_ROLE.name],
        });
      }
      await utils.cleanWatchlistState();
      await entityStore.install(['user']);
    });

    after(async () => {
      if (isServerless) {
        await samlAuth!.deleteCustomRole();
      } else {
        await userHelper.deleteUser(kibanaOnlyUser);
        await userHelper.deleteRole(KIBANA_ONLY_ROLE.name);
      }
      await entityStore.uninstall();
    });

    afterEach(async () => {
      await utils.deleteAllSourceIndices();
      await entityStore.clearAllEntityStoreData();
      await utils.cleanWatchlistState();
    });

    it('should return 403 when the user tries to create a watchlist with an index source that they do not have read access', async () => {
      const { body: watchlist } = await entityAnalyticsApi.createWatchlist({
        body: { name: 'priv-check-watchlist', description: 'test', riskModifier: 1 },
      });

      // uses restricted user (no ES index privileges), so the privilege check fails
      const response = await makeEntitySourceRequest(
        'post',
        `/api/entity_analytics/watchlists/${watchlist.id}/entity_source`,
        {
          type: 'index',
          name: 'restricted-source',
          indexPattern: sourceIndexName,
          identifierField: 'user.name',
          enabled: true,
          range: { start: 'now-10d', end: 'now' },
        }
      );

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Insufficient privileges');
    });

    it('should return 403 when the user tries to update a watchlist with an index source that they do not have read access', async () => {
      await utils.createSourceIndex(sourceIndexName);
      const { watchlistId, entitySourceId } = await utils.createWatchlistAndEntitySource(
        'priv-update-watchlist',
        sourceIndexName
      );

      // uses restricted user (no ES index privileges), so the privilege check fails
      const response = await makeEntitySourceRequest(
        'put',
        `/api/entity_analytics/watchlists/${watchlistId}/entity_source/${entitySourceId}`,
        {
          indexPattern: 'restricted-new-index-*',
        }
      );

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Insufficient privileges');
    });

    it('should store apiKeyId on the entity source after creation', async () => {
      await utils.createSourceIndex(sourceIndexName);
      const { body: watchlist } = await entityAnalyticsApi
        .createWatchlist({ body: { name: 'api-key-set', description: 'test', riskModifier: 1 } })
        .expect(200);

      // uses FTR superuser with full ES + Kibana privileges, so the privilege check passes and the API key grant succeeds
      const { body: created } = await entityAnalyticsApi
        .createWatchlistEntitySource({
          params: { watchlist_id: watchlist.id },
          body: {
            type: 'index',
            name: 'api-key-set-source',
            indexPattern: sourceIndexName,
            identifierField: 'user.name',
            enabled: true,
            range: { start: 'now-10d', end: 'now' },
          },
        })
        .expect(200);

      // Create response is built before updateApiKeyFields runs, so fetch to get the stored key id
      const { body: fetched } = await entityAnalyticsApi
        .getWatchlistEntitySource({ params: { watchlist_id: watchlist.id, id: created.id } })
        .expect(200);

      expect(typeof fetched.apiKeyId).toBe('string');
    });

    it('should invalidate the API key when an entity source is deleted', async () => {
      await utils.createSourceIndex(sourceIndexName);
      const { body: watchlist } = await entityAnalyticsApi
        .createWatchlist({
          body: { name: 'api-key-delete-source', description: 'test', riskModifier: 1 },
        })
        .expect(200);

      const { body: created } = await entityAnalyticsApi
        .createWatchlistEntitySource({
          params: { watchlist_id: watchlist.id },
          body: {
            type: 'index',
            name: 'key-delete-source',
            indexPattern: sourceIndexName,
            identifierField: 'user.name',
            enabled: true,
            range: { start: 'now-10d', end: 'now' },
          },
        })
        .expect(200);

      const { body: fetched } = await entityAnalyticsApi
        .getWatchlistEntitySource({ params: { watchlist_id: watchlist.id, id: created.id } })
        .expect(200);

      expect(typeof fetched.apiKeyId).toBe('string');
      const { apiKeyId } = fetched;

      await supertest
        .delete(`/api/entity_analytics/watchlists/${watchlist.id}/entity_source/${created.id}`)
        .set('kbn-xsrf', 'true')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .expect(200);

      const keyResp = await es.security.getApiKey({ id: apiKeyId });
      expect(keyResp.api_keys[0].invalidated).toBe(true);
    });

    it('should invalidate API keys when the watchlist is deleted', async () => {
      await utils.createSourceIndex(sourceIndexName);
      const { watchlistId, entitySourceId } = await utils.createWatchlistAndEntitySource(
        'api-key-delete-watchlist',
        sourceIndexName
      );

      const { body: fetched } = await entityAnalyticsApi
        .getWatchlistEntitySource({ params: { watchlist_id: watchlistId, id: entitySourceId } })
        .expect(200);

      expect(typeof fetched.apiKeyId).toBe('string');
      const { apiKeyId } = fetched;

      await supertest
        .delete(`/api/entity_analytics/watchlists/${watchlistId}`)
        .set('kbn-xsrf', 'true')
        .set(X_ELASTIC_INTERNAL_ORIGIN_REQUEST, 'kibana')
        .set(ELASTIC_HTTP_VERSION_HEADER, '2023-10-31')
        .expect(200);

      const keyResp = await es.security.getApiKey({ id: apiKeyId });
      expect(keyResp.api_keys[0].invalidated).toBe(true);
    });
  });
};
