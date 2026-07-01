/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { partition } from 'lodash';
import type { FtrProviderContext } from '../../../ftr_provider_context';
import {
  type ScenarioIndexes,
  TEST_DOC_COUNT,
  getDataMapping,
  getDocsGenerator,
  setupScenarioRunner,
  sumFirstNValues,
} from '../tsdb_logsdb_helpers';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, lens, dashboard } = getPageObjects(['common', 'lens', 'dashboard']);
  const testSubjects = getService('testSubjects');
  const find = getService('find');
  const kibanaServer = getService('kibanaServer');
  const es = getService('es');
  const log = getService('log');
  const dataStreams = getService('dataStreams');
  const indexPatterns = getService('indexPatterns');
  const esArchiver = getService('esArchiver');
  const comboBox = getService('comboBox');

  const createDocs = getDocsGenerator(log, es, 'tsdb');

  describe('lens tsdb', function () {
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

    describe('downsampling', () => {
      const downsampleDataView: { index: string; dataView: string } = { index: '', dataView: '' };
      before(async () => {
        const downsampledTargetIndex = await dataStreams.downsampleTSDBIndex(tsdbIndex, {
          isStream: false,
        });
        downsampleDataView.index = downsampledTargetIndex;
        downsampleDataView.dataView = `${tsdbIndex},${downsampledTargetIndex}`;

        log.info(`creating a data view for "${downsampleDataView.dataView}"...`);
        await indexPatterns.create(
          {
            title: downsampleDataView.dataView,
            timeFieldName: '@timestamp',
          },
          { override: true }
        );
      });

      after(async () => {
        await es.indices.delete({ index: [downsampleDataView.index] });
      });

      describe('for regular metric', () => {
        it('defaults to median for non-rolled up metric', async () => {
          await common.navigateToApp('lens');
          await lens.switchDataPanelIndexPattern(tsdbDataView);
          await lens.waitForField('bytes_gauge');
          await lens.dragFieldToWorkspace('bytes_gauge', 'xyVisChart');
          expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel')).to.eql(
            'Median of bytes_gauge'
          );
        });

        it('does not show a warning', async () => {
          await lens.openDimensionEditor('lnsXY_yDimensionPanel');
          await testSubjects.missingOrFail('median-partial-warning');
          await lens.assertNoEditorWarning();
          await lens.closeDimensionEditor();
        });
      });

      describe('for rolled up metric (downsampled)', () => {
        it('defaults to average for rolled up metric', async () => {
          await lens.switchDataPanelIndexPattern(downsampleDataView.dataView);
          await lens.removeLayer();
          await lens.ensureLayerTabIsActive();
          await lens.waitForField('bytes_gauge');
          await lens.dragFieldToWorkspace('bytes_gauge', 'xyVisChart');
          expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel')).to.eql(
            'Average of bytes_gauge'
          );
        });
        it('shows warnings in editor when using median', async () => {
          await lens.openDimensionEditor('lnsXY_yDimensionPanel');
          await testSubjects.existOrFail('median-partial-warning');
          await testSubjects.click('lns-indexPatternDimension-median');
          await lens.waitForVisualization('xyVisChart');
          await lens.assertMessageListContains(
            'Median of bytes_gauge uses a function that is unsupported by rolled up data. Select a different function or change the time range.',
            'warning'
          );
        });
        it('shows warnings in dashboards as well', async () => {
          await lens.save('New', false, false, false, 'new');

          await dashboard.waitForRenderComplete();
          await lens.assertMessageListContains(
            'Median of bytes_gauge uses a function that is unsupported by rolled up data. Select a different function or change the time range.',
            'warning'
          );
        });
      });
    });

    describe('time series special field types support', () => {
      before(async () => {
        await common.navigateToApp('lens');
        await lens.switchDataPanelIndexPattern(tsdbDataView);
        await lens.goToTimeRange();
      });

      afterEach(async () => {
        await lens.removeLayer();
        await lens.ensureLayerTabIsActive();
      });

      // skip count for now as it's a special function and will
      // change automatically the unsupported field to Records when detected
      const allOperations = [
        'average',
        'max',
        'last_value',
        'median',
        'percentile',
        'percentile_rank',
        'standard_deviation',
        'sum',
        'unique_count',
      ];
      const counterFieldsSupportedOps = ['min', 'max', 'counter_rate', 'last_value'];
      const gaugeFieldsSupportedOps = allOperations;

      const operationsByFieldSupport = allOperations.map((name) => ({
        name,
        // Quick way to make it match the UI name
        label: `${name[0].toUpperCase()}${name.slice(1).replace('_', ' ')}`,
        counter: counterFieldsSupportedOps.includes(name),
        gauge: gaugeFieldsSupportedOps.includes(name),
      }));

      for (const fieldType of ['counter', 'gauge'] as const) {
        const [supportedOperations, unsupportedOperatons] = partition(
          operationsByFieldSupport,
          (op) => op[fieldType]
        );
        if (supportedOperations.length) {
          it(`should allow operations when supported by ${fieldType} field type`, async () => {
            // Counter rate requires a date histogram dimension configured to work
            await lens.configureDimension({
              dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
              operation: 'date_histogram',
              field: '@timestamp',
            });

            // minimum supports all tsdb field types
            await lens.configureDimension({
              dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
              operation: 'min',
              field: `bytes_${fieldType}`,
              keepOpen: true,
            });

            for (const supportedOp of supportedOperations) {
              // now check if the provided function has no incompatibility tooltip
              expect(
                testSubjects.exists(`lns-indexPatternDimension-${supportedOp.name} incompatible`, {
                  timeout: 500,
                })
              ).to.eql(supportedOp[fieldType]);
              // try to change to the provided function and check all is ok
              await lens.selectOperation(supportedOp.name);

              expect(
                await find.existsByCssSelector(
                  '[data-test-subj="indexPattern-field-selection-row"] .euiFormErrorText',
                  500
                )
              ).to.be(false);

              // return in a clean state before checking the next operation
              await lens.selectOperation('min');
            }
            await lens.closeDimensionEditor();
          });
        }
        if (unsupportedOperatons.length) {
          it(`should notify the incompatibility of unsupported operations for the ${fieldType} field type`, async () => {
            // Counter rate requires a date histogram dimension configured to work
            await lens.configureDimension({
              dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
              operation: 'date_histogram',
              field: '@timestamp',
            });

            // minimum supports all tsdb field types
            await lens.configureDimension({
              dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
              operation: 'min',
              field: `bytes_${fieldType}`,
              keepOpen: true,
            });

            for (const unsupportedOp of unsupportedOperatons) {
              // now check if the provided function has the incompatibility tooltip
              expect(
                testSubjects.exists(
                  `lns-indexPatternDimension-${unsupportedOp.name} incompatible`,
                  {
                    timeout: 500,
                  }
                )
              ).to.eql(!unsupportedOp[fieldType]);
              // try to change to the provided function and check if it's in an incompatibility state
              await lens.selectOperation(unsupportedOp.name, true);

              const fieldSelectErrorEl = await find.byCssSelector(
                '[data-test-subj="indexPattern-field-selection-row"] .euiFormErrorText',
                500
              );

              expect(await fieldSelectErrorEl.getVisibleText()).to.be(
                'This field does not work with the selected function.'
              );

              // return in a clean state before checking the next operation
              await lens.selectOperation('min');
            }
            await lens.closeDimensionEditor();
          });
        }
      }

      describe('show time series dimension groups within breakdown', () => {
        it('should show the time series dimension group on field picker when configuring a breakdown', async () => {
          await lens.configureDimension({
            dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
            operation: 'date_histogram',
            field: '@timestamp',
          });

          await lens.configureDimension({
            dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
            operation: 'min',
            field: 'bytes_counter',
          });

          await lens.configureDimension({
            dimension: 'lnsXY_splitDimensionPanel > lns-empty-dimension',
            operation: 'terms',
            keepOpen: true,
          });

          const list = await comboBox.getOptionsList('indexPattern-dimension-field');
          expect(list).to.contain('Time series dimensions');
          await lens.closeDimensionEditor();
        });

        it("should not show the time series dimension group on field picker if it's not a breakdown", async () => {
          await lens.configureDimension({
            dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
            operation: 'min',
            field: 'bytes_counter',
          });

          await lens.configureDimension({
            dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
            operation: 'date_histogram',
            keepOpen: true,
          });
          const list = await comboBox.getOptionsList('indexPattern-dimension-field');
          expect(list).to.not.contain('Time series dimensions');
          await lens.closeDimensionEditor();
        });
      });
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

      describe('Data-stream upgraded to TSDB scenarios', () => {
        const streamIndex = 'data_stream';
        // rollover does not allow to change name, it will just change backing index underneath
        const streamConvertedToTsdbIndex = streamIndex;

        before(async () => {
          log.info(`Creating "${streamIndex}" data stream...`);
          await dataStreams.createDataStream(
            streamIndex,
            getDataMapping({ mode: 'tsdb' }),
            undefined
          );

          // add some data to the stream
          await createDocs(streamIndex, { isStream: true }, fromTimeForScenarios);

          log.info(`Update settings for "${streamIndex}" dataView...`);
          await kibanaServer.uiSettings.update({
            'dateFormat:tz': 'UTC',
            'timepicker:timeDefaults': '{ "from": "now-1y", "to": "now" }',
          });
          log.info(`Upgrade "${streamIndex}" stream to TSDB...`);

          const tsdbMapping = getDataMapping({ mode: 'tsdb' });
          await dataStreams.upgradeStream(streamIndex, tsdbMapping, 'tsdb');
          log.info(
            `Add more data to new "${streamConvertedToTsdbIndex}" dataView (now with TSDB backing index)...`
          );
          // add some more data when upgraded
          await createDocs(streamConvertedToTsdbIndex, { isStream: true }, toTimeForScenarios);
        });

        after(async () => {
          await dataStreams.deleteDataStream(streamIndex);
        });

        runTestsForEachScenario(streamConvertedToTsdbIndex, 'tsdb', (indexes) => {
          it('should detect the data stream has now been upgraded to TSDB', async () => {
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
            ).to.eql(false);
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
            // the first/last bars still cover the whole time range as asserted below.
            await testSubjects.setEuiSwitch('indexPattern-include-empty-rows', 'check');
            await lens.closeDimensionEditor();

            // check the counter field works
            await lens.configureDimension({
              dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
              operation: 'min',
              field: `bytes_counter`,
            });
            // and also that the count of documents should be "indexes.length" times overall
            await lens.configureDimension({
              dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
              operation: 'count',
            });

            await lens.waitForVisualization('xyVisChart');
            const data = await lens.getCurrentChartDebugState('xyVisChart');
            const counterBars = data?.bars![0].bars;
            const countBars = data?.bars![1].bars;

            log.info('Check counter data before the upgrade');
            // check there's some data before the upgrade
            expect(counterBars?.[0].y).to.eql(5000);
            log.info('Check counter data after the upgrade');
            // check there's some data after the upgrade
            expect(counterBars?.[counterBars.length - 1].y).to.eql(5000);

            // due to the flaky nature of exact check here, we're going to relax it
            // as long as there's data before and after it is ok
            log.info('Check count before the upgrade');
            const columnsToCheck = countBars ? countBars.length / 2 : 0;
            // Before the upgrade the count is N times the indexes
            expect(sumFirstNValues(columnsToCheck, countBars)).to.be.greaterThan(
              indexes.length * TEST_DOC_COUNT - 1
            );
            log.info('Check count after the upgrade');
            // later there are only documents for the upgraded stream
            expect(
              sumFirstNValues(columnsToCheck, [...(countBars ?? [])].reverse())
            ).to.be.greaterThan(TEST_DOC_COUNT - 1);
          });
        });
      });
    });
  });
}
