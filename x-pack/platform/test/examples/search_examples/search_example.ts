/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/examples/search_examples/search_example.ts
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../functional/ftr_provider_context';

// eslint-disable-next-line import/no-default-export
export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const PageObjects = getPageObjects(['common', 'timePicker']);
  const retry = getService('retry');
  const comboBox = getService('comboBox');
  const toasts = getService('toasts');

  describe('Search example', () => {
    describe('with bfetch', () => {
      testSearchExample();
    });

    describe('no bfetch', () => {
      const kibanaServer = getService('kibanaServer');
      before(async () => {
        await kibanaServer.uiSettings.replace({
          'bfetch:disable': true,
        });
      });
      after(async () => {
        await kibanaServer.uiSettings.unset('bfetch:disable');
      });

      testSearchExample();
    });

    const appId = 'searchExamples';

    function testSearchExample() {
      before(async function () {
        await PageObjects.common.navigateToApp(appId, { insertTimestamp: false });
        await comboBox.setCustom('dataViewSelector', 'logstash-*');
        await comboBox.set('searchBucketField', 'geo.src');
        await comboBox.set('searchMetricField', 'memory');
        await PageObjects.timePicker.setAbsoluteRange(
          'Mar 1, 2015 @ 00:00:00.000',
          'Nov 1, 2015 @ 00:00:00.000'
        );
      });

      beforeEach(async () => {
        await toasts.dismissAll();
        await retry.waitFor('toasts gone', async () => {
          return (await toasts.getCount()) === 0;
        });
      });

      it('should have an other bucket', async () => {
        await testSubjects.click('searchSourceWithOther');
        await testSubjects.click('responseTab');
        const codeBlock = await testSubjects.find('responseCodeBlock');
        await retry.waitFor('get code block', async () => {
          const visibleText = await codeBlock.getVisibleText();
          const parsedResponse = JSON.parse(visibleText);
          const buckets = parsedResponse.aggregations[1].buckets;
          return (
            buckets.length === 3 && buckets[2].key === '__other__' && buckets[2].doc_count === 9039
          );
        });
      });

      it('should not have an other bucket', async () => {
        await testSubjects.click('searchSourceWithoutOther');
        await testSubjects.click('responseTab');
        const codeBlock = await testSubjects.find('responseCodeBlock');
        await retry.waitFor('get code block', async () => {
          const visibleText = await codeBlock.getVisibleText();
          const parsedResponse = JSON.parse(visibleText);
          const buckets = parsedResponse.aggregations[1].buckets;
          return buckets.length === 2;
        });
      });

      it('should handle warnings', async () => {
        await testSubjects.click('searchWithWarning');
        await retry.waitFor('', async () => {
          const toastCount = await toasts.getCount();
          return toastCount > 1;
        });
        const warningToast = await toasts.getElementByIndex(2);
        const textEl = await warningToast.findByTestSubject('euiToastBody');
        const text: string = await textEl.getVisibleText();
        expect(text).to.contain('Watch out!');
      });
    }
  });
}
