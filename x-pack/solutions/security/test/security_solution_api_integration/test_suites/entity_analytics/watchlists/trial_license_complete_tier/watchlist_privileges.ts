/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { RoleCredentials } from '@kbn/ftr-common-functional-services';
import { ROLES as SERVERLESS_ROLES } from '@kbn/security-solution-plugin/common/test';
import { SECURITY_FEATURE_ID } from '@kbn/security-solution-plugin/common/constants';
import {
  cleanUpWatchlists,
  watchlistRouteHelpersFactory,
  watchlistRouteHelpersFactoryNoAuth,
} from '../../utils';
import type { FtrProviderContext } from '../../../../ftr_provider_context';
import { usersAndRolesFactory } from '../../utils/users_and_roles';

const USER_PASSWORD = 'changeme';
const ALL_USER = 'watchlist_security_all';
const READ_USER = 'watchlist_security_read';
const USERS = [ALL_USER, READ_USER];

const ROLES = [
  {
    name: `${ALL_USER}_role`,
    privileges: {
      kibana: [
        {
          feature: { [SECURITY_FEATURE_ID]: ['all'] },
          spaces: ['default'],
        },
      ],
    },
  },
  {
    name: `${READ_USER}_role`,
    privileges: {
      kibana: [
        {
          feature: { [SECURITY_FEATURE_ID]: ['read'] },
          spaces: ['default'],
        },
      ],
    },
  },
];

export default ({ getService }: FtrProviderContext) => {
  const userHelper = usersAndRolesFactory(getService('security'));
  const supertest = getService('supertest');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const config = getService('config');
  const isServerless = config.get('serverless');
  const samlAuth = isServerless ? getService('samlAuth') : null;
  const watchlistRoutes = watchlistRouteHelpersFactory(supertest);
  const watchlistRoutesNoAuth = watchlistRouteHelpersFactoryNoAuth(supertestWithoutAuth);

  let allCreds: { username: string; password: string } | { apiKeyHeader: Record<string, string> };
  let readCreds: { username: string; password: string } | { apiKeyHeader: Record<string, string> };
  let allRoleAuthc: RoleCredentials | undefined;
  let readRoleAuthc: RoleCredentials | undefined;

  describe('@ess @serverless @skipInServerlessMKI Entity Analytics - Watchlist Privileges', () => {
    before(async () => {
      if (isServerless) {
        allRoleAuthc = await samlAuth!.createM2mApiKeyWithRoleScope(SERVERLESS_ROLES.t3_analyst);
        readRoleAuthc = await samlAuth!.createM2mApiKeyWithRoleScope(SERVERLESS_ROLES.t1_analyst);
        allCreds = { apiKeyHeader: allRoleAuthc.apiKeyHeader };
        readCreds = { apiKeyHeader: readRoleAuthc.apiKeyHeader };
      } else {
        await Promise.all(ROLES.map((role) => userHelper.createRole(role)));
        await Promise.all(
          USERS.map((user) =>
            userHelper.createUser({
              username: user,
              password: USER_PASSWORD,
              roles: [`${user}_role`],
            })
          )
        );
        allCreds = { username: ALL_USER, password: USER_PASSWORD };
        readCreds = { username: READ_USER, password: USER_PASSWORD };
      }
    });

    after(async () => {
      if (isServerless) {
        await samlAuth!.invalidateM2mApiKeyWithRoleScope(allRoleAuthc!);
        await samlAuth!.invalidateM2mApiKeyWithRoleScope(readRoleAuthc!);
      } else {
        await Promise.all(USERS.map((user) => userHelper.deleteUser(user)));
        await Promise.all(ROLES.map((role) => userHelper.deleteRole(role.name)));
      }
    });

    afterEach(async () => {
      await cleanUpWatchlists(watchlistRoutes);
    });

    describe('create watchlist', () => {
      it('allows Security:all to create a watchlist', async () => {
        const watchlistName = 'privileges-create-all';
        const response = await watchlistRoutesNoAuth.create(
          allCreds,
          { name: watchlistName, riskModifier: 1 },
          200
        );
        expect(response.body.name).to.eql(watchlistName);
      });

      it('forbids Security:read from creating a watchlist', async () => {
        await watchlistRoutesNoAuth.create(
          readCreds,
          { name: 'privileges-create-read', riskModifier: 1 },
          403
        );
      });
    });

    describe('install prebuilt watchlists', () => {
      it('allows Security:all to install prebuilt watchlists', async () => {
        await watchlistRoutesNoAuth.installPrebuilt(allCreds, 200);
      });

      it('forbids Security:read from installing prebuilt watchlists', async () => {
        await watchlistRoutesNoAuth.installPrebuilt(readCreds, 403);
      });
    });

    describe('operations on an existing watchlist', () => {
      let watchlistId: string;

      beforeEach(async () => {
        const response = await watchlistRoutesNoAuth.create(
          allCreds,
          { name: `privileges-shared-${Date.now()}`, riskModifier: 1 },
          200
        );
        watchlistId = response.body.id;
      });

      it('allows Security:read to get a watchlist', async () => {
        const response = await watchlistRoutesNoAuth.get(readCreds, watchlistId, 200);
        expect(response.body.id).to.eql(watchlistId);
      });

      it('allows Security:read to list watchlists', async () => {
        await watchlistRoutesNoAuth.list(readCreds, 200);
      });

      it('allows Security:read to list entity sources', async () => {
        await watchlistRoutesNoAuth.listEntitySources(readCreds, watchlistId, 200);
      });

      it('forbids Security:read from updating a watchlist', async () => {
        await watchlistRoutesNoAuth.update(
          readCreds,
          watchlistId,
          { name: 'privileges-update-read', riskModifier: 1, description: 'new description' },
          403
        );
      });

      it('forbids Security:read from deleting a watchlist', async () => {
        await watchlistRoutesNoAuth.delete(readCreds, watchlistId, 403);
      });

      it('forbids Security:read from syncing a watchlist', async () => {
        await watchlistRoutesNoAuth.sync(readCreds, watchlistId, 403);
      });

      it('forbids Security:read from creating an entity source', async () => {
        await watchlistRoutesNoAuth.createEntitySource(
          readCreds,
          watchlistId,
          {
            type: 'index',
            name: 'privileges-source',
            indexPattern: 'logs-*',
            enabled: true,
          },
          403
        );
      });
    });
  });
};
