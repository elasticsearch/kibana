/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/context_awareness/extensions/_get_pagination_config.ts

import kbnRison from '@kbn/rison';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, discover, svlCommonPage } = getPageObjects([
    'common',
    'discover',
    'svlCommonPage',
  ]);
  const testSubjects = getService('testSubjects');
  const dataViews = getService('dataViews');
  const dataGrid = getService('dataGrid');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');

  const resetTimeFrame = {
    from: '2024-06-10T14:00:00.000Z',
    to: '2024-06-10T16:30:00.000Z',
  };

  const currentTimeFrame = {
    from: '2015-09-20T01:00:00.000Z',
    to: '2015-09-24T16:30:00.000Z',
  };

  describe('extension getPaginationConfig', () => {
    before(async () => {
      await svlCommonPage.loginAsAdmin();
      // To load more than 500 records
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.uiSettings.update({
        'timepicker:timeDefaults': `{ "from": "${currentTimeFrame.from}", "to": "${currentTimeFrame.to}"}`,
      });
    });

    after(async () => {
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.uiSettings.update({
        'timepicker:timeDefaults': `{ "from": "${resetTimeFrame.from}", "to": "${resetTimeFrame.to}"}`,
      });
    });

    describe('ES|QL mode', () => {
      it('should render without pagination using a single page', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from logstash* | sort @timestamp desc' },
        });
        await common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await discover.waitUntilSearchingHasFinished();

        // In ESQL Mode, pagination is disabled
        await testSubjects.missingOrFail('tablePaginationPopoverButton');
        await testSubjects.missingOrFail('pagination-button-previous');
        await testSubjects.missingOrFail('pagination-button-next');
      });
    });

    describe('data view mode', () => {
      it('should render single page pagination without page numbers', async () => {
        await common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        await dataViews.switchTo('my-example-logs,logstash*');
        await discover.waitUntilSearchingHasFinished();
        await testSubjects.missingOrFail('tablePaginationPopoverButton');
        await testSubjects.missingOrFail('pagination-button-previous');
        await testSubjects.missingOrFail('pagination-button-next');
      });

      it('should render default pagination with page numbers', async () => {
        await common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });

        await dataViews.createFromSearchBar({
          name: 'lo', // Must be anything but log/logs, since pagination is disabled for log sources
          adHoc: true,
          hasTimeField: true,
        });

        await discover.waitUntilSearchingHasFinished();
        await testSubjects.existOrFail('tablePaginationPopoverButton');
        await testSubjects.existOrFail('pagination-button-previous');
        await testSubjects.existOrFail('pagination-button-next');
        await dataGrid.checkCurrentRowsPerPageToBe(100);
      });
    });
  });
}
