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
      suiteTitle: 'with multiple metric detectors and custom datafeed settings',
      jobSource: 'ft_ecommerce',
      jobId: `ec_advanced_1_${Date.now()}`,
      get jobIdClone(): string {
        return `${this.jobId}_clone`;
      },
      jobDescription:
        'Create advanced job from ft_ecommerce dataset with multiple metric detectors and custom datafeed settings',
      jobGroups: ['automated', 'ecommerce', 'advanced'],
      get jobGroupsClone(): string[] {
        return [...this.jobGroups, 'clone'];
      },
      pickFieldsConfig: {
        detectors: [
          {
            identifier: 'high_count',
            function: 'high_count',
            description: 'high_count detector without split',
          } as Detector,
          {
            identifier: 'mean("products.base_price") by "category.keyword"',
            function: 'mean',
            field: 'products.base_price',
            byField: 'category.keyword',
          } as Detector,
          {
            identifier: 'sum("products.discount_amount") over customer_id',
            function: 'sum',
            field: 'products.discount_amount',
            overField: 'customer_id',
          } as Detector,
          {
            identifier: 'median(total_quantity) partition_field_name=customer_gender',
            function: 'median',
            field: 'total_quantity',
            partitionField: 'customer_gender',
          } as Detector,
          {
            identifier:
              'max(total_quantity) by "geoip.continent_name" over customer_id partition_field_name=customer_gender',
            function: 'max',
            field: 'total_quantity',
            byField: 'geoip.continent_name',
            overField: 'customer_id',
            partitionField: 'customer_gender',
          } as Detector,
        ],
        influencers: ['customer_id', 'category.keyword', 'geoip.continent_name', 'customer_gender'],
        bucketSpan: '1h',
        memoryLimit: '10mb',
      } as PickFieldsConfig,
      datafeedConfig: {
        queryDelay: '55s',
        frequency: '350s',
        scrollSize: '999',
      } as DatafeedConfig,
      expected: {
        wizard: {
          timeField: 'order_date',
        },
        row: {
          recordCount: '4,675',
          memoryStatus: 'ok',
          datafeedState: 'stopped',
          latestTimestamp: '2023-07-12 23:45:36',
        },
        counts: {
          processed_record_count: '4,675',
          processed_field_count: '32,725',
          input_bytes: '1.1 MB',
          input_field_count: '32,725',
          invalid_date_count: '0',
          missing_field_count: '0',
          out_of_order_timestamp_count: '0',
          empty_bucket_count: '0',
          sparse_bucket_count: '0',
          bucket_count: '743',
          earliest_record_timestamp: '2023-06-12 00:04:19',
          latest_record_timestamp: '2023-07-12 23:45:36',
          input_record_count: '4,675',
          latest_bucket_timestamp: '2023-07-12 23:00:00',
        },
        modelSizeStats: {
          result_type: 'model_size_stats',
          model_bytes_exceeded: '0.0 B',
          total_by_field_count: '37',
          total_over_field_count: '92',
          total_partition_field_count: '8',
          bucket_allocation_failures_count: '0',
          memory_status: 'ok',
          timestamp: '2023-07-12 22:00:00',
        },
      },
    },
    {
      suiteTitle: 'with categorization detector and default datafeed settings',
      jobSource: 'ft_categorization_small',
      jobId: `categorization_advanced_2_${Date.now()}`,
      get jobIdClone(): string {
        return `${this.jobId}_clone`;
      },
      jobDescription:
        'Create advanced job from ft_categorization_small dataset with a categorization detector and default datafeed settings',
      jobGroups: ['automated', 'categorization', 'advanced'],
      get jobGroupsClone(): string[] {
        return [...this.jobGroups, 'clone'];
      },
      pickFieldsConfig: {
        categorizationField: 'field1',
        detectors: [
          {
            identifier: 'count by mlcategory',
            function: 'count',
            byField: 'mlcategory',
          } as Detector,
        ],
        influencers: ['mlcategory'],
        bucketSpan: '4h',
        memoryLimit: '100mb',
      } as PickFieldsConfig,
      datafeedConfig: {} as DatafeedConfig,
      expected: {
        wizard: {
          timeField: '@timestamp',
        },
        row: {
          recordCount: '1,000',
          memoryStatus: 'ok',
          datafeedState: 'stopped',
          latestTimestamp: '2019-11-21 00:01:13',
        },
        counts: {
          processed_record_count: '1,000',
          processed_field_count: '1,000',
          input_bytes: '148.8 KB',
          input_field_count: '1,000',
          invalid_date_count: '0',
          missing_field_count: '0',
          out_of_order_timestamp_count: '0',
          empty_bucket_count: '1,073',
          sparse_bucket_count: '0',
          bucket_count: '1,378',
          earliest_record_timestamp: '2019-04-05 11:25:35',
          latest_record_timestamp: '2019-11-21 00:01:13',
          input_record_count: '1,000',
          latest_bucket_timestamp: '2019-11-21 00:00:00',
        },
        modelSizeStats: {
          result_type: 'model_size_stats',
          model_bytes_exceeded: '0.0 B',
          // not checking total_by_field_count as the number of categories might change
          total_over_field_count: '0',
          total_partition_field_count: '2',
          bucket_allocation_failures_count: '0',
          memory_status: 'ok',
          timestamp: '2019-11-20 20:00:00',
        },
      },
    },
  ];

  const calendarId = `wizard-test-calendar_${Date.now()}`;

  describe('advanced job', function () {
    this.tags(['ml']);
    before(async () => {
      await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/ml/ecommerce');
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/categorization_small'
      );
      await ml.testResources.createDataViewIfNeeded('ft_ecommerce', 'order_date');
      await ml.testResources.createDataViewIfNeeded('ft_categorization_small', '@timestamp');
      await ml.testResources.setKibanaTimeZoneToUTC();

      await ml.api.createCalendar(calendarId);
      await ml.securityUI.loginAsMlPowerUser();
    });

    after(async () => {
      await ml.api.cleanMlIndices();
      await ml.testResources.deleteDataViewByTitle('ft_ecommerce');
      await ml.testResources.deleteDataViewByTitle('ft_categorization_small');
    });

    for (const testData of testDataList) {
      describe(`${testData.suiteTitle}`, function () {
        it('job creation loads the advanced wizard for the source data', async () => {
          await ml.testExecution.logTestStep('job creation navigates to job management');
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

        it('job creation navigates through the advanced wizard and sets all needed fields', async () => {
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

          await ml.testExecution.logTestStep('job creation pre-fills the time field');
          await ml.jobWizardAdvanced.assertTimeFieldInputExists();
          await ml.jobWizardAdvanced.assertTimeFieldSelection([testData.expected.wizard.timeField]);

          await ml.testExecution.logTestStep('job creation displays the pick fields step');
          await ml.jobWizardCommon.advanceToPickFieldsSection();

          await ml.testExecution.logTestStep('job creation selects the categorization field');
          await ml.jobWizardAdvanced.assertCategorizationFieldInputExists();
          if (Object.hasOwn(testData.pickFieldsConfig, 'categorizationField')) {
            await ml.jobWizardAdvanced.selectCategorizationField(
              testData.pickFieldsConfig.categorizationField!
            );
          } else {
            await ml.jobWizardAdvanced.assertCategorizationFieldSelection([]);
          }

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

          await ml.testExecution.logTestStep('job creation adds a new custom url');
          await ml.jobWizardCommon.addCustomUrl({ label: 'check-kibana-dashboard' });

          await ml.testExecution.logTestStep('job creation assigns calendars');
          await ml.jobWizardCommon.addCalendar(calendarId);

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

        it('job creation runs the job and displays it correctly in the job list', async () => {
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

        it('job cloning opens the existing job in the advanced wizard', async () => {
          await ml.testExecution.logTestStep(
            'job cloning clicks the clone action and loads the advanced wizard'
          );
          await ml.jobTable.clickCloneJobAction(testData.jobId);
          await ml.jobTypeSelection.assertAdvancedJobWizardOpen();
        });

        it('job cloning navigates through the advanced wizard, checks and sets all needed fields', async () => {
          await ml.testExecution.logTestStep('job cloning displays the configure datafeed step');
          await ml.jobWizardCommon.assertConfigureDatafeedSectionExists();

          await ml.testExecution.logTestStep('job cloning pre-fills the datafeed query editor');
          await ml.jobWizardAdvanced.assertDatafeedQueryEditorExists();
          await ml.jobWizardAdvanced.assertDatafeedQueryEditorValue(defaultValues.datafeedQuery);

          await ml.testExecution.logTestStep('job cloning pre-fills the query delay');
          await ml.jobWizardAdvanced.assertQueryDelayInputExists();
          if (Object.hasOwn(testData.datafeedConfig, 'queryDelay')) {
            await ml.jobWizardAdvanced.assertQueryDelayValue(testData.datafeedConfig.queryDelay!);
          }

          await ml.testExecution.logTestStep('job cloning pre-fills the frequency');
          await ml.jobWizardAdvanced.assertFrequencyInputExists();
          if (Object.hasOwn(testData.datafeedConfig, 'frequency')) {
            await ml.jobWizardAdvanced.assertFrequencyValue(testData.datafeedConfig.frequency!);
          }

          await ml.testExecution.logTestStep('job cloning pre-fills the scroll size');
          await ml.jobWizardAdvanced.assertScrollSizeInputExists();
          await ml.jobWizardAdvanced.assertScrollSizeValue(
            Object.hasOwn(testData.datafeedConfig, 'scrollSize')
              ? testData.datafeedConfig.scrollSize!
              : defaultValues.scrollSize
          );

          await ml.testExecution.logTestStep('job creation pre-fills the time field');
          await ml.jobWizardAdvanced.assertTimeFieldInputExists();
          await ml.jobWizardAdvanced.assertTimeFieldSelection([testData.expected.wizard.timeField]);

          await ml.testExecution.logTestStep('job cloning displays the pick fields step');
          await ml.jobWizardCommon.advanceToPickFieldsSection();

          await ml.testExecution.logTestStep('job cloning pre-fills the categorization field');
          await ml.jobWizardAdvanced.assertCategorizationFieldInputExists();
          await ml.jobWizardAdvanced.assertCategorizationFieldSelection(
            Object.hasOwn(testData.pickFieldsConfig, 'categorizationField')
              ? [testData.pickFieldsConfig.categorizationField!]
              : []
          );

          await ml.testExecution.logTestStep('job cloning pre-fills the summary count field');
          await ml.jobWizardAdvanced.assertSummaryCountFieldInputExists();
          await ml.jobWizardAdvanced.assertSummaryCountFieldSelection(
            Object.hasOwn(testData.pickFieldsConfig, 'summaryCountField')
              ? [testData.pickFieldsConfig.summaryCountField!]
              : []
          );

          await ml.testExecution.logTestStep('job cloning pre-fills detectors');
          for (const [index, detector] of testData.pickFieldsConfig.detectors.entries()) {
            await ml.jobWizardAdvanced.assertDetectorEntryExists(
              index,
              detector.identifier,
              Object.hasOwn(detector, 'description') ? detector.description! : undefined
            );
            await ml.jobWizardAdvanced.clickEditDetector(index);

            await ml.jobWizardAdvanced.assertDetectorFunctionInputExists();
            await ml.jobWizardAdvanced.assertDetectorFieldInputExists();
            await ml.jobWizardAdvanced.assertDetectorByFieldInputExists();
            await ml.jobWizardAdvanced.assertDetectorOverFieldInputExists();
            await ml.jobWizardAdvanced.assertDetectorPartitionFieldInputExists();
            await ml.jobWizardAdvanced.assertDetectorExcludeFrequentInputExists();
            await ml.jobWizardAdvanced.assertDetectorDescriptionInputExists();

            await ml.jobWizardAdvanced.assertDetectorFunctionSelection([detector.function]);
            await ml.jobWizardAdvanced.assertDetectorFieldSelection(
              Object.hasOwn(detector, 'field') ? [detector.field!] : []
            );
            await ml.jobWizardAdvanced.assertDetectorByFieldSelection(
              Object.hasOwn(detector, 'byField') ? [detector.byField!] : []
            );
            await ml.jobWizardAdvanced.assertDetectorOverFieldSelection(
              Object.hasOwn(detector, 'overField') ? [detector.overField!] : []
            );
            await ml.jobWizardAdvanced.assertDetectorPartitionFieldSelection(
              Object.hasOwn(detector, 'partitionField') ? [detector.partitionField!] : []
            );
            await ml.jobWizardAdvanced.assertDetectorExcludeFrequentSelection(
              Object.hasOwn(detector, 'excludeFrequent') ? [detector.excludeFrequent!] : []
            );
            // Currently, a description different form the identifier is generated for detectors with partition field
            await ml.jobWizardAdvanced.assertDetectorDescriptionValue(
              Object.hasOwn(detector, 'description')
                ? detector.description!
                : detector.identifier.replace('partition_field_name', 'partitionfield')
            );

            await ml.jobWizardAdvanced.cancelAddDetectorModal();
          }

          await ml.testExecution.logTestStep('job cloning pre-fills the bucket span');
          await ml.jobWizardCommon.assertBucketSpanInputExists();
          await ml.jobWizardCommon.assertBucketSpanValue(testData.pickFieldsConfig.bucketSpan);

          await ml.testExecution.logTestStep('job cloning pre-fills influencers');
          await ml.jobWizardCommon.assertInfluencerInputExists();
          await ml.jobWizardCommon.assertInfluencerSelection(testData.pickFieldsConfig.influencers);

          // MML during clone has changed in #61589
          // TODO: adjust test code to reflect the new behavior
          // await ml.testExecution.logTestStep('job cloning pre-fills the model memory limit');
          // await ml.jobWizardCommon.assertModelMemoryLimitInputExists({
          //   withAdvancedSection: false,
          // });
          // await ml.jobWizardCommon.assertModelMemoryLimitValue(
          //   testData.pickFieldsConfig.memoryLimit,
          //   {
          //     withAdvancedSection: false,
          //   }
          // );

          await ml.testExecution.logTestStep('job cloning displays the job details step');
          await ml.jobWizardCommon.advanceToJobDetailsSection();

          await ml.testExecution.logTestStep('job cloning does not pre-fill the job id');
          await ml.jobWizardCommon.assertJobIdInputExists();
          await ml.jobWizardCommon.assertJobIdValue('');

          await ml.testExecution.logTestStep('job cloning inputs the clone job id');
          await ml.jobWizardCommon.setJobId(testData.jobIdClone);

          await ml.testExecution.logTestStep('job cloning pre-fills the job description');
          await ml.jobWizardCommon.assertJobDescriptionInputExists();
          await ml.jobWizardCommon.assertJobDescriptionValue(testData.jobDescription);

          await ml.testExecution.logTestStep('job cloning pre-fills job groups');
          await ml.jobWizardCommon.assertJobGroupInputExists();
          await ml.jobWizardCommon.assertJobGroupSelection(testData.jobGroups);

          await ml.testExecution.logTestStep('job cloning inputs the clone job group');
          await ml.jobWizardCommon.assertJobGroupInputExists();
          await ml.jobWizardCommon.addJobGroup('clone');
          await ml.jobWizardCommon.assertJobGroupSelection(testData.jobGroupsClone);

          await ml.testExecution.logTestStep('job cloning opens the additional settings section');
          await ml.jobWizardCommon.ensureAdditionalSettingsSectionOpen();

          await ml.testExecution.logTestStep('job cloning persists custom urls');
          await ml.customUrls.assertCustomUrlLabel(0, 'check-kibana-dashboard');

          await ml.testExecution.logTestStep('job cloning persists assigned calendars');
          await ml.jobWizardCommon.assertCalendarsSelection([calendarId]);

          await ml.testExecution.logTestStep('job cloning pre-fills the model plot switch');
          await ml.jobWizardCommon.assertModelPlotSwitchExists({ withAdvancedSection: false });
          await ml.jobWizardCommon.assertModelPlotSwitchCheckedState(false, {
            withAdvancedSection: false,
          });

          await ml.testExecution.logTestStep('job cloning pre-fills the dedicated index switch');
          await ml.jobWizardCommon.assertDedicatedIndexSwitchExists({ withAdvancedSection: false });
          await ml.jobWizardCommon.assertDedicatedIndexSwitchCheckedState(true, {
            withAdvancedSection: false,
          });

          await ml.testExecution.logTestStep('job cloning displays the validation step');
          await ml.jobWizardCommon.advanceToValidationSection();

          await ml.testExecution.logTestStep('job cloning displays the summary step');
          await ml.jobWizardCommon.advanceToSummarySection();
        });

        it('job cloning runs the clone job and displays it correctly in the job list', async () => {
          await ml.testExecution.logTestStep('job cloning creates the job and finishes processing');
          await ml.jobWizardCommon.assertCreateJobButtonExists();
          await ml.jobWizardAdvanced.createJob();
          await ml.jobManagement.assertStartDatafeedModalExists();
          await ml.jobManagement.confirmStartDatafeedModal();
          await ml.jobManagement.waitForJobCompletion(testData.jobIdClone);

          await ml.testExecution.logTestStep(
            'job cloning displays the created job in the job list'
          );
          await ml.jobTable.filterWithSearchString(testData.jobIdClone, 1);

          await ml.testExecution.logTestStep(
            'job cloning displays details for the created job in the job list'
          );
          await ml.jobTable.assertJobRowFields(testData.jobIdClone, {
            id: testData.jobIdClone,
            description: testData.jobDescription,
            jobGroups: [...new Set(testData.jobGroupsClone)].sort(),
            ...testData.expected.row,
          });

          await ml.jobExpandedDetails.assertJobRowDetailsCounts(
            testData.jobIdClone,
            {
              job_id: testData.jobIdClone,
              ...testData.expected.counts,
            },
            {
              job_id: testData.jobIdClone,
              ...testData.expected.modelSizeStats,
            }
          );

          await ml.testExecution.logTestStep('job cloning has detector results');
          for (let i = 0; i < testData.pickFieldsConfig.detectors.length; i++) {
            await ml.api.assertDetectorResultsExist(testData.jobIdClone, i);
          }
        });
      });
    }
  });
}
