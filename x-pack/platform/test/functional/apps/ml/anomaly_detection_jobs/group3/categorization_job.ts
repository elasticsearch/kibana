/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CATEGORY_EXAMPLES_VALIDATION_STATUS } from '@kbn/ml-category-validator';
import type { FtrProviderContext } from '../../../../ftr_provider_context';
import type { FieldStatsType } from '../../common/types';

export default function ({ getService }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const ml = getService('ml');

  const jobId = `categorization_${Date.now()}`;
  const jobIdClone = `${jobId}_clone`;
  const jobDescription =
    'Create categorization job based on the ft_categorization dataset with a count rare';
  const jobGroups = ['automated', 'categorization'];
  const jobGroupsClone = [...jobGroups, 'clone'];
  const detectorTypeIdentifier = 'Rare';
  const categorizationFieldIdentifier = 'field1';
  const categorizationExampleCount = 5;
  const bucketSpan = '1d';
  const memoryLimit = '15mb';

  function getExpectedRow(expectedJobId: string, expectedJobGroups: string[]) {
    return {
      id: expectedJobId,
      description: jobDescription,
      jobGroups: [...new Set(expectedJobGroups)].sort(),
      recordCount: '1,000',
      memoryStatus: 'ok',
      datafeedState: 'stopped',
      latestTimestamp: '2019-11-21 00:01:13',
    };
  }

  function getExpectedCounts(expectedJobId: string) {
    return {
      job_id: expectedJobId,
      processed_record_count: '1,000',
      processed_field_count: '1,000',
      input_bytes: '148.8 KB',
      input_field_count: '1,000',
      invalid_date_count: '0',
      missing_field_count: '0',
      out_of_order_timestamp_count: '0',
      empty_bucket_count: '23',
      sparse_bucket_count: '0',
      bucket_count: '230',
      earliest_record_timestamp: '2019-04-05 11:25:35',
      latest_record_timestamp: '2019-11-21 00:01:13',
      input_record_count: '1,000',
      latest_bucket_timestamp: '2019-11-21 00:00:00',
      latest_empty_bucket_timestamp: '2019-11-17 00:00:00',
    };
  }

  function getExpectedModelSizeStats(expectedJobId: string) {
    return {
      job_id: expectedJobId,
      result_type: 'model_size_stats',
      model_bytes_exceeded: '0.0 B',
      // not checking total_by_field_count as the number of categories might change
      total_over_field_count: '0',
      total_partition_field_count: '2',
      bucket_allocation_failures_count: '0',
      memory_status: 'ok',
      timestamp: '2019-11-20 00:00:00',
    };
  }

  const calendarId = `wizard-test-calendar_${Date.now()}`;

  const fieldStatsEntries = [
    {
      fieldName: 'field1',
      type: 'keyword' as FieldStatsType,
    },
  ];

  describe('categorization', function () {
    this.tags(['ml']);
    before(async () => {
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/ml/categorization_small'
      );
      await ml.testResources.createDataViewIfNeeded('ft_categorization_small', '@timestamp');
      await ml.testResources.setKibanaTimeZoneToUTC();

      await ml.api.createCalendar(calendarId);
      await ml.securityUI.loginAsMlPowerUser();
    });

    after(async () => {
      await ml.api.cleanMlIndices();
      await ml.testResources.deleteDataViewByTitle('ft_categorization_small');
    });

    it('job creation loads the categorization wizard for the source data', async () => {
      await ml.testExecution.logTestStep('job creation loads the job management page');
      await ml.testExecution.logTestStep('');
      await ml.navigation.navigateToStackManagementMlSection('anomaly_detection', 'ml-jobs-list');

      await ml.testExecution.logTestStep('job creation loads the new job source selection page');
      await ml.jobManagement.navigateToNewJobSourceSelection();

      await ml.testExecution.logTestStep('job creation loads the job type selection page');
      await ml.jobSourceSelection.selectSourceForAnomalyDetectionJob('ft_categorization_small');

      await ml.testExecution.logTestStep('job creation loads the categorization job wizard page');
      await ml.jobTypeSelection.selectCategorizationJob();
    });

    it('job creation navigates through the categorization wizard and sets all needed fields', async () => {
      await ml.testExecution.logTestStep('job creation displays the time range step');
      await ml.jobWizardCommon.assertTimeRangeSectionExists();
      await ml.commonUI.assertDatePickerDataTierOptionsVisible(true);

      await ml.testExecution.logTestStep('job creation sets the time range');
      await ml.jobWizardCommon.clickUseFullDataButton(
        'Apr 5, 2019 @ 11:25:35.770',
        'Nov 21, 2019 @ 00:01:13.923'
      );

      await ml.testExecution.logTestStep('job creation displays the event rate chart');
      await ml.jobWizardCommon.assertEventRateChartExists();
      await ml.jobWizardCommon.assertEventRateChartHasData();

      await ml.testExecution.logTestStep('job creation displays the pick fields step');
      await ml.jobWizardCommon.advanceToPickFieldsSection();

      await ml.testExecution.logTestStep(
        `job creation selects ${detectorTypeIdentifier} detector type`
      );
      await ml.jobWizardCategorization.assertCategorizationDetectorTypeSelectionExists();
      await ml.jobWizardCategorization.selectCategorizationDetectorType(detectorTypeIdentifier);

      await ml.testExecution.logTestStep(
        'job creation opens field stats flyout from categorization field input'
      );
      await ml.jobWizardCategorization.assertCategorizationFieldInputExists();
      for (const { fieldName, type: fieldType } of fieldStatsEntries) {
        await ml.jobWizardCategorization.assertFieldStatFlyoutContentFromCategorizationFieldInputTrigger(
          fieldName,
          fieldType
        );
      }

      await ml.testExecution.logTestStep(`job creation selects the categorization field`);
      await ml.jobWizardCategorization.selectCategorizationField(categorizationFieldIdentifier);
      await ml.jobWizardCategorization.assertCategorizationExamplesCallout(
        CATEGORY_EXAMPLES_VALIDATION_STATUS.VALID
      );
      await ml.jobWizardCategorization.assertCategorizationExamplesTable(
        categorizationExampleCount
      );

      await ml.testExecution.logTestStep('job creation inputs the bucket span');
      await ml.jobWizardCommon.assertBucketSpanInputExists();
      await ml.jobWizardCommon.setBucketSpan(bucketSpan);

      await ml.testExecution.logTestStep('job creation displays the job details step');
      await ml.jobWizardCommon.advanceToJobDetailsSection();

      await ml.testExecution.logTestStep('job creation inputs the job id');
      await ml.jobWizardCommon.assertJobIdInputExists();
      await ml.jobWizardCommon.setJobId(jobId);

      await ml.testExecution.logTestStep('job creation inputs the job description');
      await ml.jobWizardCommon.assertJobDescriptionInputExists();
      await ml.jobWizardCommon.setJobDescription(jobDescription);

      await ml.testExecution.logTestStep('job creation inputs job groups');
      await ml.jobWizardCommon.assertJobGroupInputExists();
      for (const jobGroup of jobGroups) {
        await ml.jobWizardCommon.addJobGroup(jobGroup);
      }
      await ml.jobWizardCommon.assertJobGroupSelection(jobGroups);

      await ml.testExecution.logTestStep('job creation opens the additional settings section');
      await ml.jobWizardCommon.ensureAdditionalSettingsSectionOpen();

      await ml.testExecution.logTestStep('job creation adds a new custom url');
      await ml.jobWizardCommon.addCustomUrl({ label: 'check-kibana-dashboard' });

      await ml.testExecution.logTestStep('job creation assigns calendars');
      await ml.jobWizardCommon.addCalendar(calendarId);

      await ml.testExecution.logTestStep('job creation opens the advanced section');
      await ml.jobWizardCommon.ensureAdvancedSectionOpen();

      await ml.testExecution.logTestStep('job creation displays the model plot switch');
      await ml.jobWizardCommon.assertModelPlotSwitchExists();
      await ml.jobWizardCommon.assertModelPlotSwitchEnabled(false);
      await ml.jobWizardCommon.assertModelPlotSwitchCheckedState(false);

      await ml.testExecution.logTestStep('job creation enables the dedicated index switch');
      await ml.jobWizardCommon.assertDedicatedIndexSwitchExists();
      await ml.jobWizardCommon.activateDedicatedIndexSwitch();

      await ml.testExecution.logTestStep('job creation inputs the model memory limit');
      await ml.jobWizardCommon.assertModelMemoryLimitInputExists();
      await ml.jobWizardCommon.setModelMemoryLimit(memoryLimit);

      await ml.testExecution.logTestStep('job creation displays the validation step');
      await ml.jobWizardCommon.advanceToValidationSection();

      await ml.testExecution.logTestStep('job creation displays the summary step');
      await ml.jobWizardCommon.advanceToSummarySection();
    });

    it('job creation runs the job and displays it correctly in the job list', async () => {
      await ml.testExecution.logTestStep('job creation creates the job and finishes processing');
      await ml.jobWizardCommon.assertCreateJobButtonExists();
      await ml.jobWizardCommon.createJobAndWaitForCompletion();

      await ml.testExecution.logTestStep('job creation displays the created job in the job list');
      await ml.navigation.navigateToStackManagementMlSection('anomaly_detection', 'ml-jobs-list');

      await ml.jobTable.filterWithSearchString(jobId, 1);

      await ml.testExecution.logTestStep(
        'job creation displays details for the created job in the job list'
      );
      await ml.jobTable.assertJobRowFields(jobId, getExpectedRow(jobId, jobGroups));

      await ml.jobExpandedDetails.assertJobRowDetailsCounts(
        jobId,
        getExpectedCounts(jobId),
        getExpectedModelSizeStats(jobId)
      );

      await ml.testExecution.logTestStep('job creation has detector results');
      await ml.api.assertDetectorResultsExist(jobId, 0);
    });

    it('job cloning opens the existing job in the categorization wizard', async () => {
      await ml.testExecution.logTestStep(
        'job cloning clicks the clone action and loads the single metric wizard'
      );
      await ml.jobTable.clickCloneJobAction(jobId);
      await ml.jobTypeSelection.assertCategorizationJobWizardOpen();
    });

    it('job cloning navigates through the categorization wizard, checks and sets all needed fields', async () => {
      await ml.testExecution.logTestStep('job cloning displays the time range step');
      await ml.jobWizardCommon.assertTimeRangeSectionExists();

      await ml.testExecution.logTestStep('job cloning sets the time range');
      await ml.jobWizardCommon.clickUseFullDataButton(
        'Apr 5, 2019 @ 11:25:35.770',
        'Nov 21, 2019 @ 00:01:13.923'
      );

      await ml.testExecution.logTestStep('job cloning displays the event rate chart');
      await ml.jobWizardCommon.assertEventRateChartExists();
      await ml.jobWizardCommon.assertEventRateChartHasData();

      await ml.testExecution.logTestStep('job cloning displays the pick fields step');
      await ml.jobWizardCommon.advanceToPickFieldsSection();

      await ml.testExecution.logTestStep('job cloning pre-fills field and aggregation');
      await ml.jobWizardCategorization.assertCategorizationDetectorTypeSelectionExists();

      await ml.testExecution.logTestStep('job cloning pre-fills the bucket span');
      await ml.jobWizardCommon.assertBucketSpanInputExists();
      await ml.jobWizardCommon.assertBucketSpanValue(bucketSpan);

      await ml.testExecution.logTestStep('job cloning displays the job details step');
      await ml.jobWizardCommon.advanceToJobDetailsSection();

      await ml.testExecution.logTestStep('job cloning does not pre-fill the job id');
      await ml.jobWizardCommon.assertJobIdInputExists();
      await ml.jobWizardCommon.assertJobIdValue('');

      await ml.testExecution.logTestStep('job cloning inputs the clone job id');
      await ml.jobWizardCommon.setJobId(jobIdClone);

      await ml.testExecution.logTestStep('job cloning pre-fills the job description');
      await ml.jobWizardCommon.assertJobDescriptionInputExists();
      await ml.jobWizardCommon.assertJobDescriptionValue(jobDescription);

      await ml.testExecution.logTestStep('job cloning pre-fills job groups');
      await ml.jobWizardCommon.assertJobGroupInputExists();
      await ml.jobWizardCommon.assertJobGroupSelection(jobGroups);

      await ml.testExecution.logTestStep('job cloning inputs the clone job group');
      await ml.jobWizardCommon.assertJobGroupInputExists();
      await ml.jobWizardCommon.addJobGroup('clone');
      await ml.jobWizardCommon.assertJobGroupSelection(jobGroupsClone);

      await ml.testExecution.logTestStep('job cloning opens the additional settings section');
      await ml.jobWizardCommon.ensureAdditionalSettingsSectionOpen();

      await ml.testExecution.logTestStep('job cloning persists custom urls');
      await ml.customUrls.assertCustomUrlLabel(0, 'check-kibana-dashboard');

      await ml.testExecution.logTestStep('job cloning persists assigned calendars');
      await ml.jobWizardCommon.assertCalendarsSelection([calendarId]);

      await ml.testExecution.logTestStep('job cloning opens the advanced section');
      await ml.jobWizardCommon.ensureAdvancedSectionOpen();

      await ml.testExecution.logTestStep('job cloning pre-fills the model plot switch');
      await ml.jobWizardCommon.assertModelPlotSwitchExists();
      await ml.jobWizardCommon.assertModelPlotSwitchEnabled(false);
      await ml.jobWizardCommon.assertModelPlotSwitchCheckedState(false);

      await ml.testExecution.logTestStep('job cloning pre-fills the dedicated index switch');
      await ml.jobWizardCommon.assertDedicatedIndexSwitchExists();
      await ml.jobWizardCommon.assertDedicatedIndexSwitchCheckedState(true);

      // MML during clone has changed in #61589
      // TODO: adjust test code to reflect the new behavior
      // await ml.testExecution.logTestStep('job cloning pre-fills the model memory limit');
      // await ml.jobWizardCommon.assertModelMemoryLimitInputExists();
      // await ml.jobWizardCommon.assertModelMemoryLimitValue(memoryLimit);

      await ml.testExecution.logTestStep('job cloning displays the validation step');
      await ml.jobWizardCommon.advanceToValidationSection();

      await ml.testExecution.logTestStep('job cloning displays the summary step');
      await ml.jobWizardCommon.advanceToSummarySection();
    });

    it('job cloning runs the clone job and displays it correctly in the job list', async () => {
      await ml.testExecution.logTestStep('job cloning creates the job and finishes processing');
      await ml.jobWizardCommon.assertCreateJobButtonExists();
      await ml.jobWizardCommon.createJobAndWaitForCompletion();

      await ml.testExecution.logTestStep('job cloning displays the created job in the job list');
      await ml.navigation.navigateToStackManagementMlSection('anomaly_detection', 'ml-jobs-list');

      await ml.jobTable.filterWithSearchString(jobIdClone, 1);

      await ml.testExecution.logTestStep(
        'job cloning displays details for the created job in the job list'
      );
      await ml.jobTable.assertJobRowFields(jobIdClone, getExpectedRow(jobIdClone, jobGroupsClone));

      await ml.jobExpandedDetails.assertJobRowDetailsCounts(
        jobIdClone,
        getExpectedCounts(jobIdClone),
        getExpectedModelSizeStats(jobIdClone)
      );

      await ml.testExecution.logTestStep('job cloning has detector results');
      await ml.api.assertDetectorResultsExist(jobId, 0);
    });

    it('deletes the cloned job', async () => {
      await ml.testExecution.logTestStep('job deletion has results for the job before deletion');
      await ml.api.assertJobResultsExist(jobIdClone);

      await ml.testExecution.logTestStep('job deletion triggers the delete action');
      await ml.jobTable.clickDeleteJobAction(jobIdClone);

      await ml.testExecution.logTestStep('job deletion confirms the delete modal');
      await ml.jobTable.confirmDeleteJobModal();
      await ml.api.waitForAnomalyDetectionJobNotToExist(jobIdClone, 30 * 1000);

      await ml.testExecution.logTestStep(
        'job deletion does not display the deleted job in the job list any more'
      );
      await ml.jobTable.filterWithSearchString(jobIdClone, 0);

      await ml.testExecution.logTestStep(
        'job deletion does not have results for the deleted job any more'
      );
      await ml.api.assertNoJobResultsExist(jobIdClone);
    });
  });
}
