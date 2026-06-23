/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutWorkerFixtures } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { test, testData } from '../fixtures';

test.describe('Ingest pipelines Manage Processors', { tag: tags.stateful.classic }, () => {
  // Poll ES directly until neither of our GeoIP databases exists. On cloud,
  // undeletable "web" GeoLite2 databases are always present so the list never
  // reaches zero; this poll only checks for the two IDs the tests create/delete
  // (MAXMIND_DATABASE_ID / IPINFO_DATABASE_ID), not global emptiness.
  const expectDatabasesCleared = async (esClient: ScoutWorkerFixtures['esClient']) => {
    await expect
      .poll(async () => {
        try {
          const { databases } = (await esClient.ingest.getGeoipDatabase()) as {
            databases: Array<{ id: string }>;
          };
          const ids = databases.map((d) => d.id);
          return [testData.MAXMIND_DATABASE_ID, testData.IPINFO_DATABASE_ID].some((id) =>
            ids.includes(id)
          );
        } catch {
          // ES returns 404 when there are no databases
          return false;
        }
      })
      .toBe(false);
  };

  test.beforeAll(async ({ esClient, log }) => {
    for (const databaseId of [testData.MAXMIND_DATABASE_ID, testData.IPINFO_DATABASE_ID]) {
      try {
        await esClient.ingest.deleteGeoipDatabase({ id: databaseId });
      } catch (error) {
        log.debug(
          `GeoIP database pre-cleanup skipped for ${databaseId}: ${(error as Error).message}`
        );
      }
    }
    // Confirm the cluster has forgotten our IDs before the first page load.
    await expectDatabasesCleared(esClient);
  });

  test.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsManageProcessorsUser();
    await pageObjects.ingestPipelines.goto();
    await pageObjects.ingestPipelines.navigateToManageProcessorsPage();
  });

  test.afterAll(async ({ esClient, log }) => {
    for (const databaseId of [testData.MAXMIND_DATABASE_ID, testData.IPINFO_DATABASE_ID]) {
      try {
        await esClient.ingest.deleteGeoipDatabase({ id: databaseId });
      } catch (error) {
        log.debug(`GeoIP database cleanup failed for ${databaseId}: ${(error as Error).message}`);
      }
    }
  });

  test('shows the empty list prompt', async ({ pageObjects, config }) => {
    // On ECH the GeoIP downloader pre-populates read-only "web" GeoLite2 databases
    // that can't be deleted, so the list is never empty and this prompt never renders.
    // The test is skipped on cloud; it still exercises the empty-state UI locally
    // where the downloader is off.
    test.skip(
      config.isCloud === true,
      'On ECH the GeoIP downloader pre-populates read-only "web" databases, so the empty-state UI is never rendered.'
    );
    await expect(pageObjects.ingestPipelines.geoipEmptyListPrompt).toBeVisible();
  });

  test('creates MaxMind and IPinfo databases and deletes them', async ({
    pageObjects,
    esClient,
  }) => {
    await pageObjects.ingestPipelines.openCreateDatabaseModal();
    await pageObjects.ingestPipelines.fillAddDatabaseForm(
      'maxmind',
      testData.MAXMIND_DATABASE_NAME,
      '123456'
    );
    await pageObjects.ingestPipelines.clickAddDatabaseButton();

    await expect
      .poll(async () => await pageObjects.ingestPipelines.getGeoipDatabases())
      .toContainEqual(expect.stringContaining(testData.MAXMIND_DATABASE_NAME));

    await pageObjects.ingestPipelines.openCreateDatabaseModal();
    await pageObjects.ingestPipelines.fillAddDatabaseForm('ipinfo', 'asn');
    await pageObjects.ingestPipelines.clickAddDatabaseButton();

    await expect
      .poll(async () => await pageObjects.ingestPipelines.getGeoipDatabases())
      .toContainEqual(expect.stringContaining(testData.IPINFO_DATABASE_NAME));

    const databaseRows = await pageObjects.ingestPipelines.getGeoipDatabases();
    const maxMindDatabaseRow = databaseRows.find((database) =>
      database.includes(testData.MAXMIND_DATABASE_NAME)
    );
    const ipInfoDatabaseRow = databaseRows.find((database) =>
      database.includes(testData.IPINFO_DATABASE_NAME)
    );

    expect(maxMindDatabaseRow).toContain(testData.MAXMIND_DATABASE_NAME);
    expect(maxMindDatabaseRow).toContain('MaxMind');
    expect(ipInfoDatabaseRow).toContain(testData.IPINFO_DATABASE_NAME);
    expect(ipInfoDatabaseRow).toContain('IPinfo');

    await pageObjects.ingestPipelines.deleteDatabaseByName(testData.MAXMIND_DATABASE_NAME);
    await pageObjects.ingestPipelines.deleteDatabaseByName(testData.IPINFO_DATABASE_NAME);

    // Poll ES to confirm our databases are gone, then navigate fresh so the UI
    // re-fetches. We assert that our specific rows are absent rather than waiting
    // for the empty-state prompt, because on ECH the downloader pre-populates
    // undeletable "web" databases so the list is never globally empty.
    await expectDatabasesCleared(esClient);
    await pageObjects.ingestPipelines.goto();
    await pageObjects.ingestPipelines.navigateToManageProcessorsPage();
    await expect
      .poll(async () => await pageObjects.ingestPipelines.getGeoipDatabases())
      .not.toContainEqual(expect.stringContaining(testData.MAXMIND_DATABASE_NAME));
    await expect
      .poll(async () => await pageObjects.ingestPipelines.getGeoipDatabases())
      .not.toContainEqual(expect.stringContaining(testData.IPINFO_DATABASE_NAME));
  });
});
