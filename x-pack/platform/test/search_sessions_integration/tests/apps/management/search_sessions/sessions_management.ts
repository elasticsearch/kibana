/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Migration recommendation: MIXED. See individual tests.
 */

import expect from '@kbn/expect';
import { v4 as uuidv4 } from 'uuid';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');
  const PageObjects = getPageObjects([
    'common',
    'header',
    'dashboard',
    'visChart',
    'searchSessionsManagement',
  ]);
  const searchSessions = getService('searchSessions');
  const log = getService('log');

  describe('Search Sessions Management UI', () => {
    describe('New search sessions', () => {
      before(async () => {
        await searchSessions.deleteAllSearchSessions();
        await PageObjects.common.navigateToApp('dashboard');
        log.debug('wait for dashboard landing page');
        await testSubjects.existOrFail('dashboardLandingPage', { timeout: 10000 });
      });

      after(async () => {
        await searchSessions.deleteAllSearchSessions();
      });

      /**
       * Migration recommendation: MIGRATE TO SCOUT. Saving sessions is already covered, but navigating to dashboard is a good integration test.
       */
      it('Saves a session and verifies it in the Management app', async () => {
        log.debug('loading the "Not Delayed" dashboard');
        await PageObjects.dashboard.loadSavedDashboard('Delayed 5s');
        await PageObjects.dashboard.waitForRenderComplete();
        const searchSessionName = `Session - ${uuidv4()}`;

        await searchSessions.save({ withRefresh: true, isSubmitButton: true });
        await PageObjects.dashboard.waitForRenderComplete();
        await searchSessions.openFlyout();
        const list = await PageObjects.searchSessionsManagement.getList();
        await list[0].rename(searchSessionName);

        await PageObjects.searchSessionsManagement.goTo();

        await retry.waitFor(`first item to complete`, async function () {
          const s = await PageObjects.searchSessionsManagement.getList();
          if (!s[0]) {
            log.warning(`Expected item is not in the table!`);
          } else {
            log.debug(`First item status: ${s[0].status}`);
          }
          return s[0] && s[0].status === 'complete';
        });

        // find there is only one item in the table which is the newly saved session
        log.debug('find the newly saved session');
        const searchSessionList = await PageObjects.searchSessionsManagement.getList();
        expect(searchSessionList.length).to.be(1);
        expect(searchSessionList[0].expires).not.to.eql('--');
        expect(searchSessionList[0].name).to.be(searchSessionName);

        // navigate to dashboard
        await searchSessionList[0].view();

        // embeddable has loaded
        await testSubjects.existOrFail('embeddablePanelHeading-SumofBytesbyExtension(Delayed5s)');
        await PageObjects.dashboard.waitForRenderComplete();
      });

      /**
       * Migration recommendation: DELETE. Covered by component and API tests
       */
      it('Deletes a session from management', async () => {
        await PageObjects.searchSessionsManagement.goTo();

        const searchSessionList = await PageObjects.searchSessionsManagement.getList();

        expect(searchSessionList.length).to.be(1);
        await searchSessionList[0].delete();

        await retry.waitFor(`wait for list to be empty`, async function () {
          const s = await PageObjects.searchSessionsManagement.getList();

          return s.length === 0;
        });
      });

      /**
       * Migration recommendation: DELETE. src/platform/plugins/shared/data/public/search/session/sessions_mgmt/index.test.ts already tests that the title is set correctly. We can trust the Kibana framework for the rest.
       */
      it('Should be called "Background search" in the management apps sidebar', async () => {
        await PageObjects.common.navigateToApp('management');
        const searchSessionsAnchor = await testSubjects.find('search_sessions');
        const anchorText = await searchSessionsAnchor.getVisibleText();
        expect(anchorText).to.be('Background Search');
      });
    });
  });
}
