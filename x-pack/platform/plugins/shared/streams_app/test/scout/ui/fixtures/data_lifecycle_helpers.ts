/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type Locator, type ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

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

  // Failure store: edit failed lifecycle flyout
  failureStoreEnableButton: 'streamsAppFailureStoreEnableButton',
  failureStoreEditButton: 'failureStoreSummaryEditFailedLifecycle',
  failureStoreAddDeletePhaseButton: 'failureStoreSummaryAddDeletePhase',
  failedLifecycleFlyout: 'streamsEditFailedDataLifecycleFlyout',
  failedInheritCheckbox: 'dataLifecycleInheritCheckbox',
  enableFailureStoreCheckbox: 'editFailedDataLifecycle-enableFailureStoreCheckbox',
  failedFlyoutApplyButton: 'dataLifecycleFlyoutApplyButton',
  failedFlyoutCancelButton: 'dataLifecycleFlyoutCancelButton',

  // Failure store: delete phase flyout (custom failed retention)
  failedDeletePhaseFlyout: 'streamsEditFailedDeletePhaseFlyout',
  failedDeletePhaseValue: 'streamsEditFailedDeletePhaseFlyoutDeleteAfterValue',
  failedDeletePhaseUnit: 'streamsEditFailedDeletePhaseFlyoutDeleteAfterUnit',
  failedDeletePhaseApplyButton: 'streamsEditFailedDeletePhaseFlyoutApplyButton',
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
 * Best-effort close of any currently visible toasts.
 */
export async function closeToastsIfPresent(page: ScoutPage): Promise<void> {
  const toastCloseButtons = page.getByTestId('toastCloseButton');
  for (const button of await toastCloseButtons.all()) {
    await button.click({ timeout: 1000 }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Failure store helpers
// ---------------------------------------------------------------------------

/**
 * Opens the "edit failed data lifecycle" flyout from the enabled summary (the
 * controls/edit action). Pin the failure store as enabled via the API before
 * calling so this entry point is deterministic.
 */
export async function openFailureStoreFlyout(page: ScoutPage): Promise<Locator> {
  await page.getByTestId(RETENTION_TEST_IDS.failureStoreEditButton).click();
  const flyout = page.getByTestId(RETENTION_TEST_IDS.failedLifecycleFlyout);
  await expect(flyout).toBeVisible();
  return flyout;
}

/**
 * Opens the "edit failed data lifecycle" flyout from the disabled panel (the
 * "Enable failure store" action). Pin the failure store as disabled via the API
 * before calling so this entry point is deterministic.
 */
export async function openDisabledFailureStoreFlyout(page: ScoutPage): Promise<Locator> {
  await page.getByTestId(RETENTION_TEST_IDS.failureStoreEnableButton).click();
  const flyout = page.getByTestId(RETENTION_TEST_IDS.failedLifecycleFlyout);
  await expect(flyout).toBeVisible();
  return flyout;
}

/**
 * Saves failure store changes in the shared failure store modal
 * (`@kbn/failure-store-modal`, used from the data quality page).
 */
export async function saveFailureStoreChanges(page: ScoutPage): Promise<void> {
  const saveButton = page.getByTestId('failureStoreModalSaveButton');
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
}

/**
 * Saves the streams "edit failed data lifecycle" flyout (Apply) and waits for it to close.
 */
export async function applyFailedLifecycleFlyout(
  page: ScoutPage,
  { expectOverrideConfirmation = false }: { expectOverrideConfirmation?: boolean } = {}
): Promise<void> {
  const saveButton = page.getByTestId(RETENTION_TEST_IDS.failedFlyoutApplyButton);
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  if (expectOverrideConfirmation) {
    await confirmOverride(page);
  }
  await expect(page.getByTestId(RETENTION_TEST_IDS.failedLifecycleFlyout)).toBeHidden();
}

/**
 * Sets the failure store enabled/disabled state through the edit failed
 * lifecycle flyout. The starting state must be pinned via
 * `pinFailureStore` in setup so the entry point is
 * deterministic: enabling starts from the disabled panel ("Enable failure
 * store"), disabling starts from the edit button on the enabled panel.
 */
export async function setFailureStoreEnabled(
  page: ScoutPage,
  enabled: boolean,
  { expectOverrideConfirmation = false }: { expectOverrideConfirmation?: boolean } = {}
): Promise<void> {
  if (enabled) {
    await openDisabledFailureStoreFlyout(page);
  } else {
    await openFailureStoreFlyout(page);
  }

  const checkbox = page.getByTestId(RETENTION_TEST_IDS.enableFailureStoreCheckbox);
  await checkbox.waitFor({ state: 'visible' });
  if (enabled) {
    await checkbox.check();
  } else {
    await checkbox.uncheck();
  }

  await applyFailedLifecycleFlyout(page, { expectOverrideConfirmation });
}

/**
 * Sets a custom failure store retention by opening the failed delete-phase flyout
 * via the "Add delete phase" action. Requires the failure store to be enabled
 * with no delete phase yet (pin this via `pinFailureStore`).
 */
export async function setFailureStoreRetention(
  page: ScoutPage,
  value: string,
  unit: 'd' | 'h' | 'm' | 's' = 'd',
  {
    existingDeletePhase = false,
    expectOverrideConfirmation = false,
  }: { existingDeletePhase?: boolean; expectOverrideConfirmation?: boolean } = {}
): Promise<void> {
  const flyout = page.getByTestId(RETENTION_TEST_IDS.failedDeletePhaseFlyout);

  const addDeletePhaseButton = page.getByTestId(
    RETENTION_TEST_IDS.failureStoreAddDeletePhaseButton
  );

  if (existingDeletePhase) {
    await page.getByTestId('failureStore-lifecyclePhase-delete-button').click();
    await page.getByTestId('lifecyclePhase-delete-editButton').click();
  } else {
    await expect(addDeletePhaseButton).toBeEnabled();
    await addDeletePhaseButton.click();
  }
  await expect(flyout).toBeVisible();

  const field = flyout.getByTestId(RETENTION_TEST_IDS.failedDeletePhaseValue);
  await field.fill('');
  await field.fill(value);
  await flyout.getByTestId(RETENTION_TEST_IDS.failedDeletePhaseUnit).selectOption(unit);
  await flyout.getByTestId(RETENTION_TEST_IDS.failedDeletePhaseUnit).click();

  await page.getByTestId(RETENTION_TEST_IDS.failedDeletePhaseApplyButton).click();
  if (expectOverrideConfirmation) {
    await confirmOverride(page);
  }
  await expect(flyout).toBeHidden();
}

/**
 * Removes the failure store delete phase (sets retention to indefinite / disables lifecycle)
 * via the phase popover remove action. Requires the failure store to be enabled with a delete phase.
 */
export async function removeFailureStoreDeletePhase(
  page: ScoutPage,
  { expectOverrideConfirmation = false }: { expectOverrideConfirmation?: boolean } = {}
): Promise<void> {
  await page.getByTestId('failureStore-lifecyclePhase-delete-button').click();
  await page.getByTestId('lifecyclePhase-delete-removeButton').click();
  if (expectOverrideConfirmation) {
    await confirmOverride(page);
  }
}
