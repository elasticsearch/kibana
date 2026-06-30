/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getPageObjects, getService }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const securityService = getService('security');
  const config = getService('config');
  const { common, dashboard, security, error } = getPageObjects([
    'common',
    'dashboard',
    'security',
    'error',
  ]);
  const appsMenu = getService('appsMenu');
  const panelActions = getService('dashboardPanelActions');
  const testSubjects = getService('testSubjects');
  const globalNav = getService('globalNav');
  const queryBar = getService('queryBar');
  const savedQueryManagementComponent = getService('savedQueryManagementComponent');
  const kbnServer = getService('kibanaServer');

  const navigationArgs = {
    ensureCurrentUrl: false,
    shouldLoginIfPrompted: false,
  };

  const from = 'Sep 20, 2015 @ 00:00:00.000';
  const to = 'Sep 21, 2015 @ 00:00:00.000';

  // more tests are in x-pack/platform/test/functional/apps/saved_query_management/feature_controls/security.ts

  describe('dashboard feature controls security', () => {
    before(async () => {
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/logstash_functional'
      );
      await kbnServer.importExport.load(
        'x-pack/platform/test/functional/fixtures/kbn_archives/dashboard/feature_controls/security/security.json'
      );
      await kbnServer.uiSettings.update({
        defaultIndex: 'logstash-*',
      });

      // ensure we're logged out so we can login as the appropriate users
      await security.forceLogout();
    });

    after(async () => {
      // logout, so the other tests don't accidentally run as the custom users we're testing below
      // NOTE: Logout needs to happen before anything else to avoid flaky behavior
      await security.forceLogout();

      await kbnServer.savedObjects.cleanStandardList();
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/logstash_functional');
    });

    describe('global dashboard all privileges, no embeddable application privileges', () => {
      before(async () => {
        await securityService.role.create('global_dashboard_all_role', {
          elasticsearch: {
            indices: [{ names: ['logstash-*'], privileges: ['read', 'view_index_metadata'] }],
          },
          kibana: [
            {
              feature: {
                dashboard: ['all'],
              },
              spaces: ['*'],
            },
          ],
        });

        await securityService.user.create('global_dashboard_all_user', {
          password: 'global_dashboard_all_user-password',
          roles: ['global_dashboard_all_role'],
          full_name: 'test user',
        });

        await security.login('global_dashboard_all_user', 'global_dashboard_all_user-password', {
          expectSpaceSelector: false,
        });
      });

      after(async () => {
        await securityService.role.delete('global_dashboard_all_role');
        await securityService.user.delete('global_dashboard_all_user');
      });

      it('only shows the dashboard navlink', async () => {
        const navLinks = await appsMenu.readLinks();
        expect(navLinks.map((link) => link.text)).to.contain('Dashboards');
      });

      it(`landing page shows "Create new Dashboard" button`, async () => {
        await dashboard.gotoDashboardListingURL({
          args: navigationArgs,
        });
        await testSubjects.existOrFail('dashboardLandingPage', {
          timeout: config.get('timeouts.waitFor'),
        });
        await dashboard.expectCreateButtonExists();
      });

      it(`doesn't show read-only badge`, async () => {
        await globalNav.badgeMissingOrFail();
      });

      it(`create new dashboard shows addNew button`, async () => {
        await dashboard.gotoDashboardURL({ args: navigationArgs });
        await testSubjects.existOrFail('emptyDashboardWidget', {
          timeout: config.get('timeouts.waitFor'),
        });
      });

      it(`can view existing Dashboard`, async () => {
        await dashboard.gotoDashboardURL({
          id: 'i-exist',
          args: navigationArgs,
        });
        await testSubjects.existOrFail('embeddablePanelHeading-APie', {
          timeout: config.get('timeouts.waitFor'),
        });
      });

      it(`does not allow a visualization to be edited`, async () => {
        await dashboard.loadDashboardInEditMode('A Dashboard');
        await panelActions.expectMissingEditPanelAction();
      });

      it(`does not allow a map to be edited`, async () => {
        await dashboard.loadDashboardInEditMode('dashboard with map');
        await panelActions.expectMissingEditPanelAction();
      });
    });

    describe('global dashboard & embeddable all privileges', () => {
      before(async () => {
        await securityService.role.create('global_dashboard_visualize_all_role', {
          elasticsearch: {
            indices: [{ names: ['logstash-*'], privileges: ['read', 'view_index_metadata'] }],
          },
          kibana: [
            {
              feature: {
                dashboard: ['all'],
                visualize: ['all'],
                maps: ['all'],
              },
              spaces: ['*'],
            },
          ],
        });

        await securityService.user.create('global_dashboard_visualize_all_user', {
          password: 'global_dashboard_visualize_all_user-password',
          roles: ['global_dashboard_visualize_all_role'],
          full_name: 'test user',
        });

        await security.login(
          'global_dashboard_visualize_all_user',
          'global_dashboard_visualize_all_user-password',
          {
            expectSpaceSelector: false,
          }
        );
      });

      after(async () => {
        await securityService.role.delete('global_dashboard_visualize_all_role');
        await securityService.user.delete('global_dashboard_visualize_all_user');
      });

      it(`allows a visualization to be edited`, async () => {
        await dashboard.navigateToApp();
        await dashboard.loadDashboardInEditMode('A Dashboard');
        await panelActions.expectExistsEditPanelAction();
      });

      it(`allows a map to be edited`, async () => {
        await dashboard.navigateToApp();
        await dashboard.loadDashboardInEditMode('dashboard with map');
        await panelActions.expectExistsEditPanelAction();
      });

      it('allows saving via the saved query management component popover with no saved query loaded', async () => {
        await queryBar.setQuery('response:200');
        await savedQueryManagementComponent.saveNewQuery('foo', 'bar', true, false);
        await savedQueryManagementComponent.savedQueryExistOrFail('foo');
        await savedQueryManagementComponent.closeSavedQueryManagementComponent();

        await savedQueryManagementComponent.deleteSavedQuery('foo');
        await savedQueryManagementComponent.savedQueryMissingOrFail('foo');
      });

      it('allow saving changes to a currently loaded query via the saved query management component', async () => {
        await savedQueryManagementComponent.loadSavedQuery('OKJpgs');
        await queryBar.setQuery('response:404');
        await savedQueryManagementComponent.updateCurrentlyLoadedQuery(
          'new description',
          true,
          false
        );
        const contextMenuPanelTitleButton = await testSubjects.exists(
          'contextMenuPanelTitleButton'
        );
        if (contextMenuPanelTitleButton) {
          await testSubjects.click('contextMenuPanelTitleButton');
        }
        await savedQueryManagementComponent.clearCurrentlyLoadedQuery();
        await savedQueryManagementComponent.loadSavedQuery('OKJpgs');
        const queryString = await queryBar.getQueryString();
        expect(queryString).to.eql('response:404');

        // Reset after changing
        await queryBar.setQuery('response:200');
        await savedQueryManagementComponent.updateCurrentlyLoadedQuery(
          'Ok responses for jpg files',
          true,
          false
        );
      });

      it('allow saving currently loaded query as a copy', async () => {
        await savedQueryManagementComponent.loadSavedQuery('OKJpgs');
        await queryBar.setQuery('response:404');
        await savedQueryManagementComponent.saveCurrentlyLoadedAsNewQuery(
          'ok2',
          'description',
          true,
          false
        );
        await savedQueryManagementComponent.savedQueryExistOrFail('ok2');
        await savedQueryManagementComponent.deleteSavedQuery('ok2');
      });
    });

    describe('global dashboard read-only privileges', () => {
      before(async () => {
        await securityService.role.create('global_dashboard_read_role', {
          elasticsearch: {
            indices: [{ names: ['logstash-*'], privileges: ['read', 'view_index_metadata'] }],
          },
          kibana: [
            {
              feature: {
                dashboard: ['read'],
              },
              spaces: ['*'],
            },
          ],
        });

        await securityService.user.create('global_dashboard_read_user', {
          password: 'global_dashboard_read_user-password',
          roles: ['global_dashboard_read_role'],
          full_name: 'test user',
        });

        await security.login('global_dashboard_read_user', 'global_dashboard_read_user-password', {
          expectSpaceSelector: false,
        });
        await common.setTime({ from, to });
      });

      after(async () => {
        await securityService.role.delete('global_dashboard_read_role');
        await securityService.user.delete('global_dashboard_read_user');
      });

      it('shows dashboard navlink', async () => {
        const navLinks = (await appsMenu.readLinks()).map((link) => link.text);
        expect(navLinks).to.eql(['Dashboards', 'Workflows']);
      });

      it(`landing page doesn't show "Create new Dashboard" button`, async () => {
        await dashboard.gotoDashboardListingURL({
          args: navigationArgs,
        });
        await testSubjects.existOrFail('dashboardLandingPage', {
          timeout: config.get('timeouts.waitFor'),
        });
        await dashboard.expectCreateButtonMissing();
      });

      it(`shows read-only badge`, async () => {
        await dashboard.gotoDashboardListingURL({
          args: navigationArgs,
        });
        await globalNav.badgeExistsOrFail('Read only');
      });

      it(`create new dashboard shows the read only warning`, async () => {
        await dashboard.gotoDashboardURL({
          args: navigationArgs,
        });
        await testSubjects.existOrFail('dashboardEmptyReadOnly', { timeout: 20000 });
      });

      it(`can view existing Dashboard`, async () => {
        await dashboard.gotoDashboardURL({
          id: 'i-exist',
          args: navigationArgs,
        });
        await testSubjects.existOrFail('embeddablePanelHeading-APie', {
          timeout: config.get('timeouts.waitFor'),
        });
      });

      it('does not allow copy to dashboard behaviour', async () => {
        await panelActions.expectMissingPanelAction('embeddablePanelAction-copyToDashboard');
      });

      it('allows loading a saved query via the saved query management component', async () => {
        await savedQueryManagementComponent.loadSavedQuery('OKJpgs');
        const queryString = await queryBar.getQueryString();
        expect(queryString).to.eql('response:200');
      });

      it('does not allow saving via the saved query management component popover with no query loaded', async () => {
        await savedQueryManagementComponent.saveNewQueryMissingOrFail();
      });

      it('does not allow saving changes to saved query from the saved query management component', async () => {
        await savedQueryManagementComponent.loadSavedQuery('OKJpgs');
        await queryBar.setQuery('response:404');
        await savedQueryManagementComponent.updateCurrentlyLoadedQueryMissingOrFail();
      });

      it('does not allow deleting a saved query from the saved query management component', async () => {
        await savedQueryManagementComponent.deleteSavedQueryMissingOrFail('OKJpgs');
      });

      it('allows clearing the currently loaded saved query', async () => {
        await savedQueryManagementComponent.loadSavedQuery('OKJpgs');
        await savedQueryManagementComponent.clearCurrentlyLoadedQuery();
      });

      it('loads an annotation from the library in the lens chart', async () => {
        await testSubjects.existOrFail('xyVisAnnotationIcon', { timeout: 10000 });
      });
    });

    describe('global dashboard read-only with url_create privileges', () => {
      before(async () => {
        await securityService.role.create('global_dashboard_read_url_create_role', {
          elasticsearch: {
            indices: [{ names: ['logstash-*'], privileges: ['read', 'view_index_metadata'] }],
          },
          kibana: [
            {
              feature: {
                dashboard: ['read', 'url_create'],
              },
              spaces: ['*'],
            },
          ],
        });

        await securityService.user.create('global_dashboard_read_url_create_user', {
          password: 'global_dashboard_read_url_create_user-password',
          roles: ['global_dashboard_read_url_create_role'],
          full_name: 'test user',
        });

        await security.login(
          'global_dashboard_read_url_create_user',
          'global_dashboard_read_url_create_user-password',
          {
            expectSpaceSelector: false,
          }
        );
        await common.setTime({ from, to });
      });

      after(async () => {
        await securityService.role.delete('global_dashboard_read_url_create_role');
        await securityService.user.delete('global_dashboard_read_url_create_user');
      });

      it('shows dashboard navlink', async () => {
        const navLinks = (await appsMenu.readLinks()).map((link) => link.text);
        expect(navLinks).to.contain('Dashboards');
      });

      it(`landing page doesn't show "Create new Dashboard" button`, async () => {
        await dashboard.gotoDashboardListingURL({
          args: navigationArgs,
        });
        await testSubjects.existOrFail('dashboardLandingPage', { timeout: 10000 });
        await dashboard.expectCreateButtonMissing();
      });

      it(`shows read-only badge`, async () => {
        await globalNav.badgeExistsOrFail('Read only');
      });

      it(`create new dashboard shows the read only warning`, async () => {
        await dashboard.gotoDashboardURL({
          args: navigationArgs,
        });
        await testSubjects.existOrFail('dashboardEmptyReadOnly', { timeout: 20000 });
      });

      it(`can view existing Dashboard`, async () => {
        await dashboard.gotoDashboardURL({ id: 'i-exist', args: navigationArgs });
        await testSubjects.existOrFail('embeddablePanelHeading-APie', { timeout: 10000 });
      });

      it('allows loading a saved query via the saved query management component', async () => {
        await savedQueryManagementComponent.loadSavedQuery('OKJpgs');
        const queryString = await queryBar.getQueryString();
        expect(queryString).to.eql('response:200');
      });

      it('does not allow saving via the saved query management component popover with no query loaded', async () => {
        await savedQueryManagementComponent.saveNewQueryMissingOrFail();
      });

      it('does not allow saving changes to saved query from the saved query management component', async () => {
        await savedQueryManagementComponent.loadSavedQuery('OKJpgs');
        await queryBar.setQuery('response:404');
        await savedQueryManagementComponent.updateCurrentlyLoadedQueryMissingOrFail();
      });

      it('does not allow deleting a saved query from the saved query management component', async () => {
        await savedQueryManagementComponent.deleteSavedQueryMissingOrFail('OKJpgs');
      });

      it('allows clearing the currently loaded saved query', async () => {
        await savedQueryManagementComponent.loadSavedQuery('OKJpgs');
        await savedQueryManagementComponent.clearCurrentlyLoadedQuery();
      });

      it('loads an annotation from the library in the lens chart', async () => {
        await testSubjects.existOrFail('xyVisAnnotationIcon', { timeout: 10000 });
      });
    });

    describe('no dashboard privileges', () => {
      before(async () => {
        await securityService.role.create('no_dashboard_privileges_role', {
          elasticsearch: {
            indices: [{ names: ['logstash-*'], privileges: ['read', 'view_index_metadata'] }],
          },
          kibana: [
            {
              feature: {
                discover: ['all'],
              },
              spaces: ['*'],
            },
          ],
        });

        await securityService.user.create('no_dashboard_privileges_user', {
          password: 'no_dashboard_privileges_user-password',
          roles: ['no_dashboard_privileges_role'],
          full_name: 'test user',
        });

        await security.login(
          'no_dashboard_privileges_user',
          'no_dashboard_privileges_user-password',
          {
            expectSpaceSelector: false,
          }
        );
      });

      after(async () => {
        await securityService.role.delete('no_dashboard_privileges_role');
        await securityService.user.delete('no_dashboard_privileges_user');
      });

      it(`doesn't show dashboard navLink`, async () => {
        const navLinks = await appsMenu.readLinks();
        expect(navLinks.map((navLink: any) => navLink.text)).to.not.contain(['Dashboard']);
      });

      it(`landing page shows 403`, async () => {
        await dashboard.gotoDashboardListingURL({
          args: navigationArgs,
        });
        await error.expectForbidden();
      });

      it(`create new dashboard shows 403`, async () => {
        await dashboard.gotoDashboardURL({ args: navigationArgs });
        await error.expectForbidden();
      });

      it(`edit dashboard for object which doesn't exist shows 403`, async () => {
        await dashboard.gotoDashboardURL({ id: 'i-dont-exist', args: navigationArgs });
        await error.expectForbidden();
      });

      it(`edit dashboard for object which exists shows 403`, async () => {
        await dashboard.gotoDashboardURL({ id: 'i-exist', args: navigationArgs });
        await error.expectForbidden();
      });
    });
  });
}
