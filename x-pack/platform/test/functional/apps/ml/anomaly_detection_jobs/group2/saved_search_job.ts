/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const ml = getService('ml');

  const testDataList = [
    {
      suiteTitle: 'with filter',
      jobSource: 'ft_farequote_filter',
      jobId: `fq_saved_search_1_${Date.now()}`,
      jobDescription: 'Create multi metric job based on a saved search with filter',
      jobGroups: ['automated', 'farequote', 'multi-metric', 'saved-search'],
      aggAndFieldIdentifiers: ['Mean(responsetime)'],
      splitField: 'airline',
      bucketSpan: '15m',
      memoryLimit: '20mb',
      expected: {
        wizard: {
          numberOfBackCards: 0,
          frontCardTitle: 'ASA',
        },
        row: {
          recordCount: '5,675',
          memoryStatus: 'ok',
          datafeedState: 'stopped',
          latestTimestamp: '2016-02-11 23:59:54',
        },
        counts: {
          processed_record_count: '5,675',
          processed_field_count: '11,350',
          input_bytes: '430.9 KB',
          input_field_count: '11,350',
          invalid_date_count: '0',
          missing_field_count: '0',
          out_of_order_timestamp_count: '0',
          empty_bucket_count: '0',
          sparse_bucket_count: '0',
          bucket_count: '479',
          earliest_record_timestamp: '2016-02-07 00:00:00',
          latest_record_timestamp: '2016-02-11 23:59:54',
          input_record_count: '5,675',
          latest_bucket_timestamp: '2016-02-11 23:45:00',
        },
        modelSizeStats: {
          result_type: 'model_size_stats',
          model_bytes_exceeded: '0.0 B',
          total_by_field_count: '3',
          total_over_field_count: '0',
          total_partition_field_count: '2',
          bucket_allocation_failures_count: '0',
          memory_status: 'ok',
          timestamp: '2016-02-11 23:30:00',
        },
      },
    },
    {
      suiteTitle: 'with lucene query',
      jobSource: 'ft_farequote_lucene',
      jobId: `fq_saved_search_2_${Date.now()}`,
      jobDescription: 'Create multi metric job based on a saved search with lucene query',
      jobGroups: ['automated', 'farequote', 'multi-metric', 'saved-search'],
      aggAndFieldIdentifiers: ['Mean(responsetime)'],
      splitField: 'airline',
      bucketSpan: '15m',
      memoryLimit: '20mb',
      expected: {
        wizard: {
          numberOfBackCards: 4,
          frontCardTitle: 'AAL',
        },
        row: {
          recordCount: '34,416',
          memoryStatus: 'ok',
          datafeedState: 'stopped',
          latestTimestamp: '2016-02-11 23:59:54',
        },
        counts: {
          processed_record_count: '34,416',
          processed_field_count: '68,832',
          input_bytes: '2.6 MB',
          input_field_count: '68,832',
          invalid_date_count: '0',
          missing_field_count: '0',
          out_of_order_timestamp_count: '0',
          empty_bucket_count: '0',
          sparse_bucket_count: '0',
          bucket_count: '479',
          earliest_record_timestamp: '2016-02-07 00:00:00',
          latest_record_timestamp: '2016-02-11 23:59:54',
          input_record_count: '34,416',
          latest_bucket_timestamp: '2016-02-11 23:45:00',
        },
        modelSizeStats: {
          result_type: 'model_size_stats',
          model_bytes_exceeded: '0.0 B',
          total_by_field_count: '7',
          total_over_field_count: '0',
          total_partition_field_count: '6',
          bucket_allocation_failures_count: '0',
          memory_status: 'ok',
          timestamp: '2016-02-11 23:30:00',
        },
      },
    },
    {
      suiteTitle: 'with kuery query',
      jobSource: 'ft_farequote_kuery',
      jobId: `fq_saved_search_3_${Date.now()}`,
      jobDescription: 'Create multi metric job based on a saved search with kuery query',
      jobGroups: ['automated', 'farequote', 'multi-metric', 'saved-search'],
      aggAndFieldIdentifiers: ['Mean(responsetime)'],
      splitField: 'airline',
      bucketSpan: '15m',
      memoryLimit: '20mb',
      expected: {
        wizard: {
          numberOfBackCards: 4,
          frontCardTitle: 'AAL',
        },
        row: {
          recordCount: '34,415',
          memoryStatus: 'ok',
          datafeedState: 'stopped',
          latestTimestamp: '2016-02-11 23:59:54',
        },
        counts: {
          processed_record_count: '34,415',
          processed_field_count: '68,830',
          input_bytes: '2.6 MB',
          input_field_count: '68,830',
          invalid_date_count: '0',
          missing_field_count: '0',
          out_of_order_timestamp_count: '0',
          empty_bucket_count: '0',
          sparse_bucket_count: '0',
          bucket_count: '479',
          earliest_record_timestamp: '2016-02-07 00:00:00',
          latest_record_timestamp: '2016-02-11 23:59:54',
          input_record_count: '34,415',
          latest_bucket_timestamp: '2016-02-11 23:45:00',
        },
        modelSizeStats: {
          result_type: 'model_size_stats',
          model_bytes_exceeded: '0.0 B',
          total_by_field_count: '7',
          total_over_field_count: '0',
          total_partition_field_count: '6',
          bucket_allocation_failures_count: '0',
          memory_status: 'ok',
          timestamp: '2016-02-11 23:30:00',
        },
      },
    },
    {
      suiteTitle: 'with filter and lucene query',
      jobSource: 'ft_farequote_filter_and_lucene',
      jobId: `fq_saved_search_4_${Date.now()}`,
      jobDescription:
        'Create multi metric job based on a saved search with filter and lucene query',
      jobGroups: ['automated', 'farequote', 'multi-metric', 'saved-search'],
      aggAndFieldIdentifiers: ['Mean(responsetime)'],
      splitField: 'airline',
      bucketSpan: '15m',
      memoryLimit: '20mb',
      expected: {
        wizard: {
          numberOfBackCards: 0,
          frontCardTitle: 'ASA',
        },
        row: {
          recordCount: '5,673',
          memoryStatus: 'ok',
          datafeedState: 'stopped',
          latestTimestamp: '2016-02-11 23:59:54',
        },
        counts: {
          processed_record_count: '5,673',
          processed_field_count: '11,346',
          input_bytes: '430.7 KB',
          input_field_count: '11,346',
          invalid_date_count: '0',
          missing_field_count: '0',
          out_of_order_timestamp_count: '0',
          empty_bucket_count: '0',
          sparse_bucket_count: '0',
          bucket_count: '479',
          earliest_record_timestamp: '2016-02-07 00:00:00',
          latest_record_timestamp: '2016-02-11 23:59:54',
          input_record_count: '5,673',
          latest_bucket_timestamp: '2016-02-11 23:45:00',
        },
        modelSizeStats: {
          result_type: 'model_size_stats',
          model_bytes_exceeded: '0.0 B',
          total_by_field_count: '3',
          total_over_field_count: '0',
          total_partition_field_count: '2',
          bucket_allocation_failures_count: '0',
          memory_status: 'ok',
          timestamp: '2016-02-11 23:30:00',
        },
      },
    },
    {
      suiteTitle: 'with filter and kuery query',
      jobSource: 'ft_farequote_filter_and_kuery',
      jobId: `fq_saved_search_5_${Date.now()}`,
      jobDescription: 'Create multi metric job based on a saved search with filter and kuery query',
      jobGroups: ['automated', 'farequote', 'multi-metric', 'saved-search'],
      aggAndFieldIdentifiers: ['Mean(responsetime)'],
      splitField: 'airline',
      bucketSpan: '15m',
      memoryLimit: '20mb',
      expected: {
        wizard: {
          numberOfBackCards: 0,
          frontCardTitle: 'ASA',
        },
        row: {
          recordCount: '5,674',
          memoryStatus: 'ok',
          datafeedState: 'stopped',
          latestTimestamp: '2016-02-11 23:59:54',
        },
        counts: {
          processed_record_count: '5,674',
          processed_field_count: '11,348',
          input_bytes: '430.8 KB',
          input_field_count: '11,348',
          invalid_date_count: '0',
          missing_field_count: '0',
          out_of_order_timestamp_count: '0',
          empty_bucket_count: '0',
          sparse_bucket_count: '0',
          bucket_count: '479',
          earliest_record_timestamp: '2016-02-07 00:00:00',
          latest_record_timestamp: '2016-02-11 23:59:54',
          input_record_count: '5,674',
          latest_bucket_timestamp: '2016-02-11 23:45:00',
        },
        modelSizeStats: {
          result_type: 'model_size_stats',
          model_bytes_exceeded: '0.0 B',
          total_by_field_count: '3',
          total_over_field_count: '0',
          total_partition_field_count: '2',
          bucket_allocation_failures_count: '0',
          memory_status: 'ok',
          timestamp: '2016-02-11 23:30:00',
        },
      },
    },
  ];

  describe('saved search', function () {
    this.tags(['ml']);
    before(async () => {
      await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/ml/farequote');
      await ml.testResources.createDataViewIfNeeded('ft_farequote', '@timestamp');
      await ml.testResources.createSavedSearchFarequoteFilterIfNeeded();
      await ml.testResources.createSavedSearchFarequoteLuceneIfNeeded();
      await ml.testResources.createSavedSearchFarequoteKueryIfNeeded();
      await ml.testResources.createSavedSearchFarequoteFilterAndLuceneIfNeeded();
      await ml.testResources.createSavedSearchFarequoteFilterAndKueryIfNeeded();
      await ml.testResources.setKibanaTimeZoneToUTC();

      await ml.securityUI.loginAsMlPowerUser();
    });

    after(async () => {
      await ml.api.cleanMlIndices();
      await ml.testResources.deleteSavedSearches();
      await ml.testResources.deleteDataViewByTitle('ft_farequote');
    });

    for (const testData of testDataList) {
      describe(` ${testData.suiteTitle}`, function () {
        it('job creation loads the multi metric wizard for the source data', async () => {
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

          await ml.testExecution.logTestStep('job creation loads the multi metric job wizard page');
          await ml.jobTypeSelection.selectMultiMetricJob();
        });

        it('job creation navigates through the multi metric wizard and sets all needed fields', async () => {
          await ml.testExecution.logTestStep('job creation displays the time range step');
          await ml.jobWizardCommon.assertTimeRangeSectionExists();
          await ml.commonUI.assertDatePickerDataTierOptionsVisible(true);

          await ml.testExecution.logTestStep('job creation sets the time range');
          await ml.jobWizardCommon.clickUseFullDataButton(
            'Feb 7, 2016 @ 00:00:00.000',
            'Feb 11, 2016 @ 23:59:54.000'
          );

          await ml.testExecution.logTestStep('job creation displays the event rate chart');
          await ml.jobWizardCommon.assertEventRateChartExists();
          await ml.jobWizardCommon.assertEventRateChartHasData();

          await ml.testExecution.logTestStep('job creation displays the pick fields step');
          await ml.jobWizardCommon.advanceToPickFieldsSection();

          await ml.testExecution.logTestStep(
            'job creation selects detectors and displays detector previews'
          );
          for (const [index, aggAndFieldIdentifier] of testData.aggAndFieldIdentifiers.entries()) {
            await ml.jobWizardCommon.assertAggAndFieldInputExists();
            await ml.jobWizardCommon.selectAggAndField(aggAndFieldIdentifier, false);
            await ml.jobWizardCommon.assertDetectorPreviewExists(
              aggAndFieldIdentifier,
              index,
              'LINE'
            );
          }

          await ml.testExecution.logTestStep(
            'job creation inputs the split field and displays split cards'
          );
          await ml.jobWizardMultiMetric.assertSplitFieldInputExists();
          await ml.jobWizardMultiMetric.selectSplitField(testData.splitField);

          await ml.jobWizardMultiMetric.assertDetectorSplitExists(testData.splitField);
          await ml.jobWizardMultiMetric.assertDetectorSplitFrontCardTitle(
            testData.expected.wizard.frontCardTitle
          );
          await ml.jobWizardMultiMetric.assertDetectorSplitNumberOfBackCards(
            testData.expected.wizard.numberOfBackCards
          );

          await ml.jobWizardCommon.assertInfluencerSelection([testData.splitField]);

          await ml.testExecution.logTestStep('job creation displays the influencer field');
          await ml.jobWizardCommon.assertInfluencerInputExists();
          await ml.jobWizardCommon.assertInfluencerSelection([testData.splitField]);

          await ml.testExecution.logTestStep('job creation inputs the bucket span');
          await ml.jobWizardCommon.assertBucketSpanInputExists();
          await ml.jobWizardCommon.setBucketSpan(testData.bucketSpan);

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

          await ml.testExecution.logTestStep('job creation opens the advanced section');
          await ml.jobWizardCommon.ensureAdvancedSectionOpen();

          await ml.testExecution.logTestStep('job creation displays the model plot switch');
          await ml.jobWizardCommon.assertModelPlotSwitchExists();

          await ml.testExecution.logTestStep('job creation enables the dedicated index switch');
          await ml.jobWizardCommon.assertDedicatedIndexSwitchExists();
          await ml.jobWizardCommon.activateDedicatedIndexSwitch();

          await ml.testExecution.logTestStep('job creation inputs the model memory limit');
          await ml.jobWizardCommon.assertModelMemoryLimitInputExists();
          await ml.jobWizardCommon.setModelMemoryLimit(testData.memoryLimit);

          await ml.testExecution.logTestStep('job creation displays the validation step');
          await ml.jobWizardCommon.advanceToValidationSection();

          await ml.testExecution.logTestStep('job creation displays the summary step');
          await ml.jobWizardCommon.advanceToSummarySection();
        });

        it('job creation runs the job and displays it correctly in the job list', async () => {
          await ml.testExecution.logTestStep(
            'job creation creates the job and finishes processing'
          );
          await ml.jobWizardCommon.assertCreateJobButtonExists();
          await ml.jobWizardCommon.createJobAndWaitForCompletion();

          await ml.testExecution.logTestStep(
            'job creation displays the created job in the job list'
          );
          await ml.navigation.navigateToStackManagementMlSection(
            'anomaly_detection',
            'ml-jobs-list'
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

          await ml.testExecution.logTestStep('has detector results');
          for (let i = 0; i < testData.aggAndFieldIdentifiers.length; i++) {
            await ml.api.assertDetectorResultsExist(testData.jobId, i);
          }
        });
      });
    }
  });
}
