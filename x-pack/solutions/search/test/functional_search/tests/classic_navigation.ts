/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../ftr_provider_context';

export default function searchSolutionNavigation({
  getPageObjects,
  getService,
}: FtrProviderContext) {
  const { common, searchClassicNavigation } = getPageObjects(['common', 'searchClassicNavigation']);
  const searchSpace = getService('searchSpace');
  const testSubjects = getService('testSubjects');

  describe('Search Classic Navigation', () => {
    let cleanUp: () => Promise<unknown>;
    let spaceCreated: { id: string } = { id: '' };

    before(async () => {
      ({ cleanUp, spaceCreated } = await searchSpace.createTestSpace(
        'search-classic-ftr',
        'classic'
      ));

      await searchSpace.navigateTo(spaceCreated.id);
      await common.navigateToApp('searchHomepage');
    });

    after(async () => {
      // Clean up space created
      await cleanUp();
    });

    it('renders expected navigation items', async () => {
      await searchClassicNavigation.expectAllNavItems([
        { id: 'Home', label: 'Home' },
        { id: 'GettingStarted', label: 'Getting started' },
        { id: 'Build', label: 'Build' },
        { id: 'Indices', label: 'Index Management' },
        { id: 'Playground', label: 'Playground' },
        { id: 'SearchApplications', label: 'Search applications' },
        { id: 'Agents', label: 'Agents' },
        { id: 'Relevance', label: 'Relevance' },
        { id: 'Synonyms', label: 'Synonyms' },
        { id: 'QueryRules', label: 'Query rules' },
      ]);
    });
    it('has expected navigation', async () => {
      const expectNoPageReload = await searchClassicNavigation.createNoPageReloadCheck();

      await searchClassicNavigation.expectNavItemExists('Home');

      const sideNavTestCases: Array<{
        navItem: string;
        breadcrumbs: string[];
        pageTestSubject: string;
      }> = [
        {
          navItem: 'Indices',
          breadcrumbs: ['Build', 'Index Management'],
          pageTestSubject: 'indicesList',
        },
        {
          navItem: 'Playground',
          breadcrumbs: ['Build', 'Playground'],
          pageTestSubject: 'playgroundsListPage',
        },
        {
          navItem: 'SearchApplications',
          breadcrumbs: ['Build', 'Search applications'],
          pageTestSubject: 'searchApplicationsListPage',
        },
        {
          navItem: 'Synonyms',
          breadcrumbs: ['Relevance', 'Synonyms'],
          pageTestSubject: 'searchSynonymsOverviewPage',
        },
        {
          navItem: 'QueryRules',
          breadcrumbs: ['Relevance', 'Query rules'],
          pageTestSubject: 'queryRulesBasePage',
        },
      ];

      for (const testCase of sideNavTestCases) {
        await searchClassicNavigation.clickNavItem(testCase.navItem);
        // Wait for the date test subj to ensure the page is loaded before continuing
        await testSubjects.existOrFail(testCase.pageTestSubject);
        await searchClassicNavigation.expectNavItemActive(testCase.navItem);
        for (const breadcrumb of testCase.breadcrumbs) {
          await searchClassicNavigation.breadcrumbs.expectBreadcrumbExists(breadcrumb);
        }
      }

      await expectNoPageReload();
    });
  });
}
