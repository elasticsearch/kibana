/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type Locator, type ScoutPage } from '@kbn/scout';

export const RETENTION_TEST_IDS = {
  // Entry points (lifecycle summary header actions)
  editLifecycleMethodButton: 'dataLifecycleSummaryEditLifecycleMethod',
  addDeletePhaseButton: 'dataLifecycleSummaryAddDeletePhase',

  // Successful data: edit lifecycle method flyout
  successfulLifecycleFlyout: 'streamsEditSuccessfulDataLifecycleFlyout',
  successfulInheritCheckbox: 'dataLifecycleInheritCheckbox',
  successfulFlyoutApplyButton: 'dataLifecycleFlyoutApplyButton',
  successfulFlyoutCancelButton: 'dataLifecycleFlyoutCancelButton',

  // Successful data: delete phase flyout (custom DSL retention)
  successfulDeletePhaseFlyout: 'streamsEditSuccessfulDeletePhaseFlyout',
  successfulDeletePhaseValue: 'streamsEditSuccessfulDeletePhaseFlyoutDeleteAfterValue',
  successfulDeletePhaseUnit: 'streamsEditSuccessfulDeletePhaseFlyoutDeleteAfterUnit',
  successfulDeletePhaseApplyButton: 'streamsEditSuccessfulDeletePhaseFlyoutApplyButton',
  successfulDeletePhaseCancelButton: 'streamsEditSuccessfulDeletePhaseFlyoutCancelButton',
  successfulDeletePhaseRemoveButton:
    'streamsEditSuccessfulDeletePhaseFlyoutRemoveDeletePhaseButton',

  // Lifecycle method cards (DLM / ILM)
  methodCardDlm: 'editDataLifecycle-methodCard-dlm',
  methodCardIlm: 'editDataLifecycle-methodCard-ilm',

  // ILM policy selector (inside the lifecycle method flyout when ILM is selected)
  ilmSearchInput: 'retentionSelectorSearchInput',
  ilmPolicyRow: (policyName: string) =>
    `retentionSelectableRow-${policyName.replace(/[^a-zA-Z0-9]+/g, '_')}`,

  // Display elements
  retentionMetric: 'retention-metric',
  retentionColumn: (streamName: string) => `retentionColumn-${streamName}`,
  failureStoreRetentionMetric: 'failureStoreRetention-metric',
  failureStoreRetentionMetricSubtitle: 'failureStoreRetention-metric-subtitle',
} as const;

/**
 * Confirms the "This will override index template settings" modal.
 */
async function confirmOverride(page: ScoutPage): Promise<void> {
  const overrideButton = page.getByTestId('overrideSettingsModal-overrideButton');
  await overrideButton.click();
  await overrideButton.waitFor({ state: 'hidden' });
}

/**
 * Opens the "edit lifecycle method" flyout (inherit + DLM/ILM) for successful data.
 */
export async function openLifecycleMethodFlyout(page: ScoutPage): Promise<Locator> {
  await page.getByTestId(RETENTION_TEST_IDS.editLifecycleMethodButton).click();
  const flyout = page.getByTestId(RETENTION_TEST_IDS.successfulLifecycleFlyout);
  await flyout.waitFor({ state: 'visible' });
  return flyout;
}

/**
 * Saves the lifecycle method flyout changes (Apply) and waits for it to close.
 */
export async function saveRetentionChanges(
  page: ScoutPage,
  { expectOverrideConfirmation = false }: { expectOverrideConfirmation?: boolean } = {}
): Promise<void> {
  await page.getByTestId(RETENTION_TEST_IDS.successfulFlyoutApplyButton).click();
  if (expectOverrideConfirmation) {
    await confirmOverride(page);
  }
  await page.getByTestId(RETENTION_TEST_IDS.successfulLifecycleFlyout).waitFor({ state: 'hidden' });
}

/**
 * Cancels the lifecycle method flyout and waits for it to close.
 */
export async function cancelRetentionChanges(page: ScoutPage): Promise<void> {
  await page.getByTestId(RETENTION_TEST_IDS.successfulFlyoutCancelButton).click();
  await page.getByTestId(RETENTION_TEST_IDS.successfulLifecycleFlyout).waitFor({ state: 'hidden' });
}

/**
 * Toggles the "inherit lifecycle" checkbox inside the lifecycle method flyout.
 *
 * No assertion on the resulting state is made here (assertions belong in specs);
 * the caller's next interaction relies on the toggled state and will fail if it
 * did not flip.
 */
export async function toggleInheritSwitch(page: ScoutPage, enabled: boolean): Promise<void> {
  const inheritCheckbox = page.getByTestId(RETENTION_TEST_IDS.successfulInheritCheckbox);
  await inheritCheckbox.waitFor({ state: 'visible' });
  const isChecked = await inheritCheckbox.isChecked();

  if (isChecked !== enabled) {
    await inheritCheckbox.click();
  }
}

/**
 * Selects the ILM lifecycle method inside the lifecycle method flyout.
 */
export async function selectIlmMethod(page: ScoutPage): Promise<void> {
  const card = page.getByTestId(RETENTION_TEST_IDS.methodCardIlm);
  await card.waitFor({ state: 'visible' });
  await card.getByRole('radio').click();
}

/**
 * Selects the DLM (data stream lifecycle) method inside the lifecycle method flyout.
 */
export async function selectDlmMethod(page: ScoutPage): Promise<void> {
  const card = page.getByTestId(RETENTION_TEST_IDS.methodCardDlm);
  await card.waitFor({ state: 'visible' });
  await card.getByRole('radio').click();
}

/**
 * Ensures the successful data lifecycle uses DSL (DLM) so a custom DSL delete
 * phase can be configured afterwards, switching from an inherited/ILM lifecycle
 * when needed.
 */
export async function ensureDslLifecycle(page: ScoutPage): Promise<void> {
  const addDeletePhaseButton = page.getByTestId(RETENTION_TEST_IDS.addDeletePhaseButton);
  const existingDeletePhase = page.getByTestId('lifecyclePhase-delete-button');

  // Wait deterministically for the lifecycle summary to render before reading
  // the effective lifecycle state. The retention metric is always present in the
  // summary regardless of the current lifecycle, so it is a stable anchor (this
  // replaces the previous fixed-timeout race).
  await page.getByTestId(RETENTION_TEST_IDS.retentionMetric).waitFor({ state: 'visible' });

  const dslAlreadyEffective =
    (await addDeletePhaseButton.isVisible()) || (await existingDeletePhase.isVisible());
  if (dslAlreadyEffective) {
    return;
  }

  await openLifecycleMethodFlyout(page);
  await toggleInheritSwitch(page, false);
  await selectDlmMethod(page);
  await saveRetentionChanges(page);
}

/**
 * Selects an ILM policy by name in the ILM retention selector
 * (the lifecycle method flyout must already have ILM selected).
 */
export async function selectIlmPolicy(page: ScoutPage, policyName: string): Promise<void> {
  await selectIlmMethod(page);
  const search = page.getByTestId(RETENTION_TEST_IDS.ilmSearchInput);
  await search.waitFor({ state: 'visible' });
  await search.fill(policyName);
  await page.getByTestId(RETENTION_TEST_IDS.ilmPolicyRow(policyName)).click();
}

/**
 * Opens the delete-phase flyout for successful data so a custom DSL retention can be set.
 */
export async function openDeletePhaseFlyout(
  page: ScoutPage,
  { existing = false }: { existing?: boolean } = {}
): Promise<Locator> {
  const flyout = page.getByTestId(RETENTION_TEST_IDS.successfulDeletePhaseFlyout);

  if (existing) {
    const deletePhaseButton = page.getByTestId('lifecyclePhase-delete-button');
    await deletePhaseButton.waitFor({ state: 'visible' });
    await deletePhaseButton.click();
    await page.getByTestId('lifecyclePhase-delete-editButton').click();
  } else {
    // .click() auto-waits for the button to be visible and enabled.
    await page.getByTestId(RETENTION_TEST_IDS.addDeletePhaseButton).click();
  }

  await flyout.waitFor({ state: 'visible' });
  return flyout;
}

/**
 * Sets a custom DSL retention (delete phase) for successful data.
 * Opens the delete-phase flyout, fills the value/unit and applies.
 */
export async function setCustomRetention(
  page: ScoutPage,
  value: string,
  unit: 'd' | 'h' | 'm' | 's' = 'd',
  {
    existing = false,
    expectOverrideConfirmation = false,
  }: { existing?: boolean; expectOverrideConfirmation?: boolean } = {}
): Promise<void> {
  const flyout = await openDeletePhaseFlyout(page, { existing });

  const field = flyout.getByTestId(RETENTION_TEST_IDS.successfulDeletePhaseValue);
  await field.fill('');
  await field.fill(value);

  await flyout.getByTestId(RETENTION_TEST_IDS.successfulDeletePhaseUnit).selectOption(unit);

  // Blur so the field commits before submit.
  await flyout.getByTestId(RETENTION_TEST_IDS.successfulDeletePhaseUnit).click();

  await page.getByTestId(RETENTION_TEST_IDS.successfulDeletePhaseApplyButton).click();
  if (expectOverrideConfirmation) {
    await confirmOverride(page);
  }
  await page
    .getByTestId(RETENTION_TEST_IDS.successfulDeletePhaseFlyout)
    .waitFor({ state: 'hidden' });
}

/**
 * Removes the delete phase (resets to indefinite retention) for successful data.
 */
export async function removeDeletePhase(
  page: ScoutPage,
  { expectOverrideConfirmation = false }: { expectOverrideConfirmation?: boolean } = {}
): Promise<void> {
  await openDeletePhaseFlyout(page, { existing: true });
  await page.getByTestId(RETENTION_TEST_IDS.successfulDeletePhaseRemoveButton).click();
  if (expectOverrideConfirmation) {
    await confirmOverride(page);
  }
  await page
    .getByTestId(RETENTION_TEST_IDS.successfulDeletePhaseFlyout)
    .waitFor({ state: 'hidden' });
}

/**
 * Closes toasts if they exist (safe cleanup helper).
 */
export async function closeToastsIfPresent(page: ScoutPage): Promise<void> {
  const toasts = page.locator('.euiToast');
  if ((await toasts.count()) > 0) {
    await page
      .locator('.euiToast__closeButton')
      .click({ timeout: 1000 })
      .catch(() => {});
  }
}
