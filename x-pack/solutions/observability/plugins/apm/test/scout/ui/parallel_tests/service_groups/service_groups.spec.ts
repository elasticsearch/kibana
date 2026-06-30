/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test, testData } from '../../fixtures';
import { waitForApmSettingsHeaderLink } from '../../fixtures/page_helpers';
import { PRODUCTION_ENVIRONMENT } from '../../fixtures/constants';

test.describe(
  'Service Groups',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    test.beforeEach(async ({ browserAuth, pageObjects: { serviceGroupsPage } }) => {
      await browserAuth.loginAsPrivilegedUser();
      await serviceGroupsPage.gotoServiceGroupsPageWithDateSelected(
        testData.START_DATE,
        testData.END_DATE
      );
    });

    test('When navigating to service groups', async ({
      page,
      pageObjects: { serviceGroupsPage },
    }) => {
      const GO_SERVICE_GROUP_NAME = 'go services';

      await test.step('shows no service groups initially', async () => {
        // If there are no service groups, the page shows this heading
        await expect(
          page.getByRole('heading', { name: 'No service groups', level: 2 })
        ).toBeVisible();
      });

      await test.step('creates a service group', async () => {
        await serviceGroupsPage.createNewServiceGroup(GO_SERVICE_GROUP_NAME);

        // open the service picker and filter by service environment and agent name (changed to work better in MKI environment)
        await serviceGroupsPage.typeInTheSearchBar(
          `service.environment : "${PRODUCTION_ENVIRONMENT}"  and agent.name : "go"`
        );

        // verify expected synthetic services are listed and save
        await serviceGroupsPage.expectByText([
          testData.SERVICE_SYNTH_GO,
          testData.SERVICE_SYNTH_GO_2,
        ]);
        await page.getByText('Save group').click();

        // Make sure the toast is visible and contains the correct text and then close it
        await expect(page.getByTestId('euiToastHeader__title')).toBeVisible();
        await expect(
          page
            .getByTestId('euiToastHeader__title')
            .getByText(`Created "${GO_SERVICE_GROUP_NAME}" group`)
        ).toBeVisible();
        await page.getByTestId('toastCloseButton').click();

        // wait for UI to reflect the created group
        await expect(page.getByText('1 group')).toBeVisible();
      });

      await test.step('shows created group in the list', async () => {
        const card = page.getByTestId('serviceGroupCard');
        await expect(card).toContainText(GO_SERVICE_GROUP_NAME);
        await expect(card).toContainText('2 services');
      });

      await test.step('opens service list when clicking on service group card', async () => {
        await page.getByTestId('serviceGroupCard').click();
        await expect(page.getByTestId('apmEditButtonEditGroupButton')).toBeVisible();
        await serviceGroupsPage.expectByText([
          testData.SERVICE_SYNTH_GO,
          testData.SERVICE_SYNTH_GO_2,
        ]);
      });

      await test.step('deletes the service group', async () => {
        // open edit flow and delete
        await page.getByRole('button', { name: 'Edit group' }).click();
        await page.getByTestId('apmDeleteGroupButton').click();

        // after deletion there should be no service groups
        await waitForApmSettingsHeaderLink(page);
        await expect(
          page.getByRole('heading', { name: 'No service groups', level: 2 })
        ).toBeVisible();
      });
    });
  }
);
