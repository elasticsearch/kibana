/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../../../ftr_provider_context';
import type { FieldStatsType } from '../../common/types';

export default function ({ getService }: FtrProviderContext) {
  const config = getService('config');
  const esNode = config.get('esTestCluster.ccs')
    ? getService('remoteEsArchiver' as 'esArchiver')
    : getService('esArchiver');
  const ml = getService('ml');
  const browser = getService('browser');

  const jobId = `fq_single_1_${Date.now()}`;
  const jobIdClone = `${jobId}_clone`;
  const jobDescription =
    'Create single metric job based on the farequote dataset with 30m bucketspan and mean(responsetime)';
  const jobGroups = ['automated', 'farequote', 'single-metric'];
  const jobGroupsClone = [...jobGroups, 'clone'];
  const aggAndFieldIdentifier = 'Mean(responsetime)';
  const bucketSpan = '30m';
  const memoryLimit = '15mb';

  function getExpectedRow(expectedJobId: string, expectedJobGroups: string[]) {
    return {
      id: expectedJobId,
      description: jobDescription,
      jobGroups: [...new Set(expectedJobGroups)].sort(),
      recordCount: '2,399',
      memoryStatus: 'ok',
      datafeedState: 'stopped',
      latestTimestamp: '2016-02-11 23:56:59',
    };
  }

  function getExpectedCounts(expectedJobId: string) {
    return {
      job_id: expectedJobId,
      processed_record_count: '2,399',
      processed_field_count: '4,798',
      input_bytes: '180.6 KB',
      input_field_count: '4,798',
      invalid_date_count: '0',
      missing_field_count: '0',
      out_of_order_timestamp_count: '0',
      empty_bucket_count: '0',
      sparse_bucket_count: '0',
      bucket_count: '239',
      earliest_record_timestamp: '2016-02-07 00:02:50',
      latest_record_timestamp: '2016-02-11 23:56:59',
      input_record_count: '2,399',
      latest_bucket_timestamp: '2016-02-11 23:30:00',
    };
  }

  function getExpectedModelSizeStats(expectedJobId: string) {
    return {
      job_id: expectedJobId,
      result_type: 'model_size_stats',
      model_bytes_exceeded: '0.0 B',
      total_by_field_count: '3',
      total_over_field_count: '0',
      total_partition_field_count: '2',
      bucket_allocation_failures_count: '0',
      memory_status: 'ok',
      timestamp: '2016-02-11 23:00:00',
    };
  }

  const calendarId = `wizard-test-calendar_${Date.now()}`;
  const remoteName = 'ftr-remote:';
  const esIndexPatternName = 'ft_farequote';
  const esIndexPatternString = config.get('esTestCluster.ccs')
    ? remoteName + esIndexPatternName
    : esIndexPatternName;

  const fieldStatsEntries = [
    {
      fieldName: '@version.keyword',
      type: 'keyword' as FieldStatsType,
      expectedValues: ['1'],
    },
  ];

  describe('single metric', function () {
    this.tags(['ml']);
    before(async () => {
      await esNode.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/ml/farequote');
      await ml.testResources.createDataViewIfNeeded(esIndexPatternString, '@timestamp');
      await ml.testResources.setKibanaTimeZoneToUTC();

      await ml.api.createCalendar(calendarId);
      await ml.securityUI.loginAsMlPowerUser();
    });

    after(async () => {
      await ml.api.cleanMlIndices();
      await ml.testResources.deleteDataViewByTitle(esIndexPatternString);
    });

    it('job creation loads the single metric wizard for the source data', async () => {
      await ml.testExecution.logTestStep('job creation loads the job management page');
      await ml.navigation.navigateToStackManagementMlSection('anomaly_detection', 'ml-jobs-list');

      await ml.testExecution.logTestStep('job creation loads the new job source selection page');
      await ml.jobManagement.navigateToNewJobSourceSelection();

      await ml.testExecution.logTestStep('job creation loads the job type selection page');
      await ml.jobSourceSelection.selectSourceForAnomalyDetectionJob(esIndexPatternString);

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

      await ml.testExecution.logTestStep('job creation opens field stats flyout from agg input');
      await ml.jobWizardCommon.assertAggAndFieldInputExists();
      for (const { fieldName, type: fieldType, expectedValues } of fieldStatsEntries) {
        await ml.jobWizardCommon.assertFieldStatFlyoutContentFromAggSelectionInputTrigger(
          fieldName,
          fieldType,
          expectedValues
        );
      }

      await ml.testExecution.logTestStep('job creation selects field and aggregation');
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

    it('job cloning creates a temporary data view and opens the single metric wizard if a matching data view does not exist', async () => {
      await ml.testExecution.logTestStep('delete data view used by job');
      await ml.testResources.deleteDataViewByTitle(esIndexPatternString);

      // Refresh page to ensure page has correct cache of data views
      await browser.refresh();

      await ml.testExecution.logTestStep(
        'job cloning clicks the clone action and loads the single metric wizard'
      );
      await ml.jobTable.clickCloneJobAction(jobId);
      await ml.jobTypeSelection.assertSingleMetricJobWizardOpen();
    });

    it('job cloning opens the existing job in the single metric wizard', async () => {
      await ml.testExecution.logTestStep('recreate data view used by job');
      await ml.testResources.createDataViewIfNeeded(esIndexPatternString, '@timestamp');

      await ml.navigation.navigateToStackManagementMlSection('anomaly_detection', 'ml-jobs-list');

      // Refresh page to ensure page has correct cache of data views
      await browser.refresh();

      await ml.testExecution.logTestStep(
        'job cloning clicks the clone action and loads the single metric wizard'
      );
      await ml.jobTable.clickCloneJobAction(jobId);
      await ml.jobTypeSelection.assertSingleMetricJobWizardOpen();
    });

    it('job cloning navigates through the single metric wizard, checks and sets all needed fields', async () => {
      await ml.testExecution.logTestStep('job cloning displays the time range step');
      await ml.jobWizardCommon.assertTimeRangeSectionExists();

      await ml.testExecution.logTestStep('job cloning sets the time range');
      await ml.jobWizardCommon.clickUseFullDataButton(
        'Feb 7, 2016 @ 00:00:00.000',
        'Feb 11, 2016 @ 23:59:54.000'
      );

      await ml.testExecution.logTestStep('job cloning displays the event rate chart');
      await ml.jobWizardCommon.assertEventRateChartExists();
      await ml.jobWizardCommon.assertEventRateChartHasData();

      await ml.testExecution.logTestStep('job cloning displays the pick fields step');
      await ml.jobWizardCommon.advanceToPickFieldsSection();

      await ml.testExecution.logTestStep('job cloning pre-fills field and aggregation');
      await ml.jobWizardCommon.assertAggAndFieldSelection([aggAndFieldIdentifier]);
      await ml.jobWizardCommon.assertAnomalyChartExists('LINE');

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
      await ml.jobWizardCommon.assertModelPlotSwitchCheckedState(true);

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

    it('job cloning with too short of a job creation time range results in validation callouts', async () => {
      await ml.testExecution.logTestStep('job cloning loads the job management page');
      await ml.navigation.navigateToStackManagementMlSection('anomaly_detection', 'ml-jobs-list');

      await ml.testExecution.logTestStep(`cloning job: [${jobId}]`);
      await ml.jobTable.clickCloneJobAction(jobId);

      await ml.testExecution.logTestStep('job cloning displays the time range step');
      await ml.jobWizardCommon.assertTimeRangeSectionExists();

      await ml.testExecution.logTestStep('job cloning sets the time range');
      await ml.jobWizardCommon.clickUseFullDataButton(
        'Feb 7, 2016 @ 00:00:00.000',
        'Feb 11, 2016 @ 23:59:54.000'
      );

      await ml.jobWizardCommon.goToTimeRangeStep();

      const { startDate: origStartDate } = await ml.jobWizardCommon.getSelectedDateRange();

      await ml.testExecution.logTestStep('calculate the new end date');
      const shortDurationEndDate: string = `${origStartDate?.split(':', 1)[0]}:01:00.000`;

      await ml.testExecution.logTestStep('set the new end date');
      await ml.jobWizardCommon.setTimeRange({ endTime: shortDurationEndDate });

      // assert time is set as expected
      await ml.jobWizardCommon.assertDateRangeSelection(
        origStartDate as string,
        shortDurationEndDate
      );

      await ml.jobWizardCommon.advanceToPickFieldsSection();
      await ml.jobWizardCommon.advanceToJobDetailsSection();
      await ml.jobWizardCommon.assertJobIdInputExists();
      await ml.jobWizardCommon.setJobId(`${jobIdClone}-again`);
      await ml.jobWizardCommon.advanceToValidationSection();
      await ml.jobWizardCommon.assertValidationCallouts([
        'mlValidationCallout warning',
        'mlValidationCallout error',
      ]);
      await ml.jobWizardCommon.assertCalloutText(
        'mlValidationCallout warning',
        /Time range\s*The selected or available time range might be too short/
      );

      await ml.jobWizardCommon.goToTimeRangeStep();
      await ml.jobWizardCommon.clickUseFullDataButton(
        'Feb 7, 2016 @ 00:00:00.000',
        'Feb 11, 2016 @ 23:59:54.000'
      );
      await ml.jobWizardCommon.goToValidationStep();
      await ml.jobWizardCommon.assertValidationCallouts(['mlValidationCallout success']);
      await ml.jobWizardCommon.assertCalloutText(
        'mlValidationCallout success',
        /Time range\s*Valid and long enough to model patterns in the data/
      );
    });

    it('job creation and toggling model change annotation triggers enable annotation recommendation callout', async () => {
      await ml.jobWizardCommon.goToJobDetailsStep();
      await ml.jobWizardCommon.ensureAdvancedSectionOpen();

      await ml.commonUI.toggleSwitchIfNeeded('mlJobWizardSwitchAnnotations', false);
      await ml.jobWizardCommon.assertAnnotationRecommendationCalloutVisible();

      await ml.commonUI.toggleSwitchIfNeeded('mlJobWizardSwitchAnnotations', true);
      await ml.jobWizardCommon.assertAnnotationRecommendationCalloutVisible(false);
    });

    it('job creation memory limit too large results in validation callout', async () => {
      await ml.jobWizardCommon.goToJobDetailsStep();

      const tooLarge = '100000000MB';
      await ml.jobWizardCommon.setModelMemoryLimit(tooLarge);

      await ml.jobWizardCommon.advanceToValidationSection();
      await ml.jobWizardCommon.assertValidationCallouts(['mlValidationCallout warning']);
      await ml.jobWizardCommon.assertCalloutText(
        'mlValidationCallout warning',
        /Job will not be able to run in the current cluster because model memory limit is higher than/
      );
    });
  });
}
