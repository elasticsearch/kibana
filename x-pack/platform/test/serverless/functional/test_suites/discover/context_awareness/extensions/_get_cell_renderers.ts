/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/context_awareness/extensions/_get_cell_renderers.ts

import kbnRison from '@kbn/rison';
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, discover, unifiedFieldList, svlCommonPage } = getPageObjects([
    'common',
    'discover',
    'unifiedFieldList',
    'svlCommonPage',
  ]);
  const testSubjects = getService('testSubjects');
  const dataViews = getService('dataViews');

  describe('extension getCellRenderers', () => {
    before(async () => {
      await svlCommonPage.loginAsAdmin();
    });

    describe('ES|QL mode', () => {
      describe('root profile', () => {
        it('should not render custom @timestamp', async () => {
          const state = kbnRison.encode({
            dataSource: { type: 'esql' },
            query: { esql: 'from my-example-* | sort @timestamp desc' },
          });
          await common.navigateToActualUrl('discover', `?_a=${state}`, {
            ensureCurrentUrl: false,
          });
          await discover.waitUntilSearchingHasFinished();
          const timestamps = await testSubjects.findAll('exampleRootProfileTimestamp', 2500);
          expect(timestamps).to.have.length(0);
        });
      });

      describe('data source profile', () => {
        it('should not render custom @timestamp or log.level', async () => {
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
          const timestamps = await testSubjects.findAll('exampleRootProfileTimestamp', 2500);
          expect(timestamps).to.have.length(0);
          const logLevels = await testSubjects.findAll('exampleDataSourceProfileLogLevel', 2500);
          expect(logLevels).to.have.length(0);
        });

        it('should not render custom @timestamp but should render custom log.level', async () => {
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
          const timestamps = await testSubjects.findAll('exampleRootProfileTimestamp', 2500);
          expect(timestamps).to.have.length(0);
          const logLevels = await testSubjects.findAll('exampleDataSourceProfileLogLevel');
          expect(logLevels).to.have.length(3);
          expect(await logLevels[0].getVisibleText()).to.be('Debug');
          expect(await logLevels[2].getVisibleText()).to.be('Info');
        });
      });
    });

    describe('data view mode', () => {
      describe('root profile', () => {
        it('should not render custom @timestamp', async () => {
          await common.navigateToActualUrl('discover', undefined, {
            ensureCurrentUrl: false,
          });
          await dataViews.switchTo('my-example-*');
          await discover.waitUntilSearchingHasFinished();
          const timestamps = await testSubjects.findAll('exampleRootProfileTimestamp', 2500);
          expect(timestamps).to.have.length(0);
        });
      });

      describe('data source profile', () => {
        it('should not render custom @timestamp or log.level', async () => {
          await common.navigateToActualUrl('discover', undefined, {
            ensureCurrentUrl: false,
          });
          await dataViews.switchTo('my-example-*');
          await discover.waitUntilSearchingHasFinished();
          await unifiedFieldList.clickFieldListItemAdd('@timestamp');
          await unifiedFieldList.clickFieldListItemAdd('log.level');
          const timestamps = await testSubjects.findAll('exampleRootProfileTimestamp', 2500);
          expect(timestamps).to.have.length(0);
          const logLevels = await testSubjects.findAll('exampleDataSourceProfileLogLevel', 2500);
          expect(logLevels).to.have.length(0);
        });

        it('should not render custom @timestamp but should render custom log.level', async () => {
          await common.navigateToActualUrl('discover', undefined, {
            ensureCurrentUrl: false,
          });
          await dataViews.switchTo('my-example-logs');
          await discover.waitUntilSearchingHasFinished();
          await unifiedFieldList.clickFieldListItemAdd('@timestamp');
          await unifiedFieldList.clickFieldListItemAdd('log.level');
          const timestamps = await testSubjects.findAll('exampleRootProfileTimestamp', 2500);
          expect(timestamps).to.have.length(0);
          const logLevels = await testSubjects.findAll('exampleDataSourceProfileLogLevel');
          expect(logLevels).to.have.length(3);
          expect(await logLevels[0].getVisibleText()).to.be('Debug');
          expect(await logLevels[2].getVisibleText()).to.be('Info');
        });
      });
    });
  });
}
