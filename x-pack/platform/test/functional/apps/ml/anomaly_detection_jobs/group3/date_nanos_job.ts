/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../ftr_provider_context';
import type { PickFieldsConfig, DatafeedConfig, Detector } from '../types';

export default function ({ getService }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const ml = getService('ml');

  const defaultValues = {
    datafeedQuery: `{
  "bool": {
    "must": [
      {
        "match_all": {}
      }
    ]
  }
}`,
    queryDelay: '60s',
    frequency: '450s',
    scrollSize: '1000',
  };

  const testDataList = [
    {
      suiteTitle: 'with count detector and model plot disabled',
      jobSource: 'ft_event_rate_gen_trend_nanos',
      jobId: `event_rate_nanos_count_1_${Date.now()}`,
      jobDescription:
        'Create advanced job based on the event rate dataset with a date_nanos time field, 1d bucketspan and count',
      jobGroups: ['automated', 'event-rate', 'date-nanos'],
      pickFieldsConfig: {
        detectors: [
          {
            identifier: 'count',
            function: 'count',
            description: 'event rate',
          } as Detector,
        ],
        summaryCountField: 'count',
        influencers: [],
        bucketSpan: '1d',
        memoryLimit: '10mb',
      } as PickFieldsConfig,
      datafeedConfig: {} as DatafeedConfig,
      expected: {
        wizard: {
          timeField: '@timestamp',
        },
        row: {
          recordCount: '105,120',
          memoryStatus: 'ok',
          datafeedState: 'stopped',
          latestTimestamp: '2016-01-01 00:00:00',
        },
        counts: {
          processed_record_count: '105,120',
          processed_field_count: '105,120',
          input_bytes: '4.2 MB',
          input_field_count: '105,120',
          invalid_date_count: '0',
          missing_field_count: '0',
          out_of_order_timestamp_count: '0',
          empty_bucket_count: '0',
          sparse_bucket_count: '0',
          bucket_count: '365',
          earliest_record_timestamp: '2015-01-01 00:10:00',
          latest_record_timestamp: '2016-01-01 00:00:00',
          input_record_count: '105,120',
          latest_bucket_timestamp: '2016-01-01 00:00:00',
        },
        modelSizeStats: {
          result_type: 'model_size_stats',
          model_bytes_exceeded: '0.0 B',
          total_by_field_count: '3',
          total_over_field_count: '0',
          total_partition_field_count: '2',
          bucket_allocation_failures_count: '0',
          memory_status: 'ok',
          timestamp: '2015-12-31 00:00:00',
        },
      },
    },
  ];

  describe('job on data set with date_nanos time field', function () {
    this.tags(['ml']);
    before(async () => {
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/event_rate_nanos'
      );
      await ml.testResources.createDataViewIfNeeded('ft_event_rate_gen_trend_nanos', '@timestamp');
      await ml.testResources.setKibanaTimeZoneToUTC();
      await ml.securityUI.loginAsMlPowerUser();
    });

    after(async () => {
      await ml.api.cleanMlIndices();
      await ml.testResources.deleteDataViewByTitle('ft_event_rate_gen_trend_nanos');
    });

    for (const testData of testDataList) {
      describe(`${testData.suiteTitle}`, function () {
        it('loads the advanced wizard for the source data', async () => {
          await ml.testExecution.logTestStep('job creation loads the job management page');
          await ml.navigation.navigateToStackManagementMlSection(
            'anomaly_detection',
            'ml-jobs-list'
          );

          await ml.testExecution.logTestStep(
            'job creation loads the new job source selection page'
          );
          await ml.jobManagement.navigateToNewJobSourceSelection();

          await ml.testExecution.logTestStep('job creation loads the job type selection page');
          await ml.jobSourceSelection.selectSourceForAnomalyDetectionJob(testData.jobSource);

          await ml.testExecution.logTestStep('job creation loads the advanced job wizard page');
          await ml.jobTypeSelection.selectAdvancedJob();
        });

        it('navigates through the advanced wizard and sets all needed fields', async () => {
          await ml.testExecution.logTestStep('job creation displays the configure datafeed step');
          await ml.jobWizardCommon.assertConfigureDatafeedSectionExists();

          await ml.testExecution.logTestStep('job creation pre-fills the datafeed query editor');
          await ml.jobWizardAdvanced.assertDatafeedQueryEditorExists();
          await ml.jobWizardAdvanced.assertDatafeedQueryEditorValue(defaultValues.datafeedQuery);

          await ml.testExecution.logTestStep('job creation inputs the query delay');
          await ml.jobWizardAdvanced.assertQueryDelayInputExists();
          await ml.jobWizardAdvanced.assertQueryDelayValue(defaultValues.queryDelay);
          if (Object.hasOwn(testData.datafeedConfig, 'queryDelay')) {
            await ml.jobWizardAdvanced.setQueryDelay(testData.datafeedConfig.queryDelay!);
          }

          await ml.testExecution.logTestStep('job creation inputs the frequency');
          await ml.jobWizardAdvanced.assertFrequencyInputExists();
          await ml.jobWizardAdvanced.assertFrequencyValue(defaultValues.frequency);
          if (Object.hasOwn(testData.datafeedConfig, 'frequency')) {
            await ml.jobWizardAdvanced.setFrequency(testData.datafeedConfig.frequency!);
          }

          await ml.testExecution.logTestStep('job creation inputs the scroll size');
          await ml.jobWizardAdvanced.assertScrollSizeInputExists();
          await ml.jobWizardAdvanced.assertScrollSizeValue(defaultValues.scrollSize);
          if (Object.hasOwn(testData.datafeedConfig, 'scrollSize')) {
            await ml.jobWizardAdvanced.setScrollSize(testData.datafeedConfig.scrollSize!);
          }

          await ml.testExecution.logTestStep('ob creation pre-fills the time field');
          await ml.jobWizardAdvanced.assertTimeFieldInputExists();
          await ml.jobWizardAdvanced.assertTimeFieldSelection([testData.expected.wizard.timeField]);

          await ml.testExecution.logTestStep('job creation displays the pick fields step');
          await ml.jobWizardCommon.advanceToPickFieldsSection();

          await ml.testExecution.logTestStep('job creation selects the summary count field');
          await ml.jobWizardAdvanced.assertSummaryCountFieldInputExists();
          if (Object.hasOwn(testData.pickFieldsConfig, 'summaryCountField')) {
            await ml.jobWizardAdvanced.selectSummaryCountField(
              testData.pickFieldsConfig.summaryCountField!
            );
          } else {
            await ml.jobWizardAdvanced.assertSummaryCountFieldSelection([]);
          }

          await ml.testExecution.logTestStep('job creation adds detectors');
          for (const detector of testData.pickFieldsConfig.detectors) {
            await ml.jobWizardAdvanced.openCreateDetectorModal();
            await ml.jobWizardAdvanced.assertDetectorFunctionInputExists();
            await ml.jobWizardAdvanced.assertDetectorFunctionSelection([]);
            await ml.jobWizardAdvanced.assertDetectorFieldInputExists();
            await ml.jobWizardAdvanced.assertDetectorFieldSelection([]);
            await ml.jobWizardAdvanced.assertDetectorByFieldInputExists();
            await ml.jobWizardAdvanced.assertDetectorByFieldSelection([]);
            await ml.jobWizardAdvanced.assertDetectorOverFieldInputExists();
            await ml.jobWizardAdvanced.assertDetectorOverFieldSelection([]);
            await ml.jobWizardAdvanced.assertDetectorPartitionFieldInputExists();
            await ml.jobWizardAdvanced.assertDetectorPartitionFieldSelection([]);
            await ml.jobWizardAdvanced.assertDetectorExcludeFrequentInputExists();
            await ml.jobWizardAdvanced.assertDetectorExcludeFrequentSelection([]);
            await ml.jobWizardAdvanced.assertDetectorDescriptionInputExists();
            await ml.jobWizardAdvanced.assertDetectorDescriptionValue('');

            await ml.jobWizardAdvanced.selectDetectorFunction(detector.function);
            if (Object.hasOwn(detector, 'field')) {
              await ml.jobWizardAdvanced.selectDetectorField(detector.field!);
            }
            if (Object.hasOwn(detector, 'byField')) {
              await ml.jobWizardAdvanced.selectDetectorByField(detector.byField!);
            }
            if (Object.hasOwn(detector, 'overField')) {
              await ml.jobWizardAdvanced.selectDetectorOverField(detector.overField!);
            }
            if (Object.hasOwn(detector, 'partitionField')) {
              await ml.jobWizardAdvanced.selectDetectorPartitionField(detector.partitionField!);
            }
            if (Object.hasOwn(detector, 'excludeFrequent')) {
              await ml.jobWizardAdvanced.selectDetectorExcludeFrequent(detector.excludeFrequent!);
            }
            if (Object.hasOwn(detector, 'description')) {
              await ml.jobWizardAdvanced.setDetectorDescription(detector.description!);
            }

            await ml.jobWizardAdvanced.confirmAddDetectorModal();
          }

          await ml.testExecution.logTestStep('job creation displays detector entries');
          for (const [index, detector] of testData.pickFieldsConfig.detectors.entries()) {
            await ml.jobWizardAdvanced.assertDetectorEntryExists(
              index,
              detector.identifier,
              Object.hasOwn(detector, 'description') ? detector.description! : undefined
            );
          }

          await ml.testExecution.logTestStep('job creation inputs the bucket span');
          await ml.jobWizardCommon.assertBucketSpanInputExists();
          await ml.jobWizardCommon.setBucketSpan(testData.pickFieldsConfig.bucketSpan);

          await ml.testExecution.logTestStep('job creation inputs influencers');
          await ml.jobWizardCommon.assertInfluencerInputExists();
          await ml.jobWizardCommon.assertInfluencerSelection([]);
          for (const influencer of testData.pickFieldsConfig.influencers) {
            await ml.jobWizardCommon.addInfluencer(influencer);
          }

          await ml.testExecution.logTestStep('job creation inputs the model memory limit');
          await ml.jobWizardCommon.assertModelMemoryLimitInputExists({
            withAdvancedSection: false,
          });
          await ml.jobWizardCommon.setModelMemoryLimit(testData.pickFieldsConfig.memoryLimit, {
            withAdvancedSection: false,
          });

          await ml.testExecution.logTestStep('job creation displays the job details step');
          await ml.jobWizardCommon.advanceToJobDetailsSection();

          await ml.testExecution.logTestStep('job creation inputs the job id');
          await ml.jobWizardCommon.assertJobIdInputExists();
          await ml.jobWizardCommon.setJobId(testData.jobId);

          await ml.testExecution.logTestStep('job creation inputs the job description');
          await ml.jobWizardCommon.assertJobDescriptionInputExists();
          await ml.jobWizardCommon.setJobDescription(testData.jobDescription);

          await ml.testExecution.logTestStep('job creation inputs job groups');
          await ml.jobWizardCommon.assertJobGroupInputExists();
          for (const jobGroup of testData.jobGroups) {
            await ml.jobWizardCommon.addJobGroup(jobGroup);
          }
          await ml.jobWizardCommon.assertJobGroupSelection(testData.jobGroups);

          await ml.testExecution.logTestStep('job creation opens the additional settings section');
          await ml.jobWizardCommon.ensureAdditionalSettingsSectionOpen();

          await ml.testExecution.logTestStep('job creation displays the model plot switch');
          await ml.jobWizardCommon.assertModelPlotSwitchExists({ withAdvancedSection: false });

          await ml.testExecution.logTestStep('job creation enables the dedicated index switch');
          await ml.jobWizardCommon.assertDedicatedIndexSwitchExists({ withAdvancedSection: false });
          await ml.jobWizardCommon.activateDedicatedIndexSwitch({ withAdvancedSection: false });

          await ml.testExecution.logTestStep('job creation displays the validation step');
          await ml.jobWizardCommon.advanceToValidationSection();

          await ml.testExecution.logTestStep('job creation displays the summary step');
          await ml.jobWizardCommon.advanceToSummarySection();
        });

        it('runs the job and displays it correctly in the job list', async () => {
          await ml.testExecution.logTestStep(
            'job creation creates the job and finishes processing'
          );
          await ml.jobWizardCommon.assertCreateJobButtonExists();
          await ml.jobWizardAdvanced.createJob();
          await ml.jobManagement.assertStartDatafeedModalExists();
          await ml.jobManagement.confirmStartDatafeedModal();
          await ml.jobManagement.waitForJobCompletion(testData.jobId);

          await ml.testExecution.logTestStep(
            'job creation displays the created job in the job list'
          );
          await ml.jobTable.filterWithSearchString(testData.jobId, 1);

          await ml.testExecution.logTestStep(
            'job creation displays details for the created job in the job list'
          );
          await ml.jobTable.assertJobRowFields(testData.jobId, {
            id: testData.jobId,
            description: testData.jobDescription,
            jobGroups: [...new Set(testData.jobGroups)].sort(),
            ...testData.expected.row,
          });

          await ml.jobExpandedDetails.assertJobRowDetailsCounts(
            testData.jobId,
            {
              job_id: testData.jobId,
              ...testData.expected.counts,
            },
            {
              job_id: testData.jobId,
              ...testData.expected.modelSizeStats,
            }
          );

          await ml.testExecution.logTestStep('job creation has detector results');
          for (let i = 0; i < testData.pickFieldsConfig.detectors.length; i++) {
            await ml.api.assertDetectorResultsExist(testData.jobId, i);
          }
        });
      });
    }
  });
}
