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

  const jobId = `fq_single_1_${Date.now()}`;
  const aggAndFieldIdentifier = 'Mean(responsetime)';
  const bucketSpan = '30m';

  function getExpectedRow(expectedJobId: string) {
    return {
      id: expectedJobId,
      description: '',
      jobGroups: [],
      recordCount: '0',
      memoryStatus: 'ok',
      datafeedState: 'stopped',
      latestTimestamp: '',
    };
  }

  function getExpectedCounts(expectedJobId: string) {
    return {
      job_id: expectedJobId,
      processed_record_count: '0',
      processed_field_count: '0',
      input_bytes: '0.0 B',
      input_field_count: '0',
      invalid_date_count: '0',
      missing_field_count: '0',
      out_of_order_timestamp_count: '0',
      empty_bucket_count: '0',
      sparse_bucket_count: '0',
      bucket_count: '0',
    };
  }

  function getExpectedModelSizeStats(expectedJobId: string) {
    return {
      job_id: expectedJobId,
      result_type: 'model_size_stats',
      total_by_field_count: '0',
      total_over_field_count: '0',
      total_partition_field_count: '0',
      bucket_allocation_failures_count: '0',
      memory_status: 'ok',
    };
  }

  describe('single metric without datafeed start', function () {
    this.tags(['ml']);
    before(async () => {
      await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/ml/farequote');
      await ml.testResources.createDataViewIfNeeded('ft_farequote', '@timestamp');
      await ml.testResources.setKibanaTimeZoneToUTC();

      await ml.securityUI.loginAsMlPowerUser();
    });

    after(async () => {
      await ml.api.cleanMlIndices();
      await ml.testResources.deleteDataViewByTitle('ft_farequote');
    });

    it('job creation loads the single metric wizard for the source data', async () => {
      await ml.testExecution.logTestStep('job creation loads the job management page');
      await ml.navigation.navigateToStackManagementMlSection('anomaly_detection', 'ml-jobs-list');

      await ml.testExecution.logTestStep('job creation loads the new job source selection page');
      await ml.jobManagement.navigateToNewJobSourceSelection();

      await ml.testExecution.logTestStep('job creation loads the job type selection page');
      await ml.jobSourceSelection.selectSourceForAnomalyDetectionJob('ft_farequote');

      await ml.testExecution.logTestStep('job creation loads the single metric job wizard page');
      await ml.jobTypeSelection.selectSingleMetricJob();
    });

    it('job creation navigates through the single metric wizard and sets all needed fields', async () => {
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

      await ml.testExecution.logTestStep('job creation selects field and aggregation');
      await ml.jobWizardCommon.assertAggAndFieldInputExists();
      await ml.jobWizardCommon.selectAggAndField(aggAndFieldIdentifier, true);
      await ml.jobWizardCommon.assertAnomalyChartExists('LINE');

      await ml.testExecution.logTestStep('job creation inputs the bucket span');
      await ml.jobWizardCommon.assertBucketSpanInputExists();
      await ml.jobWizardCommon.setBucketSpan(bucketSpan);

      await ml.testExecution.logTestStep('job creation displays the job details step');
      await ml.jobWizardCommon.advanceToJobDetailsSection();

      await ml.testExecution.logTestStep('job creation inputs the job id');
      await ml.jobWizardCommon.assertJobIdInputExists();
      await ml.jobWizardCommon.setJobId(jobId);

      await ml.testExecution.logTestStep('job creation displays the validation step');
      await ml.jobWizardCommon.advanceToValidationSection();

      await ml.testExecution.logTestStep('job creation displays the summary step');
      await ml.jobWizardCommon.advanceToSummarySection();
    });

    it('job creation runs the job and displays it correctly in the job list', async () => {
      await ml.testExecution.logTestStep('job creation creates the job and finishes processing');

      await ml.jobWizardCommon.assertStartDatafeedSwitchExists();
      await ml.jobWizardCommon.toggleStartDatafeedSwitch(false);

      await ml.jobWizardCommon.assertCreateJobButtonExists();
      await ml.jobWizardCommon.createJobWithoutDatafeedStart();

      await ml.jobTable.filterWithSearchString(jobId, 1);

      await ml.testExecution.logTestStep(
        'job creation displays details for the created job in the job list'
      );
      await ml.jobTable.assertJobRowFields(jobId, getExpectedRow(jobId));

      await ml.jobExpandedDetails.assertJobRowDetailsCounts(
        jobId,
        getExpectedCounts(jobId),
        getExpectedModelSizeStats(jobId)
      );
    });
  });
}
