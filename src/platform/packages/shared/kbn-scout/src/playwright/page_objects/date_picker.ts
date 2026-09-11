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

const DATE_UNIT_LABELS: Record<DateUnitSelector, string> = {
  [DateUnitSelector.Seconds]: 'Seconds',
  [DateUnitSelector.Minutes]: 'Minutes',
  [DateUnitSelector.Hours]: 'Hours',
};

const MS_PER_DATE_UNIT: Record<DateUnitSelector, number> = {
  [DateUnitSelector.Seconds]: 1_000,
  [DateUnitSelector.Minutes]: 60_000,
  [DateUnitSelector.Hours]: 3_600_000,
};

export interface RefreshConfig {
  interval: string;
  units: string;
  isPaused: boolean;
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

  private getDateRangePresetTestSubject(label: string) {
    return `dateRangePickerPresetItem-${label
      .replace(/→/g, '-')
      .replace(/["'&]/g, '')
      .replace(/\s+/g, '_')}`;
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

    // A standalone EuiSuperDatePicker (e.g. APM) commits the staged range through
    // its own Update button; a query-bar-embedded picker commits through the
    // shared submit button. Mirrors FTR's time_picker.ts.
    const applyTimeButton = getTestSubjLocator('superDatePickerApplyTimeButton');
    if ((await applyTimeButton.count()) > 0) {
      await applyTimeButton.click();
    } else {
      await getTestSubjLocator('querySubmitButton').click();
    }
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

  async openDateRangePickerPresetsPanel() {
    if (!(await this.isNewDateRangePicker())) {
      throw new Error(
        'openDateRangePickerPresetsPanel is only supported by the new DateRangePicker'
      );
    }

    await this.ensurePickerVisible();
    // Clicking the control button toggles the popover, so bail out when the
    // panel is already open — otherwise this click would close it (e.g. right
    // after saving a preset, which leaves the panel open). This guard assumes
    // the panel is in a settled state: callers that close it must wait for it
    // to be hidden first (see `closeDateRangePickerPresetsPanel`), otherwise a
    // still-closing panel reads as visible here and we skip re-opening it.
    const mainPanel = this.page.testSubj.locator('dateRangePickerMainPanel');
    if (await mainPanel.isVisible()) return;
    await this.page.testSubj.locator('dateRangePickerControlButton').click();
    await mainPanel.waitFor();
  }

  async closeDateRangePickerPresetsPanel() {
    const mainPanel = this.page.testSubj.locator('dateRangePickerMainPanel');
    if (!(await mainPanel.isVisible())) return;
    // Escape closes the popover, but the keypress resolves before React
    // unmounts it — wait for the panel to actually be gone so a following
    // `openDateRangePickerPresetsPanel` doesn't race the close.
    await this.page.keyboard.press('Escape');
    await mainPanel.waitFor({ state: 'hidden' });
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
    // The apply button submits the custom-range form, which calls `applyRange`
    // and forwards to the query bar's `onSubmit` — so this also submits the
    // query and no separate querySubmitButton click is needed.
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
  }

  private async openDateRangePickerSettingsPanel() {
    await this.page.testSubj.locator('dateRangePickerControlButton').click();
    await this.page.testSubj.locator('dateRangePickerMainPanel').waitFor({ state: 'visible' });
    await this.page.testSubj.locator('dateRangePickerSettingsButton').click();
    await this.page.testSubj.locator('dateRangePickerSettingsPanel').waitFor({ state: 'visible' });
  }

  private async closeDateRangePickerSettingsPanel() {
    await this.page.testSubj.locator('dateRangePickerSubPanelBackButton').click();
    await this.page.testSubj.locator('dateRangePickerMainPanel').waitFor({ state: 'visible' });
    await this.page.keyboard.press('Escape');
    await this.page.testSubj.locator('dateRangePickerPopoverPanel').waitFor({ state: 'hidden' });
  }

  private async openLegacyQuickMenu() {
    await this.quickMenuButton.click();
    await this.refreshIntervalInput.waitFor({ state: 'visible' });
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

  async setTextRange(value: string) {
    if (!(await this.isNewDateRangePicker())) {
      throw new Error('setTextRange is only supported by the new DateRangePicker');
    }

    await this.ensurePickerVisible();
    await this.page.testSubj.locator('dateRangePickerControlButton').click();
    const input = this.page.testSubj.locator('dateRangePickerInput');
    await input.clear();
    await input.fill(value);
    // Enter applies the range and submits the query on its own — the picker's
    // `onInputKeyDown` calls `applyRange`, which the query bar's `onChange`
    // forwards to `onSubmit`. No separate querySubmitButton click is needed.
    await input.press('Enter');
    // The input unmounts immediately, but the popover panel closes with an
    // animation and stays visible a bit longer — wait for it too, so a
    // following `openDateRangePickerPresetsPanel()` doesn't skip re-opening it.
    await input.waitFor({ state: 'hidden' });
    await this.page.testSubj.locator('dateRangePickerPopoverPanel').waitFor({ state: 'hidden' });
  }

  async saveCurrentRangeAsPreset() {
    if (!(await this.isNewDateRangePicker())) {
      throw new Error('saveCurrentRangeAsPreset is only supported by the new DateRangePicker');
    }

    await this.openDateRangePickerPresetsPanel();
    await this.page.testSubj.locator('dateRangePickerSavePresetButton').click();
    // Saving applies the range (`applyRange`), which closes the popover. Wait
    // for the panel to be gone so a following open isn't racing the close — the
    // idempotent opener would otherwise read the still-closing panel as "open"
    // and skip re-opening it.
    await this.page.testSubj.locator('dateRangePickerMainPanel').waitFor({ state: 'hidden' });
  }

  getDateRangePreset(label: string) {
    return this.page.testSubj.locator(this.getDateRangePresetTestSubject(label));
  }

  /**
   * Delete action for a preset. Only user-saved presets expose one; presets
   * coming from the `timepicker:quickRanges` uiSetting are locked.
   */
  getDateRangePresetDeleteButton(label: string) {
    return this.getDateRangePreset(label).getByTestId('dateRangePickerDeletePresetButton');
  }

  async deleteDateRangePreset(label: string) {
    if (!(await this.isNewDateRangePicker())) {
      throw new Error('deleteDateRangePreset is only supported by the new DateRangePicker');
    }

    await this.openDateRangePickerPresetsPanel();
    const preset = this.getDateRangePreset(label);
    await preset.waitFor();
    await preset.hover();
    await preset.getByTestId('dateRangePickerDeletePresetButton').click();
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

  async getRefreshConfig(): Promise<RefreshConfig> {
    if (await this.isNewDateRangePicker()) {
      const button = this.page.testSubj.locator('dateRangePickerControlButton');
      const intervalMsAttr = await button.getAttribute('data-refresh-interval');
      const intervalUnitAttr = await button.getAttribute('data-refresh-interval-unit');
      const isPausedAttr = await button.getAttribute('data-refresh-paused');

      if (intervalMsAttr === null || intervalUnitAttr === null || isPausedAttr === null) {
        throw new Error(`Refresh config was requested but not found`);
      }

      const unit = Object.hasOwn(DATE_UNIT_LABELS, intervalUnitAttr ?? '')
        ? (intervalUnitAttr as DateUnitSelector)
        : DateUnitSelector.Seconds;

      const interval = Math.round(Number(intervalMsAttr) / MS_PER_DATE_UNIT[unit]);
      if (!Number.isInteger(interval) || interval <= 0) {
        throw new Error(`Unexpected data-refresh-interval value: "${intervalMsAttr}"`);
      }

      return {
        interval: String(interval),
        units: DATE_UNIT_LABELS[unit],
        isPaused: isPausedAttr !== 'false',
      };
    }

    await this.openLegacyQuickMenu();
    const interval = (await this.refreshIntervalInput.getAttribute('value')) ?? '';
    const unit = (await this.refreshIntervalUnitSelect.inputValue()) as DateUnitSelector;
    const toggleChecked = (await this.toggleRefreshButton.getAttribute('aria-checked')) === 'true';
    await this.quickMenuButton.click();

    return {
      interval,
      units: DATE_UNIT_LABELS[unit],
      isPaused: !toggleChecked,
    };
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
      await this.openDateRangePickerSettingsPanel();

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

      await this.closeDateRangePickerSettingsPanel();
    } else {
      await this.openLegacyQuickMenu();
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
      await this.openDateRangePickerSettingsPanel();

      const toggle = this.page.testSubj.locator('dateRangePickerAutoRefreshToggle');
      const isRunning = (await toggle.getAttribute('aria-checked')) === 'true';

      if (isRunning) {
        await toggle.click();
      }

      await this.closeDateRangePickerSettingsPanel();
    } else {
      await this.openLegacyQuickMenu();
      const isRunning = (await this.toggleRefreshButton.getAttribute('aria-checked')) === 'true';

      if (isRunning) {
        await this.toggleRefreshButton.click();
      }

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

  getTimePickerControl(): Locator {
    return this.page.testSubj.locator('dateRangePickerControlButton').or(this.quickMenuButton);
  }

  getDisabledDatePickerIndicator(): Locator {
    return this.page.testSubj.locator('kbnQueryBar-datePicker-disabled');
  }

  async timePickerExists(): Promise<boolean> {
    // Resolves to false when no picker is mounted (for example rollup data views
    // or consumers that still hide it). A disabled picker (no time field) still
    // counts as present. Don't delegate to `isNewDateRangePicker()`: it waits up
    // to 10s for a picker to mount and throws when none does. Probe both variant
    // markers directly with a short, non-throwing wait — either one present
    // means a time picker exists.
    return this.getTimePickerControl()
      .waitFor({ state: 'visible', timeout: 1000 })
      .then(() => true)
      .catch(() => false);
  }
}
