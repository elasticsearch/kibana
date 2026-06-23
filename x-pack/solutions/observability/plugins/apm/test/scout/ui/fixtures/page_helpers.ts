/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiToastWrapper, type ScoutPage } from '@kbn/scout-oblt';
import { EXTENDED_TIMEOUT } from './constants';

/**
 * Waits for the APM settings header link to be visible.
 * This is commonly used to ensure the APM page has fully loaded.
 */
export async function waitForApmSettingsHeaderLink(page: ScoutPage): Promise<void> {
  await page
    .getByTestId('apmSettingsHeaderLink')
    .waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
}

/**
 * Waits for the APM main container to be visible.
 * This is commonly used to ensure the APM page has fully loaded.
 */
export async function waitForApmMainContainer(page: ScoutPage): Promise<void> {
  await page.testSubj.waitForSelector('apmMainContainer', { timeout: EXTENDED_TIMEOUT });
}

/**
 * Waits for the unified search bar's date picker to mount, regardless of which
 * variant (legacy EuiSuperDatePicker or new DateRangePicker) is rendered. The
 * variant depends on the `enableDateRangePicker` flag and may flip across
 * environments.
 */
export async function waitForSearchBarReady(page: ScoutPage): Promise<void> {
  await page
    .getByTestId('dateRangePickerControlButton')
    .or(page.getByTestId('superDatePickerToggleQuickMenuButton'))
    .waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
}

/**
 * Close global EUI toasts when present — they intercept pointer events and break
 * interactions (e.g. Investigate menu) while still visible (#246662 CI flakes).
 */
export async function dismissGlobalToastsIfPresent(page: ScoutPage): Promise<void> {
  const toast = new EuiToastWrapper(page, { locator: '.euiToast' });
  await toast.closeAllToasts();
}
