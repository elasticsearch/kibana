/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/discover/context_awareness/extensions/_get_cell_renderers.ts

import kbnRison from '@kbn/rison';
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, discover, unifiedFieldList } = getPageObjects([
    'common',
    'discover',
    'unifiedFieldList',
  ]);
  const testSubjects = getService('testSubjects');
  const dataViews = getService('dataViews');

  describe('extension getCellRenderers', () => {
    describe('ES|QL mode', () => {
      describe('root profile', () => {
        it('should render custom @timestamp', async () => {
          const state = kbnRison.encode({
            dataSource: { type: 'esql' },
            query: { esql: 'from my-example-* | sort @timestamp desc' },
          });
          await common.navigateToActualUrl('discover', `?_a=${state}`, {
            ensureCurrentUrl: false,
          });
          await discover.waitUntilSearchingHasFinished();
          const timestamps = await testSubjects.findAll('exampleRootProfileTimestamp');
          expect(timestamps).to.have.length(6);
          expect(await timestamps[0].getVisibleText()).to.be('2024-06-10T16:30:00.000Z');
          expect(await timestamps[5].getVisibleText()).to.be('2024-06-10T14:00:00.000Z');
        });
      });

      describe('data source profile', () => {
        it('should render custom @timestamp but not custom log.level', async () => {
          const state = kbnRison.encode({
            dataSource: { type: 'esql' },
            query: { esql: 'from my-example-* | sort @timestamp desc' },
          });
          await common.navigateToActualUrl('discover', `?_a=${state}`, {
            ensureCurrentUrl: false,
          });
          await discover.waitUntilSearchingHasFinished();
          await unifiedFieldList.clickFieldListItemAdd('@timestamp');
          await unifiedFieldList.clickFieldListItemAdd('log.level');
          const timestamps = await testSubjects.findAll('exampleRootProfileTimestamp');
          expect(timestamps).to.have.length(6);
          expect(await timestamps[0].getVisibleText()).to.be('2024-06-10T16:30:00.000Z');
          expect(await timestamps[5].getVisibleText()).to.be('2024-06-10T14:00:00.000Z');
          const logLevels = await testSubjects.findAll('exampleDataSourceProfileLogLevel', 2500);
          expect(logLevels).to.have.length(0);
        });

        it('should render custom @timestamp and custom log.level', async () => {
          const state = kbnRison.encode({
            dataSource: { type: 'esql' },
            query: { esql: 'from my-example-logs | sort @timestamp desc' },
          });
          await common.navigateToActualUrl('discover', `?_a=${state}`, {
            ensureCurrentUrl: false,
          });
          await discover.waitUntilSearchingHasFinished();
          await unifiedFieldList.clickFieldListItemAdd('@timestamp');
          await unifiedFieldList.clickFieldListItemAdd('log.level');
          const timestamps = await testSubjects.findAll('exampleRootProfileTimestamp');
          expect(timestamps).to.have.length(3);
          expect(await timestamps[0].getVisibleText()).to.be('2024-06-10T16:00:00.000Z');
          expect(await timestamps[2].getVisibleText()).to.be('2024-06-10T14:00:00.000Z');
          const logLevels = await testSubjects.findAll('exampleDataSourceProfileLogLevel');
          expect(logLevels).to.have.length(3);
          expect(await logLevels[0].getVisibleText()).to.be('Debug');
          expect(await logLevels[2].getVisibleText()).to.be('Info');
        });
      });
    });

    describe('data view mode', () => {
      describe('root profile', () => {
        it('should render custom @timestamp', async () => {
          await common.navigateToActualUrl('discover', undefined, {
            ensureCurrentUrl: false,
          });
          await dataViews.switchTo('my-example-*');
          await discover.waitUntilSearchingHasFinished();
          const timestamps = await testSubjects.findAll('exampleRootProfileTimestamp');
          expect(timestamps).to.have.length(6);
          expect(await timestamps[0].getVisibleText()).to.be('2024-06-10T16:30:00.000Z');
          expect(await timestamps[5].getVisibleText()).to.be('2024-06-10T14:00:00.000Z');
        });
      });

      describe('data source profile', () => {
        it('should render custom @timestamp but not custom log.level', async () => {
          await common.navigateToActualUrl('discover', undefined, {
            ensureCurrentUrl: false,
          });
          await dataViews.switchTo('my-example-*');
          await discover.waitUntilSearchingHasFinished();
          await unifiedFieldList.clickFieldListItemAdd('@timestamp');
          await unifiedFieldList.clickFieldListItemAdd('log.level');
          const timestamps = await testSubjects.findAll('exampleRootProfileTimestamp');
          expect(timestamps).to.have.length(6);
          expect(await timestamps[0].getVisibleText()).to.be('2024-06-10T16:30:00.000Z');
          expect(await timestamps[5].getVisibleText()).to.be('2024-06-10T14:00:00.000Z');
          const logLevels = await testSubjects.findAll('exampleDataSourceProfileLogLevel', 2500);
          expect(logLevels).to.have.length(0);
        });

        it('should render custom @timestamp and custom log.level', async () => {
          await common.navigateToActualUrl('discover', undefined, {
            ensureCurrentUrl: false,
          });
          await dataViews.switchTo('my-example-logs');
          await discover.waitUntilSearchingHasFinished();
          await unifiedFieldList.clickFieldListItemAdd('@timestamp');
          await unifiedFieldList.clickFieldListItemAdd('log.level');
          const timestamps = await testSubjects.findAll('exampleRootProfileTimestamp');
          expect(timestamps).to.have.length(3);
          expect(await timestamps[0].getVisibleText()).to.be('2024-06-10T16:00:00.000Z');
          expect(await timestamps[2].getVisibleText()).to.be('2024-06-10T14:00:00.000Z');
          const logLevels = await testSubjects.findAll('exampleDataSourceProfileLogLevel');
          expect(logLevels).to.have.length(3);
          expect(await logLevels[0].getVisibleText()).to.be('Debug');
          expect(await logLevels[2].getVisibleText()).to.be('Info');
        });
      });
    });
  });
}
