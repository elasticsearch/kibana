/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../fixtures';

test.describe(
  'Annotations List',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    test.beforeEach(async ({ pageObjects, browserAuth }) => {
      await browserAuth.loginAsAdmin();
      await pageObjects.annotations.goto();
    });

    test('create an annotation', async ({ page, pageObjects }) => {
      await pageObjects.annotations.clickCreateAnnotation();
      await page.getByTestId('annotationTitle').fill('Test annotation');
      await page.getByTestId('annotationTitle').blur();
      await page.getByTestId('annotationMessage').fill('Test annotation description');
      await page.getByTestId('annotationMessage').blur();
      await page.getByTestId('annotationTags').click();
      await page.getByTestId('sloSelector').getByTestId('comboBoxSearchInput').click();
      await page.click('text="All SLOs"');
      await page.getByTestId('annotationSaveButton').click();
      await page.getByTestId('toastCloseButton').click();
      await expect(
        page.locator('[data-test-subj="annotation-marker-body"]:has-text("Test annotation")')
      ).toBeVisible();
      await expect(page.locator('.euiTableRow')).toHaveCount(1);
      await page.locator('.echAnnotation__marker').hover();
      await expect(
        page.locator(
          '[data-test-subj="annotation-tooltip-description"]:has-text("Test annotation description")'
        )
      ).toBeVisible();
    });

    test('Go to SLOs and check that annotation is displayed', async ({ page, pageObjects }) => {
      await pageObjects.slo.openFromSideMenu();
      await page.click('text="Test Stack SLO"');
      await page.testSubj
        .locator('sliChartPanel')
        .locator('.echChartContent')
        .scrollIntoViewIfNeeded();

      await expect(
        page.testSubj.locator('sliChartPanel').locator('[data-testid="echAnnotationMarker"]')
      ).toHaveText('Test annotation');
    });

    test('update annotation', async ({ page }) => {
      await page.getByRole('button', { name: 'Test annotation description' }).click();
      await page.getByTestId('annotationTitle').fill('Updated annotation');
      await page.getByTestId('annotationTitle').blur();
      await page.getByTestId('annotationMessage').fill('Updated annotation description');
      await page.getByTestId('annotationMessage').blur();
      await page.getByTestId('annotationSaveButton').click();
      await page.getByTestId('toastCloseButton').click();
      await expect(
        page.locator('[data-test-subj="annotation-marker-body"]:has-text("Updated annotation")')
      ).toBeVisible();
      await page.getByRole('button', { name: 'Updated annotation description' }).hover();
      await expect(
        page.locator(
          '[data-test-subj="annotation-tooltip-description"]:has-text("Updated annotation description")'
        )
      ).toBeVisible();
    });

    test('delete annotation', async ({ page }) => {
      await page.getByRole('button', { name: 'Updated annotation description' }).click();
      await page.getByTestId('annotationDeleteButton').click();
      await page.getByTestId('toastCloseButton').click();
      await expect(page.locator('.echAnnotation__marker')).toHaveCount(0);
    });
  }
);
