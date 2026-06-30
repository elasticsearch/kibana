/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Scout migration of:
 * x-pack/platform/test/functional/apps/ml/data_frame_analytics/group1/outlier_detection_creation.ts
 *
 * Covers the full end-to-end journey for creating an outlier detection DFA job.
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
  indexName: 'ft_ihp_outlier',
  queryEntityFieldNames: ['SaleType'],
};

const testDashboardCustomUrl = {
  label: 'Show dashboard',
  dashboardName: 'ML Test',
  queryEntityFieldNames: ['SaleType'],
};

const testOtherCustomUrl = {
  label: 'elastic.co',
  url: 'https://www.elastic.co/',
};

const editedDescription = 'Edited description';

const jobId = `ihp_1_${Date.now()}`;

const testData = {
  jobType: 'outlier_detection',
  jobId,
  jobDescription: 'Outlier detection job based on ft_ihp_outlier dataset with runtime fields',
  source: 'ft_ihp_outlier',
  destinationIndex: `user-${jobId}`,
  runtimeFields: {
    lowercase_central_air: {
      type: 'keyword',
      script: 'emit(params._source.CentralAir.toLowerCase())',
    },
  },
  advancedEditorContent: [
    '{',
    '  "description": "Outlier detection job based on ft_ihp_outlier dataset with runtime fields",',
    '  "source": {',
  ],
  expected: {
    histogramCharts: [
      { id: '1stFlrSF' },
      { id: 'BsmtFinSF1' },
      { id: 'BsmtQual' },
      { id: 'CentralAir' },
      { id: 'Condition2' },
    ],
    runtimeFieldsEditorContent: ['{', '  "lowercase_central_air": {', '    "type": "keyword",'],
    row: {
      memoryStatus: 'ok',
      type: 'outlier_detection',
      status: 'stopped',
      progress: '100',
    },
  },
};

// ── Spec ─────────────────────────────────────────────────────────────────────

test.describe(
  'outlier detection creation',
  { tag: [tags.stateful.classic[0], '@local-stateful-classic'] },
  () => {
    let dataViewId: string;
    let dashboardSavedObjectId: string;

    test.beforeAll(async ({ apiServices, kbnClient, esArchiver }) => {
      await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/ml/ihp_outlier');

      const { data: dataView } = await apiServices.dataViews.create({
        title: 'ft_ihp_outlier',
        name: 'ft_ihp_outlier',
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

    test('iowa house prices outlier detection: full creation journey', async ({
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
        // Set runtime field content
        await dataFrameAnalytics.setRuntimeMappings(JSON.stringify(testData.runtimeFields));
        await dataFrameAnalytics.applyRuntimeMappings();
        const runtimeContent = await dataFrameAnalytics.getRuntimeMappingsContent();
        for (const expectedLine of testData.expected.runtimeFieldsEditorContent) {
          expect(runtimeContent).toContain(expectedLine);
        }

        // Dependent variable and training percent must NOT appear for outlier detection
        await expect(
          page.testSubj.locator(
            '~mlAnalyticsCreateJobWizardDependentVariableSelect > comboBoxInput'
          )
        ).toBeHidden();
        await expect(
          page.testSubj.locator('mlAnalyticsCreateJobWizardTrainingPercentSlider')
        ).toBeHidden();

        // Source data preview
        await expect(page.testSubj.locator('mlAnalyticsCreationDataGrid loaded')).toBeVisible({
          timeout: 10_000,
        });

        // Enable histogram charts and verify a subset of expected charts.
        // For small datasets the charts auto-enable (aria-pressed='true');
        // only click the button if charts are not already showing.
        const histogramBtn = page.testSubj.locator('mlAnalyticsCreationDataGridHistogramButton');
        const isAlreadyPressed = (await histogramBtn.getAttribute('aria-pressed')) === 'true';
        if (!isAlreadyPressed) {
          await histogramBtn.click();
        }
        for (const chart of testData.expected.histogramCharts) {
          await expect(page.testSubj.locator(`mlDataGridChart-${chart.id}`)).toBeVisible({
            timeout: 10_000,
          });
        }

        // Include fields selection
        await expect(page.testSubj.locator('mlAnalyticsCreateJobWizardIncludesTable')).toBeVisible({
          timeout: 8_000,
        });

        // Field stats flyout from include field trigger (field '1stFlrSF')
        await page.testSubj
          .locator('mlAnalyticsCreateJobWizardIncludesSelect')
          .scrollIntoViewIfNeeded();
        await page.testSubj
          .locator(
            '~mlAnalyticsCreateJobWizardIncludesSelect > ~mlInspectFieldStatsButton-1stFlrSF'
          )
          .click();
        await expect(page.testSubj.locator('~mlFieldStatsFlyoutContent')).toBeVisible({
          timeout: 5_000,
        });
        await page.keyboard.press('Escape');

        // Scatterplot matrix: sample size and randomize query
        await dataFrameAnalytics.setScatterplotSampleSize('10000');
        await dataFrameAnalytics.setScatterplotRandomizeQuery(true);
        // Scatterplot matrix canvas assertions are skipped (Borealis TODO in FTR)

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
        // At least one validation callout must be present (the UI may render both warning and success)
        await expect(page.testSubj.locator('~mlValidationCallout')).not.toHaveCount(0);

        // Briefly open the advanced JSON editor to verify it shows the expected content, then close
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
        // Create and start the job, navigate back to the job list
        await dataFrameAnalytics.createAndStartJob();

        // Wait for the job to finish (up to 5 minutes)
        // State is in the stats API, not the config returned by getAllJobs()
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

        // The ML UI auto-refreshes on a timer and may lag behind the ES stats API.
        // Poll the table row until the status reflects the completed job.
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

        // Expand row details and verify key sections and status
        const row = page.testSubj
          .locator('~mlAnalyticsTable')
          .locator(`[data-test-subj~="row-${testData.jobId}"]`);
        await row.locator('[data-test-subj="mlAnalyticsTableRowDetailsToggle"]').click();

        const details = page.testSubj.locator(`mlAnalyticsTableRowDetails-${testData.jobId}`);
        await expect(details).toBeVisible();

        // Verify 3 detail tabs exist
        await expect(page.testSubj.locator('~mlAnalyticsTableRowDetailsTab')).toHaveCount(3);

        // Verify all expected sections exist (use ~= whole-word match to avoid substring
        // collisions, e.g. "analysisStats" vs "analysisStats-table")
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

        // Counts section should show a training document count (exact value asserted in API test)
        await expect(
          details.locator(
            '[data-test-subj~="mlAnalyticsTableRowDetailsSection"][data-test-subj~="counts"]'
          )
        ).toContainText(/\d+/);

        // Collapse the details row again
        await row.locator('[data-test-subj="mlAnalyticsTableRowDetailsToggle"]').click();
        await expect(details).toBeHidden();
      });

      // ── Step 4: adds discover custom URL ─────────────────────────────

      await test.step('adds discover custom url to the analytics job', async () => {
        await dataFrameAnalytics.openEditFlyout(testData.jobId);
        await dataFrameAnalytics.openCustomUrlsTab();
        await dataFrameAnalytics.addDiscoverCustomUrl(testDiscoverCustomUrl);
        // The label is stored in an <input> value, not text content — search inside the form row
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
        // Navigate to the job list to get a fresh table, then open edit flyout
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

        // Verify the updated values appear in the table row
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

        // Results view
        await dataFrameAnalytics.openResultsView(testData.jobId);
        await expect(page.testSubj.locator('mlDFExpandableSection-results')).toBeVisible();
        await expect(page.testSubj.locator('mlExplorationDataGrid loaded')).toBeVisible({
          timeout: 10_000,
        });

        // Data grid must have at least one row
        await expect(
          page.testSubj
            .locator('mlExplorationDataGrid loaded')
            .locator('[data-test-subj="dataGridRowCell"]')
        ).not.toHaveCount(0);

        // Scatterplot matrix controls (canvas pixel assertions skipped — Borealis TODO)
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

        // mlPageDataFrameAnalyticsMapTitle is on a FormattedMessage (not a DOM element);
        // assert the map container and graph canvas instead
        await expect(page.testSubj.locator('mlPageDataFrameAnalyticsMap')).toBeVisible();
        await expect(page.testSubj.locator('mlPageDataFrameAnalyticsMapGraph')).toBeVisible();
      });
    });
  }
);
