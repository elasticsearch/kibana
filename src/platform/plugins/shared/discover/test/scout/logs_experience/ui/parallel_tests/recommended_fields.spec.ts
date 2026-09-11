/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import {
  spaceTest,
  createNonLogsDiscoverSession,
  LOGS,
  LOGS_EXPERIENCE_TAGS,
  setupLogsExperience,
  teardownLogsExperience,
} from '../fixtures';

const NON_LOGS_FIELD = 'system.cpu.total.norm.pct';

spaceTest.describe(
  'Logs profile - Recommended fields',
  {
    tag: LOGS_EXPERIENCE_TAGS,
  },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace, config }) => {
      await setupLogsExperience(scoutSpace, config, { solutionView: 'classic' });
    });

    spaceTest.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsViewer();
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await teardownLogsExperience(scoutSpace);
    });

    spaceTest(
      'should show the recommended fields group for the logs data source profile',
      async ({ page, pageObjects }) => {
        const { discover, unifiedFieldList } = pageObjects;

        await discover.goto({ queryMode: 'classic' });
        await discover.selectDataView(LOGS.SYNTH_LOGS_DATA_VIEW);
        await discover.waitUntilTabIsLoaded();

        await expect(
          page.testSubj.locator(unifiedFieldList.getSidebarSectionSelector('recommended'))
        ).toBeVisible();

        // The group renders collapsed: `accordionState` is seeded once from the groups present
        // at first render, and this one only appears after the data source profile resolves,
        // so its `isInitiallyOpen: true` is never applied.
        await unifiedFieldList.openSidebarSection('recommended');

        const fieldNames = await unifiedFieldList.getSidebarSectionFieldNames('recommended');
        expect(fieldNames).toContain('message');
        expect(fieldNames).toContain('log.level');

        // Recommended by the profile, but absent from the seeded documents — the group only
        // lists fields that exist in the data source.
        expect(fieldNames).not.toContain('service.name');
      }
    );

    spaceTest(
      'should NOT show the recommended fields group for a non-logs data source profile',
      async ({ page, apiServices, discoverScoutSpace, pageObjects }) => {
        const { discover, unifiedFieldList } = pageObjects;

        const sessionId = await createNonLogsDiscoverSession(
          apiServices,
          discoverScoutSpace.id,
          'non-logs-no-recommended'
        );

        await discover.goto({ queryMode: 'classic', savedSearchId: sessionId });
        await discover.waitUntilTabIsLoaded();

        await expect(
          page.testSubj.locator(unifiedFieldList.getSidebarSectionSelector('available'))
        ).toBeVisible();

        // Assert the seeded data actually resolved into fields first. The available group
        // renders even when empty, so without this the assertion below would also pass for an
        // index pattern that matched nothing.
        const availableFields = await unifiedFieldList.getSidebarSectionFieldNames('available');
        expect(availableFields).toContain(NON_LOGS_FIELD);

        await expect(
          page.testSubj.locator(unifiedFieldList.getSidebarSectionSelector('recommended'))
        ).toBeHidden();
      }
    );

    spaceTest(
      'should show the recommended fields group in ES|QL mode',
      async ({ page, pageObjects }) => {
        const { discover, unifiedFieldList } = pageObjects;

        await discover.goto({ queryMode: 'esql' });
        await discover.writeAndSubmitEsqlQuery(LOGS.SYNTH_LOGS_ESQL_QUERY);

        await expect(
          page.testSubj.locator(unifiedFieldList.getSidebarSectionSelector('recommended'))
        ).toBeVisible();

        await unifiedFieldList.openSidebarSection('recommended');

        const fieldNames = await unifiedFieldList.getSidebarSectionFieldNames('recommended');
        expect(fieldNames).toContain('message');
        expect(fieldNames).toContain('log.level');
      }
    );

    spaceTest(
      'should NOT show the recommended fields group for a non-logs ES|QL query',
      async ({ page, pageObjects }) => {
        const { discover, unifiedFieldList } = pageObjects;

        await discover.goto({ queryMode: 'esql' });
        await discover.writeAndSubmitEsqlQuery(`from ${LOGS.NON_LOGS_DATA_VIEW} | limit 100`);

        const availableFields = await unifiedFieldList.getSidebarSectionFieldNames('available');
        expect(availableFields).toContain(NON_LOGS_FIELD);

        await expect(
          page.testSubj.locator(unifiedFieldList.getSidebarSectionSelector('recommended'))
        ).toBeHidden();
      }
    );
  }
);
