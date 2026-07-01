/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import moment from 'moment';
import type { FtrProviderContext } from '../../../ftr_provider_context';
import {
  type ScenarioIndexes,
  TEST_DOC_COUNT,
  TIME_PICKER_FORMAT,
  getDataMapping,
  getDocsGenerator,
  setupScenarioRunner,
  sumFirstNValues,
} from '../tsdb_logsdb_helpers';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { lens } = getPageObjects(['common', 'lens']);
  const testSubjects = getService('testSubjects');
  const kibanaServer = getService('kibanaServer');
  const es = getService('es');
  const log = getService('log');
  const dataStreams = getService('dataStreams');
  const indexPatterns = getService('indexPatterns');
  const esArchiver = getService('esArchiver');

  const createDocs = getDocsGenerator(log, es, 'tsdb');

  describe('lens tsdb downgrade', function () {
    const tsdbIndex = 'kibana_sample_data_logstsdb';
    const tsdbDataView = tsdbIndex;
    const tsdbEsArchive =
      'src/platform/test/functional/fixtures/es_archiver/kibana_sample_data_logs_tsdb';
    const fromTime = 'Apr 16, 2023 @ 00:00:00.000';
    const toTime = 'Jun 16, 2023 @ 00:00:00.000';

    before(async () => {
      log.info(`loading ${tsdbIndex} index...`);
      await esArchiver.loadIfNeeded(tsdbEsArchive);
      log.info(`creating a data view for "${tsdbDataView}"...`);
      await indexPatterns.create(
        {
          title: tsdbDataView,
          timeFieldName: '@timestamp',
        },
        { override: true }
      );
      log.info(`updating settings to use the "${tsdbDataView}" dataView...`);
      await kibanaServer.uiSettings.update({
        'dateFormat:tz': 'UTC',
        defaultIndex: '0ae0bc7a-e4ca-405c-ab67-f2b5913f2a51',
        'timepicker:timeDefaults': `{ "from": "${fromTime}", "to": "${toTime}" }`,
      });
    });

    after(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.uiSettings.replace({});
      await es.indices.delete({ index: [tsdbIndex] });
    });

    describe('Scenarios with changing stream type', () => {
      const getScenarios = (
        initialIndex: string
      ): Array<{
        name: string;
        indexes: ScenarioIndexes[];
      }> => [
        {
          name: 'Dataview with no additional stream/index',
          indexes: [{ index: initialIndex }],
        },
        {
          name: 'Dataview with an additional regular index',
          indexes: [
            { index: initialIndex },
            { index: 'regular_index', create: true, removeTSDBFields: true },
          ],
        },
        {
          name: 'Dataview with an additional downsampled TSDB stream',
          indexes: [
            { index: initialIndex },
            { index: 'tsdb_index_2', create: true, mode: 'tsdb', downsample: true },
          ],
        },
        {
          name: 'Dataview with additional regular index and a downsampled TSDB stream',
          indexes: [
            { index: initialIndex },
            { index: 'regular_index', create: true, removeTSDBFields: true },
            { index: 'tsdb_index_2', create: true, mode: 'tsdb', downsample: true },
          ],
        },
        {
          name: 'Dataview with an additional TSDB stream',
          indexes: [{ index: initialIndex }, { index: 'tsdb_index_2', create: true, mode: 'tsdb' }],
        },
      ];

      const { runTestsForEachScenario, toTimeForScenarios, fromTimeForScenarios } =
        setupScenarioRunner(getService, getPageObjects, getScenarios);

      describe('TSDB downgraded to regular data stream scenarios', () => {
        const tsdbStream = 'tsdb_stream_dowgradable';
        // rollover does not allow to change name, it will just change backing index underneath
        const tsdbConvertedToStream = tsdbStream;

        before(async () => {
          log.info(`Creating "${tsdbStream}" data stream...`);
          await dataStreams.createDataStream(tsdbStream, getDataMapping({ mode: 'tsdb' }), 'tsdb');

          // add some data to the stream
          await createDocs(tsdbStream, { isStream: true }, fromTimeForScenarios);

          log.info(`Update settings for "${tsdbStream}" dataView...`);
          await kibanaServer.uiSettings.update({
            'dateFormat:tz': 'UTC',
            'timepicker:timeDefaults': '{ "from": "now-1y", "to": "now" }',
          });
          log.info(
            `Dowgrade "${tsdbStream}" stream into regular stream "${tsdbConvertedToStream}"...`
          );

          await dataStreams.downgradeStream(tsdbStream, getDataMapping({ mode: 'tsdb' }), 'tsdb');
          log.info(`Add more data to new "${tsdbConvertedToStream}" dataView (no longer TSDB)...`);
          // add some more data when upgraded
          await createDocs(tsdbConvertedToStream, { isStream: true }, toTimeForScenarios);
        });

        after(async () => {
          await dataStreams.deleteDataStream(tsdbConvertedToStream);
        });

        runTestsForEachScenario(tsdbConvertedToStream, 'tsdb', (indexes) => {
          it('should keep TSDB restrictions only if a tsdb stream is in the dataView mix', async () => {
            await lens.configureDimension({
              dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
              operation: 'date_histogram',
              field: '@timestamp',
            });

            await lens.configureDimension({
              dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
              operation: 'min',
              field: `bytes_counter`,
              keepOpen: true,
            });

            expect(
              testSubjects.exists(`lns-indexPatternDimension-average incompatible`, {
                timeout: 500,
              })
            ).to.eql(indexes.some(({ mode }) => mode === 'tsdb'));
            await lens.closeDimensionEditor();
          });

          it(`should visualize a date histogram chart for counter field`, async () => {
            await lens.configureDimension({
              dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
              operation: 'date_histogram',
              field: '@timestamp',
              keepOpen: true,
            });
            // Bar charts default "Include empty rows" off; keep the empty buckets so
            // the before/after-downgrade halves still span the whole time range.
            await testSubjects.setEuiSwitch('indexPattern-include-empty-rows', 'check');
            await lens.closeDimensionEditor();
            // just check the data is shown
            await lens.configureDimension({
              dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
              operation: 'count',
            });

            await lens.waitForVisualization('xyVisChart');
            const data = await lens.getCurrentChartDebugState('xyVisChart');
            const bars = data?.bars![0].bars;
            const columnsToCheck = bars ? bars.length / 2 : 0;
            // due to the flaky nature of exact check here, we're going to relax it
            // as long as there's data before and after it is ok
            log.info('Check count before the downgrade');
            // Before the upgrade the count is N times the indexes
            expect(sumFirstNValues(columnsToCheck, bars)).to.be.greaterThan(
              indexes.length * TEST_DOC_COUNT - 1
            );
            log.info('Check count after the downgrade');
            // later there are only documents for the upgraded stream
            expect(sumFirstNValues(columnsToCheck, [...(bars ?? [])].reverse())).to.be.greaterThan(
              TEST_DOC_COUNT - 1
            );
          });

          it('should visualize data when moving the time window around the downgrade moment', async () => {
            // check after the downgrade
            await lens.goToTimeRange(
              moment
                .utc(fromTimeForScenarios, TIME_PICKER_FORMAT)
                .subtract(1, 'hour')
                .format(TIME_PICKER_FORMAT),
              moment
                .utc(fromTimeForScenarios, TIME_PICKER_FORMAT)
                .add(1, 'hour')
                .format(TIME_PICKER_FORMAT) // consider only new documents
            );

            await lens.configureDimension({
              dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
              operation: 'date_histogram',
              field: '@timestamp',
            });
            await lens.configureDimension({
              dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
              operation: 'count',
            });

            await lens.waitForVisualization('xyVisChart');
            const dataBefore = await lens.getCurrentChartDebugState('xyVisChart');
            const barsBefore = dataBefore?.bars![0].bars;
            expect(barsBefore?.some(({ y }) => y)).to.eql(true);

            // check after the downgrade
            await lens.goToTimeRange(
              moment
                .utc(toTimeForScenarios, TIME_PICKER_FORMAT)
                .add(1, 'second')
                .format(TIME_PICKER_FORMAT),
              moment
                .utc(toTimeForScenarios, TIME_PICKER_FORMAT)
                .add(2, 'hour')
                .format(TIME_PICKER_FORMAT) // consider also new documents
            );

            await lens.waitForVisualization('xyVisChart');
            const dataAfter = await lens.getCurrentChartDebugState('xyVisChart');
            const barsAfter = dataAfter?.bars![0].bars;
            expect(barsAfter?.some(({ y }) => y)).to.eql(true);
          });
        });
      });
    });
  });
}
