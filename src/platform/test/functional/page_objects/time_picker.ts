/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import moment from 'moment-timezone';
import type { WebElementWrapper } from '@kbn/ftr-common-functional-ui-services';
import { FtrService } from '../ftr_provider_context';

export type CommonlyUsed =
  | 'Today'
  | 'This_week'
  | 'Last_15 minutes'
  | 'Last_30 minutes'
  | 'Last_1 hour'
  | 'Last_24 hours'
  | 'Last_7 days'
  | 'Last_30 days'
  | 'Last_90 days'
  | 'Last_1 year';

export class TimePickerPageObject extends FtrService {
  private static readonly LEGACY_DATE_FORMAT = 'MMM D, YYYY @ HH:mm:ss.SSS';

  private readonly log = this.ctx.getService('log');
  private readonly find = this.ctx.getService('find');
  private readonly browser = this.ctx.getService('browser');
  private readonly retry = this.ctx.getService('retry');
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly header = this.ctx.getPageObject('header');
  private readonly common = this.ctx.getPageObject('common');
  private readonly kibanaServer = this.ctx.getService('kibanaServer');

  private readonly quickSelectTimeMenuToggle = this.ctx.getService('menuToggle').create({
    name: 'QuickSelectTime Menu',
    menuTestSubject: 'superDatePickerQuickMenu',
    toggleButtonTestSubject: 'superDatePickerToggleQuickMenuButton',
  });

  /**
   * Returns the IANA timezone from the `dateFormat:tz` UI setting, falling
   * back to UTC when the setting is `'Browser'` or absent.
   */
  private async getConfiguredTimezone(): Promise<string> {
    try {
      const tz = await this.kibanaServer.uiSettings.get('dateFormat:tz');
      if (tz === undefined || tz === 'Browser') return 'UTC';
      return tz as string;
    } catch {
      return 'UTC';
    }
  }

  /**
   * Detects whether the page is using the new DateRangePicker or the legacy
   * EuiSuperDatePicker. Not cached because different apps may use different
   * picker variants within the same test suite.
   */
  private async isNewDateRangePicker(): Promise<boolean> {
    // Wait for the page to settle before detecting, otherwise a stale picker
    // from a previous app may briefly appear during navigation.
    await this.header.awaitGlobalLoadingIndicatorHidden();
    const isNew = await this.testSubjects.exists('dateRangePickerControlButton', {
      timeout: 5000,
    });
    this.log.debug(
      `Detected date picker variant: ${isNew ? 'DateRangePicker' : 'EuiSuperDatePicker'}`
    );
    return isNew;
  }

  public readonly defaultStartTime = 'Sep 19, 2015 @ 06:31:44.000';
  public readonly defaultEndTime = 'Sep 23, 2015 @ 18:31:44.000';
  public readonly defaultStartTimeUTC = '2015-09-19T06:31:44.000Z';
  public readonly defaultEndTimeUTC = '2015-09-23T18:31:44.000Z';

  async setDefaultAbsoluteRange() {
    await this.setAbsoluteRange(this.defaultStartTime, this.defaultEndTime);
  }

  async waitForNoDataPopover() {
    await this.testSubjects.find('noDataPopoverDismissButton');
  }

  async ensureHiddenNoDataPopover() {
    const isVisible = await this.testSubjects.exists('noDataPopoverDismissButton', {
      timeout: 100,
    });
    if (isVisible) {
      await this.testSubjects.click('noDataPopoverDismissButton');
      await this.testSubjects.waitForDeleted('noDataPopoverDismissButton');
    }
  }

  /**
   * the provides a quicker way to set the timepicker to the default range, saves a few seconds
   */
  async setDefaultAbsoluteRangeViaUiSettings() {
    await this.kibanaServer.uiSettings.update({
      'timepicker:timeDefaults': `{ "from": "${this.defaultStartTimeUTC}", "to": "${this.defaultEndTimeUTC}"}`,
    });
  }

  async resetDefaultAbsoluteRangeViaUiSettings() {
    await this.kibanaServer.uiSettings.replace({});
  }

  private async getTimePickerPanel() {
    return await this.retry.try(async () => {
      return await this.find.byCssSelector('div.euiPopover__panel[data-popover-open]');
    });
  }

  private async waitPanelIsGone(panelElement: WebElementWrapper) {
    await this.find.waitForElementStale(panelElement);
  }

  public async timePickerExists() {
    if (await this.isNewDateRangePicker()) {
      return await this.testSubjects.exists('dateRangePickerControlButton');
    }
    return await this.testSubjects.exists('superDatePickerToggleQuickMenuButton');
  }

  /**
   * Sets commonly used time
   * @param option 'Today' | 'This_week' | 'Last_15 minutes' | 'Last_24 hours' ...
   */
  async setCommonlyUsedTime(option: CommonlyUsed | string) {
    if (await this.isNewDateRangePicker()) {
      await this.testSubjects.click('dateRangePickerControlButton');
      await this.testSubjects.exists('dateRangePickerMainPanel', { timeout: 5000 });
      // The component's toTestSubj replaces all whitespace with underscores
      const presetTestSubj = `dateRangePickerPresetItem-${option.replace(/\s+/g, '_')}`;
      await this.testSubjects.exists(presetTestSubj, { timeout: 5000 });
      await this.testSubjects.click(presetTestSubj);
      await this.testSubjects.missingOrFail('dateRangePickerPopoverPanel', { timeout: 5000 });
      await this.browser.pressKeys(this.browser.keys.ESCAPE);
    } else {
      await this.testSubjects.exists('superDatePickerToggleQuickMenuButton', { timeout: 5000 });
      await this.testSubjects.click('superDatePickerToggleQuickMenuButton');
      await this.testSubjects.exists(`superDatePickerCommonlyUsed_${option}`, { timeout: 5000 });
      await this.testSubjects.click(`superDatePickerCommonlyUsed_${option}`);
    }
  }

  /**
   * Sets recently used time (including custom ranges)
   * @param option a custom recently used time range (example: "Sep 20, 2015 @ 00:00:00.000 to Sep 20, 2015 @ 23:50:13.253")
   */
  async setRecentlyUsedTime(option: string) {
    if (await this.isNewDateRangePicker()) {
      // The new picker displays recent items in its own format (different delimiter and
      // date format from the legacy "MMM D, YYYY @ HH:mm:ss.SSS to …" text), so XPath
      // text matching would fail. Re-apply the range by typing it directly into the
      // input instead — the parser accepts the legacy date format.
      const parts = option.split(' to ');
      if (parts.length !== 2) {
        throw new Error(`setRecentlyUsedTime: expected "from to to" format, got: "${option}"`);
      }
      await this.setAbsoluteRangeNewPicker(parts[0].trim(), parts[1].trim());
    } else {
      await this.testSubjects.exists('superDatePickerToggleQuickMenuButton', { timeout: 5000 });
      await this.testSubjects.click('superDatePickerToggleQuickMenuButton');
      const panel = await this.testSubjects.find('superDatePickerQuickMenu');
      const buttonByOptionText = await panel.findByXpath(`.//button[text()='${option}']`);
      await buttonByOptionText?.click();
    }
  }

  public async inputValue(dataTestSubj: string, value: string) {
    if (this.browser.isFirefox) {
      const input = await this.testSubjects.find(dataTestSubj);
      await input.clearValue();
      await input.type(value);
    } else {
      await this.testSubjects.setValue(dataTestSubj, value);
    }

    await this.testSubjects.pressEnter(dataTestSubj);
  }

  private async showStartEndTimes() {
    // This first await makes sure the superDatePicker has loaded before we check for the ShowDatesButton
    await this.testSubjects.exists('superDatePickerToggleQuickMenuButton', { timeout: 20000 });
    await this.retry.tryForTime(5000, async () => {
      const isShowDatesButton = await this.testSubjects.exists('superDatePickerShowDatesButton', {
        timeout: 50,
      });
      if (isShowDatesButton) {
        await this.testSubjects.moveMouseTo('superDatePickerShowDatesButton');
        await this.testSubjects.click('superDatePickerShowDatesButton', 50);
        // Close the start date popover which opens automatically
        await this.testSubjects.existOrFail('superDatePickerstartDatePopoverButton', {
          timeout: 1000,
        });
        await this.testSubjects.click('superDatePickerstartDatePopoverButton');
      }
    });
  }

  /**
   * @param {String} fromTime MMM D, YYYY @ HH:mm:ss.SSS
   * @param {String} toTime MMM D, YYYY @ HH:mm:ss.SSS
   * @param {Boolean} force time picker force update, default is false
   */
  public async setAbsoluteRange(fromTime: string, toTime: string, force = false) {
    if (!force) {
      const currentUrl = decodeURI(await this.browser.getCurrentUrl());
      const DEFAULT_DATE_FORMAT = 'MMM D, YYYY @ HH:mm:ss.SSS';
      const startMoment = moment.utc(fromTime, DEFAULT_DATE_FORMAT).toISOString();
      const endMoment = moment.utc(toTime, DEFAULT_DATE_FORMAT).toISOString();
      if (currentUrl.includes(`time:(from:'${startMoment}',to:'${endMoment}'`)) {
        this.log.debug(
          `We already have the desired start (${fromTime}) and end (${toTime}) in the URL, returning from setAbsoluteRange`
        );
        return;
      }
    }
    this.log.debug(`Setting absolute range to ${fromTime} to ${toTime}`);

    if (await this.isNewDateRangePicker()) {
      await this.setAbsoluteRangeNewPicker(fromTime, toTime);
    } else {
      await this.setAbsoluteRangeLegacyPicker(fromTime, toTime);
    }

    await this.header.awaitGlobalLoadingIndicatorHidden();
  }

  private async setAbsoluteRangeNewPicker(fromTime: string, toTime: string) {
    const rangeText = `${fromTime} to ${toTime}`;
    // The parser normalizes absolute dates to ISO, so data-date-range will
    // contain ISO strings. Convert the expected start time to ISO for matching,
    // using the configured timezone so it matches what the picker's parser produces.
    const tz = await this.getConfiguredTimezone();
    // Try the legacy format first; fall back to moment's auto-detection
    // so callers can pass dates in any format (e.g. custom dateFormat).
    const parsed = moment.tz(fromTime, TimePickerPageObject.LEGACY_DATE_FORMAT, true, tz);
    const expectedFromISO = (parsed.isValid() ? parsed : moment.tz(fromTime, tz)).toISOString();
    await this.retry.waitFor(`date range to be set to ${rangeText}`, async () => {
      // Tooltips can sometimes hide the picker, so move mouse directly to it instead of direct click
      const picker = await this.testSubjects.find('dateRangePickerControlButton');
      await picker.moveMouseTo();
      await picker.click();
      await this.testSubjects.exists('dateRangePickerInput', { timeout: 5000 });
      await this.inputValue('dateRangePickerInput', rangeText);
      // Pressing Enter in inputValue applies the range and closes the popover.
      // Verify the button reflects the new range.
      await this.testSubjects.exists('dateRangePickerControlButton', { timeout: 5000 });
      const actualRange = await this.testSubjects.getAttribute(
        'dateRangePickerControlButton',
        'data-date-range'
      );
      this.log.debug(
        `Validating date range - expected ISO: '${expectedFromISO}', actual: '${actualRange}'`
      );
      return actualRange != null && actualRange.includes(expectedFromISO);
    });
    // Ensure the popover is fully closed before returning, so it doesn't
    // overlay other elements and intercept clicks.
    await this.testSubjects.missingOrFail('dateRangePickerPopoverPanel', { timeout: 5000 });
    // Blur the control button so its tooltip doesn't overlay elements above
    // (e.g. the top nav "Open" button in Discover).
    await this.browser.pressKeys(this.browser.keys.ESCAPE);
  }

  private async setAbsoluteRangeLegacyPicker(fromTime: string, toTime: string) {
    await this.showStartEndTimes();

    // set to time
    await this.retry.waitFor(`endDate is set to ${toTime}`, async () => {
      await this.testSubjects.click('superDatePickerendDatePopoverButton');
      await this.testSubjects.click('superDatePickerAbsoluteTab');
      await this.testSubjects.click('superDatePickerAbsoluteDateInput');
      await this.inputValue('superDatePickerAbsoluteDateInput', toTime);
      await this.testSubjects.click('superDatePickerendDatePopoverButton'); // close popover because sometimes browser can't find start input
      const actualToTime = await this.testSubjects.getVisibleText(
        'superDatePickerendDatePopoverButton'
      );
      this.log.debug(`Validating 'endDate' - expected: '${toTime}, actual: ${actualToTime}'`);
      return toTime === actualToTime;
    });

    // set from time
    await this.retry.waitFor(`startDate is set to ${fromTime}`, async () => {
      await this.testSubjects.click('superDatePickerstartDatePopoverButton');
      await this.testSubjects.click('superDatePickerAbsoluteTab');
      await this.testSubjects.click('superDatePickerAbsoluteDateInput');
      await this.inputValue('superDatePickerAbsoluteDateInput', fromTime);
      await this.browser.pressKeys(this.browser.keys.ESCAPE);
      const actualFromTime = await this.testSubjects.getVisibleText(
        'superDatePickerstartDatePopoverButton'
      );
      this.log.debug(`Validating 'startDate' - expected: '${fromTime}, actual: ${actualFromTime}'`);
      return fromTime === actualFromTime;
    });

    await this.retry.waitFor('Timepicker popover to close', async () => {
      await this.browser.pressKeys(this.browser.keys.ESCAPE);
      return !(await this.testSubjects.exists('superDatePickerAbsoluteDateInput', { timeout: 50 }));
    });

    const superDatePickerApplyButtonExists = await this.testSubjects.exists(
      'superDatePickerApplyTimeButton',
      { timeout: 100 }
    );
    if (superDatePickerApplyButtonExists) {
      // Timepicker is in top nav
      // Click super date picker apply button to apply time range
      await this.testSubjects.click('superDatePickerApplyTimeButton');
    } else {
      // Timepicker is embedded in query bar
      // click query bar submit button to apply time range
      await this.testSubjects.click('querySubmitButton');
    }
  }

  public async isOff() {
    // The new picker renders a hidden `kbnQueryBar-datePicker-disabled` span
    // whenever the time filter is off (no-time-field data view, isDisabled
    // prop, or auto-refresh-only mode); the legacy picker renders it visibly
    // inside the SuperDatePicker's isDisabled.display node.
    if (await this.testSubjects.exists('kbnQueryBar-datePicker-disabled', { allowHidden: true })) {
      return true;
    }
    // Legacy auto-refresh-only mode doesn't render the span; the
    // SuperDatePicker collapses to a readOnly EuiAutoRefresh control instead.
    return await this.find.existsByCssSelector('.euiAutoRefresh .euiFormControlLayout-readOnly');
  }

  public async getRefreshConfig(keepQuickSelectOpen = false) {
    if (await this.isNewDateRangePicker()) {
      return await this.getRefreshConfigNewPicker();
    }
    return await this.getRefreshConfigLegacy(keepQuickSelectOpen);
  }

  private async getRefreshConfigNewPicker() {
    // Open popover → navigate to Settings panel
    await this.openNewPickerSettingsPanel();

    const interval = await this.testSubjects.getAttribute(
      'dateRangePickerAutoRefreshIntervalCount',
      'value'
    );

    let selectedUnit: string | undefined;
    const select = await this.testSubjects.find('dateRangePickerAutoRefreshIntervalUnit');
    const options = await this.find.allDescendantDisplayedByCssSelector('option', select);
    await Promise.all(
      options.map(async (optionElement) => {
        const isSelected = await optionElement.isSelected();
        if (isSelected) {
          selectedUnit = await optionElement.getVisibleText();
        }
      })
    );

    const toggleChecked = await this.testSubjects.getAttribute(
      'dateRangePickerAutoRefreshToggle',
      'aria-checked'
    );

    await this.closeNewPickerSettingsPanel();

    return {
      interval,
      // Capitalize to match the legacy picker's unit strings (e.g. "Seconds", "Minutes").
      units: selectedUnit
        ? selectedUnit.charAt(0).toUpperCase() + selectedUnit.slice(1)
        : selectedUnit,
      isPaused: toggleChecked !== 'true',
    };
  }

  private async getRefreshConfigLegacy(keepQuickSelectOpen = false) {
    await this.quickSelectTimeMenuToggle.open();
    const interval = await this.testSubjects.getAttribute(
      'superDatePickerRefreshIntervalInput',
      'value'
    );

    let selectedUnit;
    const select = await this.testSubjects.find('superDatePickerRefreshIntervalUnitsSelect');
    const options = await this.find.allDescendantDisplayedByCssSelector('option', select);
    await Promise.all(
      options.map(async (optionElement) => {
        const isSelected = await optionElement.isSelected();
        if (isSelected) {
          selectedUnit = await optionElement.getVisibleText();
        }
      })
    );

    const toggleButtonChecked = await this.testSubjects.getAttribute(
      'superDatePickerToggleRefreshButton',
      'aria-checked'
    );
    if (!keepQuickSelectOpen) {
      await this.quickSelectTimeMenuToggle.close();
    }

    return {
      interval,
      units: selectedUnit,
      isPaused: toggleButtonChecked === 'true' ? false : true,
    };
  }

  /**
   * Opens the DateRangePicker settings panel by clicking the control button,
   * then navigating to the settings sub-panel.
   */
  private async openNewPickerSettingsPanel() {
    // If the settings panel is already visible, nothing to do.
    const alreadyOpen = await this.testSubjects.exists('dateRangePickerSettingsPanel', {
      timeout: 500,
    });
    if (alreadyOpen) return;

    await this.testSubjects.click('dateRangePickerControlButton');
    await this.testSubjects.exists('dateRangePickerMainPanel', { timeout: 5000 });
    await this.testSubjects.click('dateRangePickerSettingsButton');
    await this.testSubjects.exists('dateRangePickerSettingsPanel', { timeout: 5000 });
  }

  /**
   * Closes the DateRangePicker after settings-panel interactions and waits for
   * idle state (control button visible, popover gone, tooltip dismissed).
   *
   * `browser.pressKeys(ESCAPE)` sends to `document.body` after focus drifts
   * away from panel elements (WebDriver behaviour), so it never reaches
   * `onPanelKeyDown` and the popover stays open. Fix: navigate back to the main
   * panel via the back button, focus the text input (which is in the control,
   * not the popover), then press Escape so `onInputKeyDown` fires and calls
   * `setIsEditing(false)`.
   */
  private async closeNewPickerSettingsPanel() {
    // Navigate back from settings sub-panel to main panel if still there.
    if (await this.testSubjects.exists('dateRangePickerSubPanelBackButton', { timeout: 500 })) {
      await this.testSubjects.click('dateRangePickerSubPanelBackButton');
      await this.testSubjects.exists('dateRangePickerMainPanel', { timeout: 3000 });
    }
    // Focus the text input (always visible in editing mode) and press Escape.
    // onInputKeyDown handles Escape → setIsEditing(false) → popover closes.
    await this.testSubjects.click('dateRangePickerInput');
    await this.browser.pressKeys(this.browser.keys.ESCAPE);
    // Wait for popover to close and button to reappear.
    await this.testSubjects.missingOrFail('dateRangePickerPopoverPanel', { timeout: 5000 });
    // Blur the control button to dismiss the EuiToolTip that appears when it regains focus.
    await this.browser.pressKeys(this.browser.keys.ESCAPE);
  }

  /**
   * Formats a raw date string from data-date-range into the legacy display
   * format so existing test assertions stay stable. Relative dateMath values
   * (e.g. `now-15m`) are returned as-is. Uses the configured `dateFormat:tz`
   * so that the result matches what the legacy picker would have displayed.
   */
  private formatDateForLegacy(raw: string, tz: string): string {
    const parsed = moment.utc(raw);
    return parsed.isValid() ? parsed.tz(tz).format(TimePickerPageObject.LEGACY_DATE_FORMAT) : raw;
  }

  /**
   * Reads data-date-range from the DateRangePicker control button, retrying
   * until the value stabilises (two consecutive reads match). This gives React
   * time to flush state updates after external prop changes.
   */
  private async getStableDateRange(): Promise<string> {
    // Use undefined as the sentinel so that the very first read always triggers a
    // retry (guards against the attribute being empty on first paint) and empty
    // strings are also retried (component not yet rendered with a valid range).
    let previous: string | undefined;
    return await this.retry.try(async () => {
      const current =
        (await this.testSubjects.getAttribute('dateRangePickerControlButton', 'data-date-range')) ??
        '';
      if (!current || current !== previous) {
        previous = current;
        throw new Error('data-date-range still updating');
      }
      return current;
    });
  }

  /**
   * Reads the current date range from the new DateRangePicker via data-date-range,
   * which contains ISO strings for absolute dates and dateMath for relative dates.
   * ISO dates are formatted with the legacy display format for test compatibility.
   */
  private async getNewPickerTimeConfig(): Promise<{ start: string; end: string }> {
    const dateRange = await this.getStableDateRange();
    const tz = await this.getConfiguredTimezone();
    const [rawStart, rawEnd] = dateRange.split(' to ');
    return {
      start: this.formatDateForLegacy(rawStart, tz),
      end: this.formatDateForLegacy(rawEnd, tz),
    };
  }

  public async getTimeConfig() {
    if (await this.isNewDateRangePicker()) {
      return await this.getNewPickerTimeConfig();
    }
    await this.showStartEndTimes();
    const start = await this.testSubjects.getVisibleText('superDatePickerstartDatePopoverButton');
    const end = await this.testSubjects.getVisibleText('superDatePickerendDatePopoverButton');
    return { start, end };
  }

  /**
   * Waits until the time range displayed by the picker changes from the
   * supplied `previous` config. Useful after actions that update the time range
   * externally (e.g. clicking a histogram bar) where the picker needs a
   * moment to re-render with the new props.
   */
  public async waitForTimeConfigChange(previous: { start: string; end: string }) {
    await this.retry.waitFor('time config to change', async () => {
      const current = await this.getTimeConfig();
      return current.start !== previous.start || current.end !== previous.end;
    });
  }

  public async getShowDatesButtonText() {
    if (await this.isNewDateRangePicker()) {
      const valueDisplay = await this.testSubjects.find('dateRangePickerValueDisplay');
      return await valueDisplay.getVisibleText();
    }
    const button = await this.testSubjects.find('superDatePickerShowDatesButton');
    const text = await button.getVisibleText();
    return text;
  }

  public async getTimeDurationForSharing() {
    return await this.testSubjects.getAttribute(
      'dataSharedTimefilterDuration',
      'data-shared-timefilter-duration'
    );
  }

  public async getTimeConfigAsAbsoluteTimes() {
    if (await this.isNewDateRangePicker()) {
      // Reuse getTimeConfig — it already reads data-date-range and formats
      // absolute dates with the legacy format.
      return await this.getTimeConfig();
    }

    await this.showStartEndTimes();

    // get to time
    await this.testSubjects.click('superDatePickerendDatePopoverButton');
    const panel = await this.getTimePickerPanel();
    await this.testSubjects.click('superDatePickerAbsoluteTab');
    const end = await this.testSubjects.getAttribute('superDatePickerAbsoluteDateInput', 'value');

    // Wait until closing popover again to avoid https://github.com/elastic/eui/issues/5619
    await this.common.sleep(2000);

    // get from time
    await this.testSubjects.click('superDatePickerstartDatePopoverButton');
    await this.waitPanelIsGone(panel);
    await this.testSubjects.click('superDatePickerAbsoluteTab');
    const start = await this.testSubjects.getAttribute('superDatePickerAbsoluteDateInput', 'value');

    return {
      start,
      end,
    };
  }

  public async getTimeDurationInHours() {
    const DEFAULT_DATE_FORMAT = 'MMM D, YYYY @ HH:mm:ss.SSS';
    const { start, end } = await this.getTimeConfigAsAbsoluteTimes();
    const startMoment = moment(start, DEFAULT_DATE_FORMAT);
    const endMoment = moment(end, DEFAULT_DATE_FORMAT);
    return moment.duration(endMoment.diff(startMoment)).asHours();
  }

  public async startAutoRefresh(intervalS = 3) {
    if (await this.isNewDateRangePicker()) {
      await this.startAutoRefreshNewPicker(intervalS);
    } else {
      await this.startAutoRefreshLegacy(intervalS);
    }
  }

  private async startAutoRefreshNewPicker(intervalS = 3) {
    await this.openNewPickerSettingsPanel();

    // Enable auto-refresh if not already enabled
    const toggleChecked = await this.testSubjects.getAttribute(
      'dateRangePickerAutoRefreshToggle',
      'aria-checked'
    );
    if (toggleChecked !== 'true') {
      this.log.debug('enable auto refresh');
      await this.testSubjects.click('dateRangePickerAutoRefreshToggle');
    }

    // Set interval
    await this.retry.waitFor('auto refresh interval to be set correctly', async () => {
      await this.inputValue('dateRangePickerAutoRefreshIntervalCount', intervalS.toString());
      return (
        (await this.testSubjects.getAttribute(
          'dateRangePickerAutoRefreshIntervalCount',
          'value'
        )) === intervalS.toString()
      );
    });

    await this.closeNewPickerSettingsPanel();
  }

  private async startAutoRefreshLegacy(intervalS = 3) {
    await this.quickSelectTimeMenuToggle.open();
    const refreshConfig = await this.getRefreshConfig(true);

    if (refreshConfig.isPaused) {
      this.log.debug('start auto refresh');
      await this.testSubjects.click('superDatePickerToggleRefreshButton');
    }

    await this.retry.waitFor('auto refresh to be set correctly', async () => {
      await this.inputValue('superDatePickerRefreshIntervalInput', intervalS.toString());
      return (
        (await this.testSubjects.getAttribute('superDatePickerRefreshIntervalInput', 'value')) ===
        intervalS.toString()
      );
    });

    await this.quickSelectTimeMenuToggle.close();
  }

  public async pauseAutoRefresh() {
    this.log.debug('pauseAutoRefresh');
    if (await this.isNewDateRangePicker()) {
      // Disable auto-refresh via the settings panel toggle so that
      // onRefreshChange fires with isPaused: true (the play/pause button
      // only toggles isPaused locally without notifying the timefilter).
      await this.openNewPickerSettingsPanel();
      const toggleChecked = await this.testSubjects.getAttribute(
        'dateRangePickerAutoRefreshToggle',
        'aria-checked'
      );
      if (toggleChecked === 'true') {
        await this.testSubjects.click('dateRangePickerAutoRefreshToggle');
      }
      await this.closeNewPickerSettingsPanel();
    } else {
      const refreshConfig = await this.getRefreshConfig(true);
      if (!refreshConfig.isPaused) {
        this.log.debug('pause auto refresh');
        await this.testSubjects.click('superDatePickerToggleRefreshButton');
      }
      await this.quickSelectTimeMenuToggle.close();
    }
  }

  public async resumeAutoRefresh() {
    this.log.debug('resumeAutoRefresh');
    if (await this.isNewDateRangePicker()) {
      // The auto-refresh button is only rendered when isEnabled=true.
      const buttonExists = await this.testSubjects.exists('dateRangePickerAutoRefreshButton', {
        timeout: 1000,
      });
      if (buttonExists) {
        // Button is visible — only click it if it's in the "resume" (paused) state;
        // if it's already showing "pause", auto-refresh is running and we do nothing.
        const ariaLabel =
          (await this.testSubjects.getAttribute(
            'dateRangePickerAutoRefreshButton',
            'aria-label'
          )) ?? '';
        if (ariaLabel.toLowerCase().includes('resume')) {
          await this.testSubjects.click('dateRangePickerAutoRefreshButton');
        }
      } else {
        // Auto-refresh is not enabled at all — enable it via the settings panel.
        await this.openNewPickerSettingsPanel();
        const toggleChecked = await this.testSubjects.getAttribute(
          'dateRangePickerAutoRefreshToggle',
          'aria-checked'
        );
        if (toggleChecked !== 'true') {
          await this.testSubjects.click('dateRangePickerAutoRefreshToggle');
        }
        await this.closeNewPickerSettingsPanel();
      }
    } else {
      const refreshConfig = await this.getRefreshConfig(true);
      if (refreshConfig.isPaused) {
        this.log.debug('resume auto refresh');
        await this.testSubjects.click('superDatePickerToggleRefreshButton');
      }
      await this.quickSelectTimeMenuToggle.close();
    }
  }

  public async setHistoricalDataRange() {
    await this.setDefaultAbsoluteRange();
  }

  public async setDefaultDataRange() {
    const fromTime = 'Jan 1, 2018 @ 00:00:00.000';
    const toTime = 'Apr 13, 2018 @ 00:00:00.000';
    await this.setAbsoluteRange(fromTime, toTime);
  }

  public async setLogstashDataRange() {
    const fromTime = 'Apr 9, 2018 @ 00:00:00.000';
    const toTime = 'Apr 13, 2018 @ 00:00:00.000';
    await this.setAbsoluteRange(fromTime, toTime);
  }
}
