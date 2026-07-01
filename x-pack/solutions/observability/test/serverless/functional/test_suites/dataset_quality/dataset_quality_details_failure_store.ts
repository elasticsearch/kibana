/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { IndexTemplateName } from '@kbn/synthtrace/src/lib/logs/custom_logsdb_index_templates';
import type { FtrProviderContext } from '../../ftr_provider_context';
import { getLogsForDataset, defaultNamespace, processors } from './data';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const PageObjects = getPageObjects(['datasetQuality', 'svlCommonPage']);
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');
  const synthtrace = getService('svlLogsSynthtraceClient');
  const to = '2024-01-01T12:00:00.000Z';

  const failureStoreDatasetName = 'synth.2';
  const failureStoreDataStreamName = `logs-${failureStoreDatasetName}-${defaultNamespace}`;

  const noFailureStoreDatasetName = 'synth.no-fs';
  const noFailureStoreDataStreamName = `logs-${noFailureStoreDatasetName}-${defaultNamespace}`;

  describe('Dataset quality details failure store', function () {
    // This disables the forward-compatibility test for Elasticsearch 8.19 with Kibana and ES 9.0.
    // These versions are not expected to work together. Note: Failure store is not available in ES 9.0,
    // and running these tests will result in an "unknown index privilege [read_failure_store]" error.
    this.onlyEsVersion('8.19 || >=9.1');

    before(async () => {
      await synthtrace.createCustomPipeline(processors, 'synth.2@pipeline');
      await synthtrace.createCustomPipeline(processors, 'synth.no-fs@pipeline');
      await synthtrace.createComponentTemplate({
        name: 'synth.2@custom',
        dataStreamOptions: {
          failure_store: {
            enabled: true,
          },
        },
      });
      await synthtrace.createComponentTemplate({
        name: 'synth.no-fs@custom',
        dataStreamOptions: {
          failure_store: {
            enabled: false,
          },
        },
      });
      await synthtrace.createIndexTemplate(IndexTemplateName.Synht2);
      await synthtrace.createIndexTemplate(IndexTemplateName.NoFailureStore);

      await synthtrace.index([
        // Index logs for synth.2 dataset
        getLogsForDataset({ to, count: 5, dataset: failureStoreDatasetName }),
        // Index logs for synth.no-fs dataset
        getLogsForDataset({ to, count: 5, dataset: noFailureStoreDatasetName }),
      ]);
    });

    after(async () => {
      await synthtrace.clean();
      await synthtrace.deleteIndexTemplate(IndexTemplateName.NoFailureStore);
      await synthtrace.deleteComponentTemplate('synth.no-fs@custom');
      await synthtrace.deleteCustomPipeline('synth.no-fs@pipeline');
      await synthtrace.deleteIndexTemplate(IndexTemplateName.Synht2);
      await synthtrace.deleteComponentTemplate('synth.2@custom');
      await synthtrace.deleteCustomPipeline('synth.2@pipeline');
    });

    describe('without failure store permissions', () => {
      before(async () => {
        await PageObjects.svlCommonPage.loginAsViewer();
      });

      it('should show "No failure store" card when failure store is disabled', async () => {
        const { datasetQualityDetailsSummaryCardNoFailureStore } =
          PageObjects.datasetQuality.testSubjectSelectors;
        await PageObjects.datasetQuality.navigateToDetails({
          dataStream: noFailureStoreDataStreamName,
        });

        await testSubjects.existOrFail(datasetQualityDetailsSummaryCardNoFailureStore);
        const failedDocsCard = await testSubjects.getVisibleText(
          datasetQualityDetailsSummaryCardNoFailureStore
        );
        expect(failedDocsCard).to.contain('No failure store');
      });

      it('should show "No failure store" card when failure store is enabled', async () => {
        const { datasetQualityDetailsSummaryCardNoFailureStore } =
          PageObjects.datasetQuality.testSubjectSelectors;
        await PageObjects.datasetQuality.navigateToDetails({
          dataStream: failureStoreDataStreamName,
        });

        await testSubjects.existOrFail(datasetQualityDetailsSummaryCardNoFailureStore);
        const failedDocsCard = await testSubjects.getVisibleText(
          datasetQualityDetailsSummaryCardNoFailureStore
        );
        expect(failedDocsCard).to.contain('No failure store');
      });
    });

    describe('with failure store permissions', () => {
      before(async () => {
        await PageObjects.svlCommonPage.loginAsAdmin();
      });
      it('should show "No failure store" card when failure store is disabled', async () => {
        const { datasetQualityDetailsSummaryCardNoFailureStore } =
          PageObjects.datasetQuality.testSubjectSelectors;
        await PageObjects.datasetQuality.navigateToDetails({
          dataStream: noFailureStoreDataStreamName,
        });

        await testSubjects.existOrFail(datasetQualityDetailsSummaryCardNoFailureStore);
        const failedDocsCard = await testSubjects.getVisibleText(
          datasetQualityDetailsSummaryCardNoFailureStore
        );
        expect(failedDocsCard).to.contain('No failure store');
      });

      it('should open failure store modal and save new config', async () => {
        const {
          datasetQualityDetailsSummaryCardFailedDocuments,
          datasetQualityDetailsSummaryCardNoFailureStore,
          datasetQualityDetailsEnableFailureStoreButton,
          editFailureStoreModal,
          failureStoreModalSaveButton,
          enableFailureStoreToggle,
        } = PageObjects.datasetQuality.testSubjectSelectors;

        await PageObjects.datasetQuality.navigateToDetails({
          dataStream: noFailureStoreDataStreamName,
        });

        await testSubjects.existOrFail(datasetQualityDetailsSummaryCardNoFailureStore);
        await testSubjects.missingOrFail(datasetQualityDetailsSummaryCardFailedDocuments);

        await testSubjects.click(datasetQualityDetailsEnableFailureStoreButton);

        await testSubjects.existOrFail(editFailureStoreModal);

        const saveModalButton = await testSubjects.find(failureStoreModalSaveButton);
        expect(await saveModalButton.isEnabled()).to.be(false);

        await testSubjects.click(enableFailureStoreToggle);

        await testSubjects.clickWhenNotDisabled(failureStoreModalSaveButton);

        await testSubjects.missingOrFail(editFailureStoreModal);

        await testSubjects.existOrFail(datasetQualityDetailsSummaryCardFailedDocuments);

        await testSubjects.missingOrFail(datasetQualityDetailsSummaryCardNoFailureStore);

        const failedDocsCard = await testSubjects.getVisibleText(
          datasetQualityDetailsSummaryCardFailedDocuments
        );
        expect(failedDocsCard).to.contain('Failed documents');
      });

      it('should show failed docs count when failure store is enabled', async () => {
        await PageObjects.datasetQuality.navigateToDetails({
          dataStream: failureStoreDataStreamName,
        });

        await testSubjects.existOrFail(
          PageObjects.datasetQuality.testSubjectSelectors
            .datasetQualityDetailsSummaryCardFailedDocuments
        );
        const failedDocsCard = await testSubjects.getVisibleText(
          PageObjects.datasetQuality.testSubjectSelectors
            .datasetQualityDetailsSummaryCardFailedDocuments
        );
        expect(failedDocsCard).to.not.contain('No failure store');
      });

      it('should edit failure store', async () => {
        const {
          datasetQualityDetailsSummaryCardFailedDocuments,
          editFailureStoreIcon,
          editFailureStoreModal,
          failureStoreModalSaveButton,
          enableFailureStoreToggle,
          datasetQualityDetailsSummaryCardNoFailureStore,
        } = PageObjects.datasetQuality.testSubjectSelectors;

        await PageObjects.datasetQuality.navigateToDetails({
          dataStream: failureStoreDataStreamName,
        });

        await testSubjects.existOrFail(datasetQualityDetailsSummaryCardFailedDocuments);
        await testSubjects.click(datasetQualityDetailsSummaryCardFailedDocuments);

        await testSubjects.existOrFail(editFailureStoreIcon);
        await testSubjects.click(editFailureStoreIcon);

        await testSubjects.existOrFail(editFailureStoreModal);

        const saveModalButton = await testSubjects.find(failureStoreModalSaveButton);
        await testSubjects.click(enableFailureStoreToggle);

        await retry.try(async () => {
          expect(await saveModalButton.isEnabled()).to.be(true);
        });

        await testSubjects.click(failureStoreModalSaveButton);

        await testSubjects.missingOrFail(editFailureStoreModal);
        await testSubjects.existOrFail(datasetQualityDetailsSummaryCardNoFailureStore);
        const failedDocsCard = await testSubjects.getVisibleText(
          datasetQualityDetailsSummaryCardNoFailureStore
        );
        expect(failedDocsCard).to.contain('No failure store');
      });
    });
  });
}
