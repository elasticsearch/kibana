/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Everything else in this suite has been migrated to Scout, under
 * src/platform/plugins/shared/discover/test/scout/esql/ui/parallel_tests/.
 *
 * The one test below could not be migrated. It relies on
 * `window.ELASTIC_ESQL_DELAY_SECONDS`, which injects an Elasticsearch `error_query`
 * filter with `stall_time_seconds`. Under that stall the query returns warnings, the
 * histogram renders empty and the visualization request is never issued, so the
 * inspector shows one entry instead of two — reproduced with delays of 5s/3s/2s, with
 * and without a chart warm-up, and with the exact rison starting state below. It is
 * kept here until there is either a product fix or a decision to accept the gap.
 * See test/scout/migration-review-esql_2-2026-09-10.md ("Tests to drop").
 */

import expect from '@kbn/expect';
import kbnRison from '@kbn/rison';
import type { FtrProviderContext } from '../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const log = getService('log');
  const testSubjects = getService('testSubjects');
  const monacoEditor = getService('monacoEditor');
  const security = getService('security');
  const inspector = getService('inspector');
  const browser = getService('browser');

  const { common, discover, timePicker } = getPageObjects(['common', 'discover', 'timePicker']);

  const defaultSettings = {
    defaultIndex: 'logstash-*',
    enableESQL: true,
  };

  describe('discover esql view', function () {
    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await security.testUser.setRoles([
        'kibana_admin',
        'test_logstash_reader',
        'kibana_sample_read',
      ]);
      log.debug('load kibana index with default index pattern');
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      // and load a set of makelogs data
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await esArchiver.load(
        'src/platform/test/functional/fixtures/es_archiver/kibana_sample_data_flights'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/kibana_sample_data_flights_index_pattern'
      );
      await kibanaServer.uiSettings.replace(defaultSettings);
      await timePicker.setDefaultAbsoluteRangeViaUiSettings();
      await common.navigateToApp('discover');
      await discover.waitUntilTabIsLoaded();
    });

    after(async () => {
      await timePicker.resetDefaultAbsoluteRangeViaUiSettings();
    });

    describe('inspector', () => {
      beforeEach(async () => {
        await common.navigateToApp('discover');
        await discover.waitUntilTabIsLoaded();
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
      });

      describe('with slow queries', () => {
        it('should show only one entry in inspector for table/visualization', async function () {
          const state = kbnRison.encode({
            dataSource: { type: 'esql' },
            query: { esql: 'from kibana_sample_data_flights' },
          });
          await common.navigateToActualUrl('discover', `?_a=${state}`, {
            ensureCurrentUrl: false,
          });
          await discover.selectTextBaseLang();
          await discover.waitUntilTabIsLoaded();
          const testQuery = `from logstash-* | limit 10`;
          await monacoEditor.setCodeEditorValue(testQuery);

          await browser.execute(() => {
            window.ELASTIC_ESQL_DELAY_SECONDS = 5;
          });
          await testSubjects.click('querySubmitButton');
          await discover.waitUntilTabIsLoaded();
          // for some reason the chart query is taking a very long time to return (3x the delay)
          // so wait for the chart to be loaded
          await discover.waitForChartLoadingComplete(1);
          await browser.execute(() => {
            window.ELASTIC_ESQL_DELAY_SECONDS = undefined;
          });

          await discover.openInspectorFromTabMenu();
          const requestNames = (await inspector.getRequestNames()).split(',');
          const requestTotalTime = await inspector.getRequestTotalTime();
          expect(requestTotalTime).to.be.greaterThan(5000);
          expect(requestNames.length).to.be(2);
          expect(requestNames).to.contain('Table');
          expect(requestNames).to.contain('Visualization');
        });
      });
    });
  });
}
