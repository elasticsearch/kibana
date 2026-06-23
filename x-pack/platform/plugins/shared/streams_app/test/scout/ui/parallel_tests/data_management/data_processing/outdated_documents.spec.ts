/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import moment from 'moment';
import { test } from '../../../fixtures';
import { generateLogsData } from '../../../fixtures/generators';

const INGESTION_DURATION_MINUTES = 5;
const INGESTION_RATE = 20;

const NEW_DOCUMENTS_STREAM = 'logs-new-documents';
const OLD_DOCUMENTS_STREAM = 'logs-old-documents';
const EMPTY_STREAM = 'logs.otel.empty';

test.describe(
  'Stream data processing - outdated documents',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    const newDocumentsDateRange = {
      from: '',
      to: '',
    };

    const oldDocumentsDateRange = {
      from: '',
      to: '',
    };

    test.beforeAll(async ({ apiServices, logsSynthtraceEsClient }) => {
      const newDocsTime = moment().utc().add(1, 'day').toDate().getTime();
      newDocumentsDateRange.from = moment(newDocsTime)
        .utc()
        .subtract(2, 'hours')
        .format('MMM D, YYYY @ HH:mm:ss.SSS');
      newDocumentsDateRange.to = moment(newDocsTime)
        .utc()
        .add(2, 'hours')
        .format('MMM D, YYYY @ HH:mm:ss.SSS');
      await generateLogsData(logsSynthtraceEsClient)({
        index: NEW_DOCUMENTS_STREAM,
        startTime: new Date(newDocsTime - INGESTION_DURATION_MINUTES * 60 * 1000).toISOString(),
        endTime: new Date(newDocsTime).toISOString(),
        docsPerMinute: INGESTION_RATE,
      });

      // Set up basic processing to update the stream's updated_at timestamp to current time
      await apiServices.streams.updateStreamProcessors(NEW_DOCUMENTS_STREAM, {
        steps: [
          {
            action: 'set',
            to: 'test_field',
            value: 'test_value',
          },
        ],
      });

      const oldDocsTime = moment().utc().subtract(1, 'day').toDate().getTime();
      oldDocumentsDateRange.from = moment(oldDocsTime)
        .utc()
        .subtract(2, 'hours')
        .format('MMM D, YYYY @ HH:mm:ss.SSS');
      oldDocumentsDateRange.to = moment(oldDocsTime)
        .utc()
        .add(2, 'hours')
        .format('MMM D, YYYY @ HH:mm:ss.SSS');
      await generateLogsData(logsSynthtraceEsClient)({
        index: OLD_DOCUMENTS_STREAM,
        startTime: new Date(oldDocsTime - INGESTION_DURATION_MINUTES * 60 * 1000).toISOString(),
        endTime: new Date(oldDocsTime).toISOString(),
        docsPerMinute: INGESTION_RATE,
      });

      // Set up basic processing to update the stream's updated_at timestamp to current time
      await apiServices.streams.updateStreamProcessors(OLD_DOCUMENTS_STREAM, {
        steps: [
          {
            action: 'set',
            to: 'test_field',
            value: 'test_value',
          },
        ],
      });

      await apiServices.streams.forkStream('logs.otel', EMPTY_STREAM, { always: {} });
    });

    test.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsAdmin();
    });

    test.afterAll(async ({ apiServices, logsSynthtraceEsClient }) => {
      await logsSynthtraceEsClient.clean();
      await apiServices.streams.clearStreamChildren('logs.otel');
    });

    test('with outdated documents - should display warning tip for latest samples datasource', async ({
      page,
      pageObjects,
    }) => {
      await pageObjects.streams.gotoProcessingTab(OLD_DOCUMENTS_STREAM);
      await expect(
        page.getByTestId('streamsAppProcessingOutdatedDocumentsTipAnchor')
      ).toBeVisible();
    });

    test('with outdated documents - should display warning tip for kql samples datasource', async ({
      page,
      pageObjects,
    }) => {
      await pageObjects.streams.gotoProcessingTab(OLD_DOCUMENTS_STREAM);
      await pageObjects.streams.clickManageDataSourcesButton();
      await pageObjects.streams.addDataSource('kql');
      // Scope interactions to the KQL data source card to avoid conflicts with other data sources
      const kqlDataSourceCard = page.getByTestId('streamsAppKqlSamplesDataSourceCard');
      await kqlDataSourceCard
        .getByTestId('streamsAppKqlSamplesDataSourceNameField')
        .fill('Kql Samples');
      // Set date range within the KQL data source card. The page object opens
      // the picker (legacy or new) and applies the range for both variants.
      await pageObjects.datePicker.typeAbsoluteRange({
        from: oldDocumentsDateRange.from,
        to: oldDocumentsDateRange.to,
        containerLocator: kqlDataSourceCard,
      });
      await pageObjects.datePicker.waitToBeHidden();
      await pageObjects.streams.closeFlyout();

      await expect(
        page.getByTestId('streamsAppProcessingOutdatedDocumentsTipAnchor')
      ).toBeVisible();
    });

    test('with up to date documents - should not display warning tip for latest samples datasource', async ({
      page,
      pageObjects,
    }) => {
      await pageObjects.streams.gotoProcessingTab(NEW_DOCUMENTS_STREAM);
      await expect(page.getByTestId('streamsAppProcessingOutdatedDocumentsTipAnchor')).toBeHidden();
    });

    test('with up to date documents - should not display warning tip for kql samples datasource', async ({
      page,
      pageObjects,
    }) => {
      await pageObjects.streams.gotoProcessingTab(NEW_DOCUMENTS_STREAM);
      await pageObjects.streams.clickManageDataSourcesButton();
      await pageObjects.streams.addDataSource('kql');
      // Scope interactions to the KQL data source card to avoid conflicts with other data sources
      const kqlDataSourceCard = page.getByTestId('streamsAppKqlSamplesDataSourceCard');
      await kqlDataSourceCard
        .getByTestId('streamsAppKqlSamplesDataSourceNameField')
        .fill('Kql Samples');
      // Set date range within the KQL data source card. The page object opens
      // the picker (legacy or new) and applies the range for both variants.
      await pageObjects.datePicker.typeAbsoluteRange({
        from: oldDocumentsDateRange.from,
        to: oldDocumentsDateRange.to,
        containerLocator: kqlDataSourceCard,
      });
      await pageObjects.datePicker.waitToBeHidden();
      await pageObjects.streams.closeFlyout();

      await expect(page.getByTestId('streamsAppProcessingOutdatedDocumentsTipAnchor')).toBeHidden();
    });

    test('with empty samples - should not display warning tip for latest samples datasource', async ({
      page,
      pageObjects,
    }) => {
      await pageObjects.streams.gotoProcessingTab(EMPTY_STREAM);
      await expect(page.getByTestId('streamsAppProcessingOutdatedDocumentsTipAnchor')).toBeHidden();
    });

    test('with empty samples - should not display warning tip for kql samples datasource', async ({
      page,
      pageObjects,
    }) => {
      await pageObjects.streams.gotoProcessingTab(EMPTY_STREAM);
      await pageObjects.streams.clickManageDataSourcesButton();
      await pageObjects.streams.addDataSource('kql');
      // Scope interactions to the KQL data source card to avoid conflicts with other data sources
      const kqlDataSourceCard = page.getByTestId('streamsAppKqlSamplesDataSourceCard');
      await kqlDataSourceCard
        .getByTestId('streamsAppKqlSamplesDataSourceNameField')
        .fill('Kql Samples');
      await kqlDataSourceCard.getByTestId('querySubmitButton').click();
      await pageObjects.streams.closeFlyout();

      await expect(page.getByTestId('streamsAppProcessingOutdatedDocumentsTipAnchor')).toBeHidden();
    });

    test('should never display warning tip for custom samples datasource', async ({
      page,
      pageObjects,
    }) => {
      await pageObjects.streams.gotoProcessingTab(OLD_DOCUMENTS_STREAM);
      await pageObjects.streams.clickManageDataSourcesButton();
      await pageObjects.streams.addDataSource('custom');
      await page.getByTestId('streamsAppCustomSamplesDataSourceNameField').fill('Custom Samples');
      await pageObjects.streams.fillCustomSamplesEditor(
        `[{"@timestamp": "${moment()
          .subtract(5, 'years')
          .toISOString()}", "message": "Sample log 1"}]`
      );
      await pageObjects.streams.closeFlyout();

      await expect(page.getByTestId('streamsAppProcessingOutdatedDocumentsTipAnchor')).toBeHidden();
    });
  }
);
