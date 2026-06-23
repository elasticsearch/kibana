/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/context_awareness/_framework.ts

import kbnRison from '@kbn/rison';
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, discover, svlCommonPage } = getPageObjects([
    'common',
    'discover',
    'svlCommonPage',
  ]);
  const testSubjects = getService('testSubjects');
  const dataViews = getService('dataViews');
  const dataGrid = getService('dataGrid');
  const retry = getService('retry');

  describe('framework', () => {
    before(async () => {
      await svlCommonPage.loginAsAdmin();
    });

    describe('ES|QL mode', () => {
      describe('custom context', () => {
        it('should render formatted record in doc viewer using formatter from custom context', async () => {
          const state = kbnRison.encode({
            dataSource: { type: 'esql' },
            query: { esql: 'from my-example-logs | sort @timestamp desc' },
          });
          await common.navigateToActualUrl('discover', `?_a=${state}`, {
            ensureCurrentUrl: false,
          });
          await discover.waitUntilSearchingHasFinished();
          await dataGrid.clickRowToggle({ rowIndex: 0, defaultTabId: 'doc_view_example' });
          await retry.try(async () => {
            const formattedRecord = await testSubjects.find(
              'exampleDataSourceProfileDocViewRecord'
            );
            expect(await formattedRecord.getVisibleText()).to.be(
              JSON.stringify(
                {
                  '@timestamp': '2024-06-10T16:00:00.000Z',
                  'agent.name': 'java',
                  'agent.name.text': 'java',
                  'data_stream.type': 'logs',
                  'log.level': 'debug',
                  message: 'This is a debug log',
                  'service.name': 'product',
                  'service.name.text': 'product',
                },
                null,
                2
              )
            );
          });
        });
      });
    });

    describe('data view mode', () => {
      describe('custom context', () => {
        it('should render formatted record in doc viewer using formatter from custom context', async () => {
          await common.navigateToActualUrl('discover', undefined, {
            ensureCurrentUrl: false,
          });
          await discover.waitUntilSearchingHasFinished();
          await dataViews.switchToAndValidate('my-example-logs');
          await discover.waitUntilSearchingHasFinished();
          await dataGrid.clickRowToggle({ rowIndex: 0, defaultTabId: 'doc_view_example' });
          await retry.try(async () => {
            const formattedRecord = await testSubjects.find(
              'exampleDataSourceProfileDocViewRecord'
            );
            expect(await formattedRecord.getVisibleText()).to.be(
              JSON.stringify(
                {
                  '@timestamp': ['2024-06-10T16:00:00.000Z'],
                  'agent.name': ['java'],
                  'agent.name.text': ['java'],
                  'data_stream.type': ['logs'],
                  'log.level': ['debug'],
                  message: ['This is a debug log'],
                  'service.name': ['product'],
                  'service.name.text': ['product'],
                  _id: 'XdQFDpABfGznVC1bCHLo',
                  _index: 'my-example-logs',
                  _score: null,
                },
                null,
                2
              )
            );
          });
        });
      });
    });
  });
}
