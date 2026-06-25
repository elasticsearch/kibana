/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '..';
import { expect } from '..';
import type { Locator } from '../../..';

export enum DateUnitSelector {
  Seconds = 's',
  Minutes = 'm',
  Hours = 'h',
}

export class DatePicker {
  private readonly quickMenuButton;
  private readonly toggleRefreshButton;
  private readonly refreshIntervalInput;
  private readonly refreshIntervalUnitSelect;

  constructor(private readonly page: ScoutPage) {
    this.quickMenuButton = this.page.testSubj.locator('superDatePickerToggleQuickMenuButton');
    this.toggleRefreshButton = this.page.testSubj.locator('superDatePickerToggleRefreshButton');
    this.refreshIntervalInput = this.page.testSubj.locator('superDatePickerRefreshIntervalInput');
    this.refreshIntervalUnitSelect = this.page.testSubj.locator(
      'superDatePickerRefreshIntervalUnitsSelect'
    );
  }

  /**
   * Detects whether the page is using the new DateRangePicker or the legacy
   * EuiSuperDatePicker. Not cached because the lazy page object proxy lacks a
   * `set` trap, so instance property writes through the proxy are lost.
   *
   * When a containerLocator is provided, the detection is scoped to that
   * container (useful when the only DateRangePicker lives inside a panel).
   */
  private async isNewDateRangePicker(containerLocator?: Locator): Promise<boolean> {
    const root = containerLocator ?? this.page;
    const newPicker = root.getByTestId('dateRangePickerControlButton');
    const legacyPicker = root.getByTestId('superDatePickerToggleQuickMenuButton');
    // Wait until either variant has mounted. `waitFor` is not a strict-mode
    // action, so it tolerates pages that render multiple pickers (e.g. several
    // data source cards in a flyout); `getAttribute` on the combined locator
    // would throw there — see the sibling note in `waitToBeHidden()`.
    await newPicker.or(legacyPicker).waitFor({ timeout: 10_000 });
    // `count()` likewise never throws on multiple matches. The variant is
    // globally flag-driven, so any `dateRangePickerControlButton` on the page
    // means the new picker is active.
    return (await newPicker.count()) > 0;
  }

  private getTestSubjLocator(selector: string, containerLocator?: Locator) {
    return containerLocator
      ? containerLocator.getByTestId(selector)
      : this.page.testSubj.locator(selector);
  }

  // ---------------------------------------------------------------------------
  // Legacy EuiSuperDatePicker helpers
  // ---------------------------------------------------------------------------

  private async showStartEndTimes(containerLocator?: Locator) {
    const getTestSubjLocator = (selector: string) =>
      this.getTestSubjLocator(selector, containerLocator);
    const getLocator = (selector: string) =>
      containerLocator ? containerLocator.locator(selector) : this.page.locator(selector);

    await getTestSubjLocator('superDatePickerToggleQuickMenuButton').waitFor();

    // Close any open suggestion lists that might block the date picker button
    const isSuggestionListVisible = await getLocator('div.kbnTypeahead').isVisible();
    if (isSuggestionListVisible) {
      await getTestSubjLocator('unifiedTabs_tabsBar').click();
      await getLocator('div.kbnTypeahead').waitFor({ state: 'hidden' });
    }

    const showBtn = getTestSubjLocator('superDatePickerShowDatesButton');

    if (await showBtn.isVisible({ timeout: 2000 })) {
      // Click to show start/end time pickers
      await showBtn.click();
      await this.page.testSubj.locator('superDatePickerAbsoluteTab').waitFor();
      await this.page.testSubj.locator('superDatePickerstartDatePopoverButton').click();
    } else {
      await getTestSubjLocator('superDatePickerstartDatePopoverButton').waitFor();
    }
  }

  private async openAbsoluteTab() {
    // Usually 2 matching elements exist: one visible in the popover and one hidden in the DOM.
    const absoluteTab = this.page.testSubj
      .locator('superDatePickerAbsoluteTab')
      .filter({ visible: true });
    await expect(absoluteTab).toHaveCount(1);
    await absoluteTab.click();
  }

  private async typeAbsoluteRangeLegacy({
    from,
    to,
    validateDates = false,
    containerLocator,
  }: {
    from: string;
    to: string;
    validateDates?: boolean;
    containerLocator?: Locator;
  }) {
    const getTestSubjLocator = (selector: string) =>
      this.getTestSubjLocator(selector, containerLocator);

    /**
     * Clears the input, types the value and submits with `Enter`.
     * Same approach as the `time_picker.ts` for FTR.
     */
    const commitTypedDate = async (value: string) => {
      const input = this.page.testSubj.locator('superDatePickerAbsoluteDateInput');
      await input.clear();
      await input.pressSequentially(value);
      await input.press('Enter');
    };

    // we start with end date
    await getTestSubjLocator('superDatePickerendDatePopoverButton').click();
    await this.openAbsoluteTab();
    await commitTypedDate(to);
    await this.page.keyboard.press('Escape');
    // and later change start date
    await getTestSubjLocator('superDatePickerstartDatePopoverButton').click();
    await this.openAbsoluteTab();
    await commitTypedDate(from);
    await this.page.keyboard.press('Escape');

    if (validateDates) {
      await expect(
        getTestSubjLocator('superDatePickerstartDatePopoverButton'),
        `Date picker 'start date' should be set correctly`
      ).toHaveText(from);
      await expect(
        getTestSubjLocator('superDatePickerendDatePopoverButton'),
        `Date picker 'end date' should be set correctly`
      ).toHaveText(to);
    }

    await getTestSubjLocator('querySubmitButton').click();
  }

  // ---------------------------------------------------------------------------
  // New DateRangePicker helpers
  // ---------------------------------------------------------------------------

  private async ensurePickerVisible(containerLocator?: Locator) {
    const controlButton = this.getTestSubjLocator('dateRangePickerControlButton', containerLocator);
    await controlButton.waitFor();

    // Close any open suggestion lists that might block the date picker button
    const getLocator = (selector: string) =>
      containerLocator ? containerLocator.locator(selector) : this.page.locator(selector);
    const isSuggestionListVisible = await getLocator('div.kbnTypeahead').isVisible();
    if (isSuggestionListVisible) {
      await this.getTestSubjLocator('unifiedTabs_tabsBar', containerLocator).click();
      await getLocator('div.kbnTypeahead').waitFor({ state: 'hidden' });
    }
  }

  private async openCustomRangePanel(containerLocator?: Locator) {
    await this.ensurePickerVisible(containerLocator);
    // Click the control button scoped to the container
    await this.getTestSubjLocator('dateRangePickerControlButton', containerLocator).click();
    // The dialog/popover renders as a portal at the page root, not inside the container,
    // so dialog elements must be found at the page level.
    await this.page.testSubj.locator('dateRangePickerCustomRangeNavItem').click();
    await this.page.testSubj.locator('dateRangePickerCustomRangePanel').waitFor();
  }

  private async setDatePart(side: 'Start' | 'End', value: string) {
    // Dialog elements render as a portal at the page root
    await this.page.testSubj.locator(`dateRangePicker${side}AbsoluteTab`).click();
    const input = this.page.testSubj.locator(`dateRangePicker${side}AbsoluteInput`);
    await input.clear();
    await input.fill(value);
  }

  private async typeAbsoluteRangeNewPicker({
    from,
    to,
    validateDates = false,
    containerLocator,
  }: {
    from: string;
    to: string;
    validateDates?: boolean;
    containerLocator?: Locator;
  }) {
    // Dialog elements render as a portal at the page root
    await this.setDatePart('Start', from);
    await this.setDatePart('End', to);
    await this.page.testSubj.locator('dateRangePickerCustomRangeApplyButton').click();

    if (validateDates) {
      const controlButton = this.getTestSubjLocator(
        'dateRangePickerControlButton',
        containerLocator
      );
      // Note: data-date-range stores ISO 8601 strings (e.g. "2025-01-01T00:00:00.000Z"),
      // not the human-readable format passed as `from`/`to`. We assert visibility only
      // to confirm the picker updated without risking a format-mismatch failure.
      await expect(
        controlButton,
        `Date picker should reflect the updated time range`
      ).toBeVisible();
    }

    await this.getTestSubjLocator('querySubmitButton', containerLocator).click();
  }

  private async openDateRangePickerSettings() {
    await this.page.testSubj.locator('dateRangePickerControlButton').click();

    const settingsPanel = this.page.testSubj.locator('dateRangePickerSettingsPanel');
    const settingsPanelOpened = await settingsPanel
      .waitFor({ timeout: 1000 })
      .then(() => true)
      .catch(() => false);

    if (!settingsPanelOpened) {
      await this.page.testSubj.locator('dateRangePickerSettingsButton').click();
      await settingsPanel.waitFor();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API (dual-path)
  // ---------------------------------------------------------------------------

  async setCommonlyUsedTime(option: string) {
    if (await this.isNewDateRangePicker()) {
      await this.page.testSubj.locator('dateRangePickerControlButton').click();
      await this.page.testSubj.locator('dateRangePickerMainPanel').waitFor();
      // The new picker's `toTestSubj` replaces every whitespace run with an
      // underscore, whereas EUI's legacy quick-menu only replaces the first
      // space. Callers pass the legacy form (e.g. "Last_15 minutes"), so
      // normalise the remaining whitespace here for the new picker.
      const presetItem = this.page.testSubj.locator(
        `dateRangePickerPresetItem-${option.replace(/\s+/g, '_')}`
      );
      await expect(presetItem).toBeVisible();
      await presetItem.click();
    } else {
      await this.quickMenuButton.click();
      const commonlyUsedOption = this.page.testSubj.locator(
        `superDatePickerCommonlyUsed_${option}`
      );
      await expect(commonlyUsedOption).toBeVisible();
      await commonlyUsedOption.click();
    }
  }

  async setAbsoluteRange({ from, to }: { from: string; to: string }) {
    if (await this.isNewDateRangePicker()) {
      await this.openCustomRangePanel();
      await this.typeAbsoluteRangeNewPicker({ from, to, validateDates: true });
    } else {
      await this.showStartEndTimes();
      await this.typeAbsoluteRangeLegacy({ from, to, validateDates: true });
    }
  }

  async setAbsoluteRangeInRootContainer({
    from,
    to,
    containerLocator,
  }: {
    from: string;
    to: string;
    containerLocator: Locator;
  }) {
    if (await this.isNewDateRangePicker(containerLocator)) {
      await this.openCustomRangePanel(containerLocator);
      await this.typeAbsoluteRangeNewPicker({
        from,
        to,
        validateDates: true,
        containerLocator,
      });
    } else {
      await this.showStartEndTimes(containerLocator);
      await this.typeAbsoluteRangeLegacy({
        from,
        to,
        validateDates: true,
        containerLocator,
      });
    }
  }

  /** @deprecated Use {@link setAbsoluteRangeInRootContainer} instead. */
  async typeAbsoluteRange({
    from,
    to,
    validateDates = false,
    containerLocator,
  }: {
    from: string;
    to: string;
    validateDates?: boolean;
    containerLocator?: Locator;
  }) {
    if (await this.isNewDateRangePicker(containerLocator)) {
      await this.openCustomRangePanel(containerLocator);
      await this.typeAbsoluteRangeNewPicker({ from, to, validateDates, containerLocator });
    } else {
      await this.showStartEndTimes(containerLocator);
      await this.typeAbsoluteRangeLegacy({ from, to, validateDates, containerLocator });
    }
  }

  async getTimeConfig(): Promise<{ start: string; end: string }> {
    if (await this.isNewDateRangePicker()) {
      const dateRange =
        (await this.page.testSubj
          .locator('dateRangePickerControlButton')
          .getAttribute('data-date-range')) ?? '';
      const [start, end] = dateRange.split(' to ');
      return { start: start?.trim() ?? '', end: end?.trim() ?? '' };
    }
    await this.showStartEndTimes();
    const start = await this.page.testSubj.innerText('superDatePickerstartDatePopoverButton');
    const end = await this.page.testSubj.innerText('superDatePickerendDatePopoverButton');
    return { start, end };
  }

  /**
   * Returns the human-readable time range label shown by whichever picker is
   * active.
   *
   * - New DateRangePicker: the value-display node renders the full label
   *   (e.g. "Last 24 hours", "30 days ago → 10 days ago").
   * - Legacy EuiSuperDatePicker: joins the start/end popover button labels when
   *   an explicit start/end range is shown, otherwise returns the quick-range
   *   "show dates" label.
   */
  async getTimeRangeText(containerLocator?: Locator): Promise<string> {
    if (await this.isNewDateRangePicker(containerLocator)) {
      const valueDisplay = this.getTestSubjLocator('dateRangePickerValueDisplay', containerLocator);
      return (await valueDisplay.innerText()).trim();
    }

    const startButton = this.getTestSubjLocator(
      'superDatePickerstartDatePopoverButton',
      containerLocator
    );
    if (await startButton.isVisible()) {
      const start = (await startButton.innerText()).trim();
      const end = (
        await this.getTestSubjLocator(
          'superDatePickerendDatePopoverButton',
          containerLocator
        ).innerText()
      ).trim();
      return `${start} - ${end}`;
    }
    return (
      await this.getTestSubjLocator('superDatePickerShowDatesButton', containerLocator).innerText()
    ).trim();
  }

  async startAutoRefresh(interval: number, dateUnit: DateUnitSelector = DateUnitSelector.Seconds) {
    if (await this.isNewDateRangePicker()) {
      await this.openDateRangePickerSettings();

      const toggle = this.page.testSubj.locator('dateRangePickerAutoRefreshToggle');
      const isPaused = (await toggle.getAttribute('aria-checked')) !== 'true';
      if (isPaused) {
        await toggle.click();
      }

      const countInput = this.page.testSubj.locator('dateRangePickerAutoRefreshIntervalCount');
      await countInput.clear();
      await countInput.fill(interval.toString());
      await this.page.testSubj
        .locator('dateRangePickerAutoRefreshIntervalUnit')
        .selectOption({ value: dateUnit });

      await this.page.keyboard.press('Escape');
    } else {
      await this.quickMenuButton.click();
      const isPaused = (await this.toggleRefreshButton.getAttribute('aria-checked')) === 'false';
      if (isPaused) {
        await this.toggleRefreshButton.click();
      }
      await this.refreshIntervalInput.clear();
      await this.refreshIntervalInput.fill(interval.toString());
      await this.refreshIntervalUnitSelect.selectOption({ value: dateUnit });
      await this.refreshIntervalInput.press('Enter');
      await this.quickMenuButton.click();
    }
  }

  async pauseAutoRefresh() {
    if (await this.isNewDateRangePicker()) {
      await this.openDateRangePickerSettings();

      const toggle = this.page.testSubj.locator('dateRangePickerAutoRefreshToggle');
      const isRunning = (await toggle.getAttribute('aria-checked')) === 'true';

      if (isRunning) await toggle.click();

      await this.page.keyboard.press('Escape');
    } else {
      await this.quickMenuButton.click();
      const isRunning = (await this.toggleRefreshButton.getAttribute('aria-checked')) === 'true';

      if (isRunning) await this.toggleRefreshButton.click();

      await this.quickMenuButton.click();
    }
  }

  async waitToBeHidden() {
    // Wait for both picker variants' popovers to be hidden. We don't call
    // `isNewDateRangePicker()` first because pages can render multiple pickers
    // (e.g. several data source cards in a flyout) which trip its strict-mode
    // check. Both popover bodies are unmounted on close, so the locators
    // resolve to zero elements and `waitFor({ state: 'hidden' })` succeeds.
    await this.page.testSubj
      .locator('dateRangePickerCustomRangePanel')
      .waitFor({ state: 'hidden' });
    await this.page.testSubj.locator('superDatePickerAbsoluteTab').waitFor({ state: 'hidden' });
  }

  async timePickerExists(): Promise<boolean> {
    // Some views have no time picker at all (e.g. a data view without a time
    // field), so this must resolve to `false` rather than throw. Don't delegate
    // to `isNewDateRangePicker()`: it waits up to 10s for a picker to mount and
    // throws when none does. Probe both variant markers directly with a short,
    // non-throwing wait — either one present means a time picker exists.
    const anyPicker = this.page.testSubj
      .locator('dateRangePickerControlButton')
      .or(this.quickMenuButton);
    return anyPicker
      .waitFor({ state: 'visible', timeout: 1000 })
      .then(() => true)
      .catch(() => false);
  }
}
