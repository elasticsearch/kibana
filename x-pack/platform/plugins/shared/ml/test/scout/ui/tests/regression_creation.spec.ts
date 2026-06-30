/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Scout migration of:
 * x-pack/platform/test/functional/apps/ml/data_frame_analytics/group1/regression_creation.ts
 *
 * Covers the full end-to-end journey for creating a regression DFA job.
 * Tagged @local-stateful-classic because the test mutates global ML indices and
 * depends on the DFA feature which is not yet verified on serverless.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { test, ML_USERS } from '../fixtures';
import { createMLTestDashboard, cleanupDfaTest } from '../fixtures/helpers/dfa';

// ── Test data ────────────────────────────────────────────────────────────────

const testDiscoverCustomUrl = {
  label: 'Show data',
  indexName: 'ft_egs_regression',
  queryEntityFieldNames: ['stabf'],
};

const testDashboardCustomUrl = {
  label: 'Show dashboard',
  dashboardName: 'ML Test',
  queryEntityFieldNames: ['stabf'],
};

const testOtherCustomUrl = {
  label: 'elastic.co',
  url: 'https://www.elastic.co/',
};

const editedDescription = 'Edited description';

const jobId = `egs_1_${Date.now()}`;

const testData = {
  jobType: 'regression',
  jobId,
  jobDescription: 'Regression job based on ft_egs_regression dataset with runtime fields',
  source: 'ft_egs_regression',
  destinationIndex: `user-${jobId}`,
  dependentVariable: 'stab',
  trainingPercent: 20,
  runtimeFields: {
    uppercase_stab: {
      type: 'keyword',
      script: 'emit(params._source.stabf.toUpperCase())',
    },
  },
  advancedEditorContent: [
    '{',
    '  "description": "Regression job based on ft_egs_regression dataset with runtime fields",',
    '  "source": {',
  ],
  expected: {
    runtimeFieldsEditorContent: ['{', '  "uppercase_stab": {', '    "type": "keyword",'],
    row: {
      memoryStatus: 'ok',
      type: 'regression',
      status: 'stopped',
      progress: '100',
    },
  },
};

// ── Spec ─────────────────────────────────────────────────────────────────────

test.describe(
  'regression creation',
  { tag: [tags.stateful.classic[0], '@local-stateful-classic'] },
  () => {
    let dataViewId: string;
    let dashboardSavedObjectId: string;

    test.beforeAll(async ({ apiServices, kbnClient, esArchiver }) => {
      await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/ml/egs_regression');

      const { data: dataView } = await apiServices.dataViews.create({
        title: 'ft_egs_regression',
        name: 'ft_egs_regression',
        override: true,
      });
      dataViewId = dataView.id;
      dashboardSavedObjectId = await createMLTestDashboard(kbnClient);
    });

    test.afterAll(async ({ apiServices, kbnClient, esClient }) => {
      await cleanupDfaTest({
        apiServices,
        kbnClient,
        esClient,
        dataViewId,
        dashboardId: dashboardSavedObjectId,
        destinationIndex: testData.destinationIndex,
      });
    });

    test('electrical grid stability regression: full creation journey', async ({
      page,
      browserAuth,
      pageObjects: { dataFrameAnalytics },
      esClient,
    }) => {
      // The DFA job can take up to 5 minutes to complete; allow 15 min for the full journey.
      test.setTimeout(15 * 60 * 1000);

      await browserAuth.loginWithCustomRole(ML_USERS.mlPoweruser);

      // ── Step 1: loads the data frame analytics wizard ─────────────────

      await test.step('loads the data frame analytics wizard', async () => {
        await dataFrameAnalytics.gotoJobList();
        await dataFrameAnalytics.startCreation();
        await dataFrameAnalytics.selectSource(testData.source);
        await expect(
          page.testSubj.locator('mlAnalyticsCreateJobWizardConfigurationStep active')
        ).toBeVisible();
      });

      // ── Step 2: navigates through the wizard and sets all needed fields ─

      await test.step('navigates through the wizard and sets all needed fields', async () => {
        // Select job type
        await expect(
          page.testSubj.locator('mlAnalyticsCreateJobWizardJobTypeSelect')
        ).toBeVisible();
        await dataFrameAnalytics.selectJobType(testData.jobType);

        // Runtime mappings
        await expect(
          page.testSubj.locator('mlDataFrameAnalyticsRuntimeMappingsEditorSwitch')
        ).toBeVisible();
        await dataFrameAnalytics.enableRuntimeMappings();
        await dataFrameAnalytics.setRuntimeMappings(JSON.stringify(testData.runtimeFields));
        await dataFrameAnalytics.applyRuntimeMappings();
        const runtimeContent = await dataFrameAnalytics.getRuntimeMappingsContent();
        for (const expectedLine of testData.expected.runtimeFieldsEditorContent) {
          expect(runtimeContent).toContain(expectedLine);
        }

        // Dependent variable must appear for regression (unlike outlier detection)
        await expect(
          page.testSubj.locator(
            '~mlAnalyticsCreateJobWizardDependentVariableSelect > comboBoxInput'
          )
        ).toBeVisible();

        await dataFrameAnalytics.selectDependentVariable(testData.dependentVariable);

        // Training percent
        await expect(
          page.testSubj.locator('mlAnalyticsCreateJobWizardTrainingPercentSlider')
        ).toBeVisible();
        await dataFrameAnalytics.setTrainingPercent(testData.trainingPercent);

        // Source data preview
        await expect(page.testSubj.locator('mlAnalyticsCreationDataGrid loaded')).toBeVisible({
          timeout: 10_000,
        });

        // Include fields selection
        await expect(page.testSubj.locator('mlAnalyticsCreateJobWizardIncludesTable')).toBeVisible({
          timeout: 8_000,
        });

        // Scatterplot matrix: sample size and randomize query
        // (canvas pixel assertions skipped — Borealis TODO same as FTR)
        await dataFrameAnalytics.setScatterplotSampleSize('10000');
        await dataFrameAnalytics.setScatterplotRandomizeQuery(true);

        // Continue to additional options step
        await dataFrameAnalytics.continueToAdditionalOptions();
        await expect(
          page.testSubj.locator('mlAnalyticsCreateJobWizardModelMemoryInput')
        ).toBeVisible();
        // Model memory should be auto-populated
        const mmlValue = await page.testSubj
          .locator('mlAnalyticsCreateJobWizardModelMemoryInput')
          .inputValue();
        expect(mmlValue.length).toBeGreaterThan(0);

        // Continue to details step
        await dataFrameAnalytics.continueToDetails();

        await expect(page.testSubj.locator('mlAnalyticsCreateJobFlyoutJobIdInput')).toBeVisible();
        await dataFrameAnalytics.setJobId(testData.jobId);

        await expect(page.testSubj.locator('mlDFAnalyticsJobCreationJobDescription')).toBeVisible();
        await dataFrameAnalytics.setJobDescription(testData.jobDescription);

        // Destination index: verify switch defaults to true, then disable it and set custom index
        const sameAsIdSwitch = page.testSubj.locator(
          'mlCreationWizardUtilsJobIdAsDestIndexNameSwitch'
        );
        await expect(sameAsIdSwitch).toBeVisible();
        await expect(sameAsIdSwitch).toHaveAttribute('aria-checked', 'true');
        await dataFrameAnalytics.setDestIndexSameAsJobId(false);
        await expect(
          page.testSubj.locator('mlCreationWizardUtilsDestinationIndexInput')
        ).toBeVisible();
        await dataFrameAnalytics.setDestinationIndex(testData.destinationIndex);

        // Create data view switch should default to enabled
        const createDataViewSwitch = page.testSubj.locator('mlCreateDataViewSwitch');
        await expect(createDataViewSwitch).toBeAttached();
        await expect(createDataViewSwitch).toHaveAttribute('aria-checked', 'true');

        // Continue to validation step
        await dataFrameAnalytics.continueToValidation();
        // At least one validation callout must be present
        await expect(page.testSubj.locator('~mlValidationCallout')).not.toHaveCount(0);

        // Open advanced JSON editor to verify content, then close
        await dataFrameAnalytics.openAdvancedEditor();
        const advancedContent = await dataFrameAnalytics.getAdvancedEditorContent();
        for (const expectedLine of testData.advancedEditorContent) {
          expect(advancedContent).toContain(expectedLine);
        }
        await dataFrameAnalytics.closeAdvancedEditor();

        // Continue to the create step
        await dataFrameAnalytics.continueToCreate();
        await expect(page.testSubj.locator('mlAnalyticsCreateJobWizardCreateButton')).toBeVisible();
        await expect(
          page.testSubj.locator('mlAnalyticsCreateJobWizardStartJobSwitch')
        ).toHaveAttribute('aria-checked', 'true');
      });

      // ── Step 3: runs the analytics job and displays it in the job list ─

      await test.step('runs the analytics job and displays it correctly in the job list', async () => {
        await dataFrameAnalytics.createAndStartJob();

        // Wait for the job to finish (up to 5 minutes)
        await expect
          .poll(
            async () => {
              const { data_frame_analytics: statsList } =
                await esClient.ml.getDataFrameAnalyticsStats({
                  id: testData.jobId,
                  allow_no_match: true,
                });
              return statsList[0]?.state;
            },
            { timeout: 5 * 60 * 1000, intervals: [5_000] }
          )
          .toBe('stopped');

        // Navigate to the job list and verify key table elements
        await dataFrameAnalytics.gotoJobList();
        await expect(page.testSubj.locator('~mlAnalyticsTable')).toBeVisible();
        await expect(page.testSubj.locator('mlAnalyticsStatsBar')).toBeVisible();

        // Filter to our job
        await dataFrameAnalytics.filterByJobId(testData.jobId);

        // Poll until the table row reflects the completed state
        await expect
          .poll(async () => (await dataFrameAnalytics.getRowData(testData.jobId)).status, {
            timeout: 60_000,
            intervals: [3_000],
          })
          .toBe(testData.expected.row.status);

        const rowData = await dataFrameAnalytics.getRowData(testData.jobId);
        expect(rowData).toMatchObject({
          id: testData.jobId,
          description: testData.jobDescription,
          memoryStatus: testData.expected.row.memoryStatus,
          sourceIndex: testData.source,
          destinationIndex: testData.destinationIndex,
          type: testData.expected.row.type,
          status: testData.expected.row.status,
          progress: testData.expected.row.progress,
        });

        // Expand row details and verify key sections
        const row = page.testSubj
          .locator('~mlAnalyticsTable')
          .locator(`[data-test-subj~="row-${testData.jobId}"]`);
        await row.locator('[data-test-subj="mlAnalyticsTableRowDetailsToggle"]').click();

        const details = page.testSubj.locator(`mlAnalyticsTableRowDetails-${testData.jobId}`);
        await expect(details).toBeVisible();

        // Verify 3 detail tabs exist
        await expect(page.testSubj.locator('~mlAnalyticsTableRowDetailsTab')).toHaveCount(3);

        // Verify all expected sections exist
        for (const section of ['state', 'stats', 'counts', 'progress', 'analysisStats']) {
          await expect(
            details.locator(
              `[data-test-subj~="mlAnalyticsTableRowDetailsSection"][data-test-subj~="${section}"]`
            )
          ).toBeVisible({ timeout: 5_000 });
        }

        // State section should report 'stopped'
        await expect(
          details.locator(
            '[data-test-subj~="mlAnalyticsTableRowDetailsSection"][data-test-subj~="state"]'
          )
        ).toContainText('stopped');

        // Collapse the details row
        await row.locator('[data-test-subj="mlAnalyticsTableRowDetailsToggle"]').click();
        await expect(details).toBeHidden();
      });

      // ── Step 4: adds discover custom URL ─────────────────────────────

      await test.step('adds discover custom url to the analytics job', async () => {
        await dataFrameAnalytics.openEditFlyout(testData.jobId);
        await dataFrameAnalytics.openCustomUrlsTab();
        await dataFrameAnalytics.addDiscoverCustomUrl(testDiscoverCustomUrl);
        await expect(
          page.testSubj
            .locator('~mlJobEditCustomUrlItemLabel')
            .locator(`input[value="${testDiscoverCustomUrl.label}"]`)
        ).toBeVisible();
        await dataFrameAnalytics.submitEdit();
      });

      // ── Step 5: adds dashboard custom URL ─────────────────────────────

      await test.step('adds dashboard custom url to the analytics job', async () => {
        await dataFrameAnalytics.openEditFlyout(testData.jobId);
        await dataFrameAnalytics.openCustomUrlsTab();
        await dataFrameAnalytics.addDashboardCustomUrl(testDashboardCustomUrl);
        await expect(
          page.testSubj
            .locator('~mlJobEditCustomUrlItemLabel')
            .locator(`input[value="${testDashboardCustomUrl.label}"]`)
        ).toBeVisible();
        await dataFrameAnalytics.submitEdit();
      });

      // ── Step 6: adds other type custom URL ────────────────────────────

      await test.step('adds other custom url type to the analytics job', async () => {
        await dataFrameAnalytics.openEditFlyout(testData.jobId);
        await dataFrameAnalytics.openCustomUrlsTab();
        await dataFrameAnalytics.addOtherTypeCustomUrl(testOtherCustomUrl);
        await expect(
          page.testSubj
            .locator('~mlJobEditCustomUrlItemLabel')
            .locator(`input[value="${testOtherCustomUrl.label}"]`)
        ).toBeVisible();
        await dataFrameAnalytics.submitEdit();
      });

      // ── Step 7: edits the analytics job ──────────────────────────────

      await test.step('edits the analytics job and displays it correctly in the job list', async () => {
        await dataFrameAnalytics.gotoJobList();
        await dataFrameAnalytics.filterByJobId(testData.jobId);
        await dataFrameAnalytics.openEditFlyout(testData.jobId);

        await expect(page.testSubj.locator('mlAnalyticsEditFlyoutDescriptionInput')).toBeVisible();
        await dataFrameAnalytics.editDescription(editedDescription);

        await expect(
          page.testSubj.locator('mlAnalyticsEditFlyoutmodelMemoryLimitInput')
        ).toBeVisible();
        await dataFrameAnalytics.editModelMemoryLimit('21mb');

        await dataFrameAnalytics.submitEdit();

        // Verify updated values in the table
        await dataFrameAnalytics.filterByJobId(testData.jobId);
        const rowDataAfterEdit = await dataFrameAnalytics.getRowData(testData.jobId);
        expect(rowDataAfterEdit).toMatchObject({
          id: testData.jobId,
          description: editedDescription,
          memoryStatus: testData.expected.row.memoryStatus,
          sourceIndex: testData.source,
          destinationIndex: testData.destinationIndex,
          type: testData.expected.row.type,
          status: testData.expected.row.status,
          progress: testData.expected.row.progress,
        });

        // Destination index must exist and contain documents
        const countResult = await esClient.count({ index: testData.destinationIndex });
        expect(countResult.count).toBeGreaterThan(0);

        // Results view — regression-specific panels
        await dataFrameAnalytics.openResultsView(testData.jobId);
        await expect(
          page.testSubj.locator('mlDFExpandableSection-RegressionEvaluation')
        ).toBeVisible({ timeout: 10_000 });
        await expect(page.testSubj.locator('mlDFAnalyticsRegressionGenMSEstat')).toBeVisible({
          timeout: 10_000,
        });
        await expect(page.testSubj.locator('mlDFAnalyticsRegressionGenRSquaredStat')).toBeVisible();
        await expect(page.testSubj.locator('mlDFAnalyticsRegressionTrainingMSEstat')).toBeVisible();
        await expect(
          page.testSubj.locator('mlDFAnalyticsRegressionTrainingRSquaredStat')
        ).toBeVisible();
        await expect(page.testSubj.locator('mlDFAnalyticsExplorationTablePanel')).toBeVisible();
        await expect(page.testSubj.locator('mlExplorationDataGrid loaded')).toBeVisible({
          timeout: 10_000,
        });
        await expect(
          page.testSubj.locator('mlDFAnalyticsExplorationQueryBarFilterButtons')
        ).toBeVisible();

        // Scatterplot matrix controls (canvas assertions skipped — Borealis TODO)
        await dataFrameAnalytics.setScatterplotSampleSize('10000');
        await dataFrameAnalytics.setScatterplotRandomizeQuery(true);
      });

      // ── Step 8: displays the analytics job in the map view ────────────

      await test.step('displays the analytics job in the map view', async () => {
        await dataFrameAnalytics.gotoJobList();
        await dataFrameAnalytics.filterByJobId(testData.jobId);
        await dataFrameAnalytics.openMapView(testData.jobId);

        await expect(page.testSubj.locator('mlPageDataFrameAnalyticsMap')).toBeVisible();
        await expect(page.testSubj.locator('mlPageDataFrameAnalyticsMapLegend')).toBeVisible();
        await expect(page.testSubj.locator('mlPageDataFrameAnalyticsMapGraph')).toBeVisible();
      });

      // ── Step 9: opens job details flyout in the map view ──────────────

      await test.step('opens job details flyout in the map view', async () => {
        await dataFrameAnalytics.gotoJobList();
        await dataFrameAnalytics.filterByJobId(testData.jobId);
        await dataFrameAnalytics.openMapView(testData.jobId);

        await expect(page.testSubj.locator('mlPageDataFrameAnalyticsMap')).toBeVisible();

        await dataFrameAnalytics.openMapJobBadge(testData.jobId);
        await dataFrameAnalytics.openMapJobDetailsFlyout(testData.jobId);

        await expect(page.testSubj.locator('analyticsDetailsFlyout')).toBeVisible();
        await expect(
          page.testSubj.locator(`analyticsDetailsFlyout-${testData.jobId}`)
        ).toBeVisible();
      });
    });
  }
);
