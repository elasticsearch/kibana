/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/examples/discover_customization_examples/customizations.ts
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../functional/ftr_provider_context';

const TEST_START_TIME = 'Sep 19, 2015 @ 06:31:44.000';
const TEST_END_TIME = 'Sep 23, 2015 @ 18:31:44.000';

// eslint-disable-next-line import/no-default-export
export default ({ getService, getPageObjects }: FtrProviderContext) => {
  const { common, timePicker, header } = getPageObjects(['common', 'timePicker', 'header']);
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const testSubjects = getService('testSubjects');
  const browser = getService('browser');
  const retry = getService('retry');
  const defaultSettings = { defaultIndex: 'logstash-*' };

  describe('Customizations', () => {
    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/logstash_functional'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await kibanaServer.uiSettings.replace(defaultSettings);
      await common.navigateToApp('home');
      const currentUrl = await browser.getCurrentUrl();
      const customizationUrl =
        currentUrl.substring(0, currentUrl.indexOf('/app/home')) +
        '/app/discoverCustomizationExamples';
      await browser.get(customizationUrl);
      await timePicker.setAbsoluteRange(TEST_START_TIME, TEST_END_TIME);
      await header.waitUntilLoadingHasFinished();
    });

    after(async () => {
      await kibanaServer.uiSettings.unset('defaultIndex');
      await kibanaServer.importExport.unload(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/logstash_functional');
      await kibanaServer.savedObjects.cleanStandardList();
    });

    it('Search bar', async () => {
      await testSubjects.click('logsViewSelectorButton');
      await testSubjects.click('logsViewSelectorOption-ASavedSearch');
      await header.waitUntilLoadingHasFinished();
      await retry.try(async () => {
        const { title, description } = await common.getSharedItemTitleAndDescription();
        const expected = {
          title: 'A Saved Search',
          description: 'A Saved Search Description',
        };
        expect(title).to.eql(expected.title);
        expect(description).to.eql(expected.description);
      });
      await browser.goBack();
      await header.waitUntilLoadingHasFinished();
    });
  });
};
