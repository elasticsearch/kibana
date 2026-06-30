/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

/**
 * Migration recommendation: MIGRATE TO SCOUT. This tests the integration of several Kibana components for unusual user privilege situations.
 */

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const security = getService('security');
  const PageObjects = getPageObjects([
    'common',
    'header',
    'dashboard',
    'visChart',
    'searchSessionsManagement',
    'security',
  ]);

  const appsMenu = getService('appsMenu');
  const managementMenu = getService('managementMenu');

  describe('Search Sessions Management UI permissions', () => {
    describe('Sessions management is not available', () => {
      before(async () => {
        await security.role.create('data_analyst', {
          elasticsearch: {},
          kibana: [
            {
              feature: {
                dashboard: ['read'],
              },
              spaces: ['*'],
            },
          ],
        });

        await security.user.create('analyst', {
          password: 'analyst-password',
          roles: ['data_analyst'],
          full_name: 'test user',
        });

        await PageObjects.security.forceLogout();

        await PageObjects.security.login('analyst', 'analyst-password', {
          expectSpaceSelector: false,
        });
      });

      after(async () => {
        // NOTE: Logout needs to happen before anything else to avoid flaky behavior
        await PageObjects.security.forceLogout();

        await security.role.delete('data_analyst');
        await security.user.delete('analyst');
      });

      it('if no apps enable search sessions', async () => {
        const links = await appsMenu.readLinks();
        expect(links.map((link) => link.text)).to.not.contain('Stack Management');
      });
    });

    describe('Sessions management is available', () => {
      before(async () => {
        await security.role.create('data_analyst', {
          elasticsearch: {},
          kibana: [
            {
              feature: {
                dashboard: ['read', 'store_search_session'],
              },
              spaces: ['*'],
            },
          ],
        });

        await security.user.create('analyst', {
          password: 'analyst-password',
          roles: ['data_analyst'],
          full_name: 'test user',
        });

        await PageObjects.security.forceLogout();

        await PageObjects.security.login('analyst', 'analyst-password', {
          expectSpaceSelector: false,
        });
      });

      after(async () => {
        // NOTE: Logout needs to happen before anything else to avoid flaky behavior
        await PageObjects.security.forceLogout();

        await security.role.delete('data_analyst');
        await security.user.delete('analyst');
      });

      it('if one app enables search sessions', async () => {
        const links = await appsMenu.readLinks();
        expect(links.map((link) => link.text)).to.contain('Stack Management');
        await PageObjects.common.navigateToApp('management');
        const sections = await managementMenu.getSections();
        expect(sections).to.have.length(1);
        expect(sections[0]).to.eql({
          sectionId: 'kibana',
          sectionLinks: ['search_sessions'],
        });
      });
    });
  });
}
