/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/examples/search/warnings.ts
import type { estypes } from '@elastic/elasticsearch';
import expect from '@kbn/expect';
import assert from 'assert';
import type { FtrProviderContext } from '../../functional/ftr_provider_context';

// eslint-disable-next-line import/no-default-export
export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const PageObjects = getPageObjects(['common', 'timePicker']);
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');
  const es = getService('es');
  const log = getService('log');
  const indexPatterns = getService('indexPatterns');
  const comboBox = getService('comboBox');
  const kibanaServer = getService('kibanaServer');
  const esArchiver = getService('esArchiver');
  const monacoEditor = getService('monacoEditor');
  const toasts = getService('toasts');

  describe('handling warnings with search source fetch', function () {
    const dataViewTitle = 'sample-01,sample-01-rollup';
    const fromTime = 'Jun 17, 2022 @ 00:00:00.000';
    const toTime = 'Jun 23, 2022 @ 00:00:00.000';
    const testArchive = 'src/platform/test/functional/fixtures/es_archiver/search/downsampled';
    const testIndex = 'sample-01';
    const testRollupIndex = 'sample-01-rollup';
    const testRollupField = 'kubernetes.container.memory.usage.bytes';
    const shardFailureType = 'unsupported_aggregation_on_downsampled_index';
    const shardFailureReason = `Field [${testRollupField}] of type [aggregate_metric_double] is not supported for aggregation [percentiles]`;

    const getTestJson = async (tabTestSubj: string, codeTestSubj: string) => {
      log.info(`switch to ${tabTestSubj} tab...`);
      await testSubjects.click(tabTestSubj);
      const block = await testSubjects.find(codeTestSubj);
      const testText = (await block.getVisibleText()).trim();
      return testText && JSON.parse(testText);
    };

    before(async () => {
      // create rollup data
      log.info(`loading ${testIndex} index...`);
      await esArchiver.loadIfNeeded(testArchive);
      log.info(`add write block to ${testIndex} index...`);
      await es.indices.addBlock({ index: testIndex, block: 'write' });
      try {
        log.info(`rolling up ${testIndex} index...`);
        // es client currently does not have method for downsample
        await es.transport.request<void>({
          method: 'POST',
          path: '/sample-01/_downsample/sample-01-rollup',
          body: { fixed_interval: '1h' },
        });
      } catch (err) {
        log.info(`ignoring resource_already_exists_exception...`);
        if (!err.message.match(/resource_already_exists_exception/)) {
          throw err;
        }
      }

      log.info(`creating ${dataViewTitle} data view...`);
      await indexPatterns.create(
        {
          title: dataViewTitle,
          timeFieldName: '@timestamp',
        },
        { override: true }
      );
      await kibanaServer.uiSettings.update({
        'dateFormat:tz': 'UTC',
        defaultIndex: '0ae0bc7a-e4ca-405c-ab67-f2b5913f2a51',
        'timepicker:timeDefaults': '{ "from": "now-1y", "to": "now" }',
      });

      await PageObjects.common.navigateToApp('searchExamples');
    });

    beforeEach(async () => {
      await comboBox.setCustom('dataViewSelector', dataViewTitle);
      await comboBox.set('searchMetricField', testRollupField);
      await PageObjects.timePicker.setAbsoluteRange(fromTime, toTime);
    });

    after(async () => {
      await es.indices.delete({ index: [testIndex, testRollupIndex] });
      await kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.uiSettings.replace({});
    });

    afterEach(async () => {
      await toasts.dismissAll();
    });

    it('should show search warnings as toasts', async () => {
      await testSubjects.click('searchSourceWithOther');

      await retry.try(async () => {
        expect(await toasts.getCount()).to.be(2);
        await testSubjects.click('viewWarningBtn');
      });

      // request
      await retry.try(async () => {
        await testSubjects.click('inspectorRequestDetailRequest');
        const requestText = await monacoEditor.getCodeEditorValue(0);
        expect(requestText).to.contain(testRollupField);
      });

      // response
      await retry.try(async () => {
        await testSubjects.click('inspectorRequestDetailResponse');
        const responseText = await monacoEditor.getCodeEditorValue(0);
        expect(responseText).to.contain(shardFailureReason);
      });

      await testSubjects.click('euiFlyoutCloseButton');

      // wait for response - toasts appear before the response is rendered
      let response: estypes.SearchResponse | undefined;
      await retry.try(async () => {
        response = await getTestJson('responseTab', 'responseCodeBlock');
        expect(response).not.to.eql({});
      });

      // response tab
      assert(response && response._shards.failures);
      expect(response._shards.total).to.be(4);
      expect(response._shards.successful).to.be(2);
      expect(response._shards.skipped).to.be(0);
      expect(response._shards.failed).to.be(2);
      expect(response._shards.failures.length).to.equal(1);
      expect(response._shards.failures[0].index).to.equal(testRollupIndex);
      expect(response._shards.failures[0].reason.type).to.equal(shardFailureType);
      expect(response._shards.failures[0].reason.reason).to.equal(shardFailureReason);

      // warnings tab
      const warnings = await getTestJson('warningsTab', 'warningsCodeBlock');
      expect(warnings).to.eql([]);
    });

    it('should show search warnings in results tab', async () => {
      await testSubjects.click('searchSourceWithoutOther');

      // wait for toasts - toasts appear after the response is rendered
      await retry.try(async () => {
        expect(await toasts.getCount()).to.be(2);
      });

      // warnings tab
      const warnings = await getTestJson('warningsTab', 'warningsCodeBlock');
      expect(warnings.length).to.be(1);
      expect(warnings[0].type).to.be('incomplete');
    });
  });
}
