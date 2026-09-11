/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, KibanaUrl, Locator } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { FormMonitorType } from '../constants';

export class SyntheticsAppPage {
  public readonly ruleMonitorCount: Locator;
  constructor(private readonly page: ScoutPage, private readonly kbnUrl: KibanaUrl) {
    this.ruleMonitorCount = page.testSubj.locator('syntheticsStatusRuleVizMonitorCount');
  }

  async navigateToMonitorManagement() {
    await this.page.goto(this.kbnUrl.get('/app/synthetics/monitors'));
    await this.waitForMonitorManagementLoadingToFinish();
  }

  async navigateToGettingStarted() {
    await this.page.goto(this.kbnUrl.get('/app/synthetics/monitors/getting-started'));
    await this.page.testSubj.waitForSelector('syntheticsGettingStartedOnPremLink');
  }

  async navigateToOverview(refreshInterval?: number) {
    const url = refreshInterval
      ? `/app/synthetics?refreshInterval=${refreshInterval}`
      : '/app/synthetics';
    await this.page.goto(this.kbnUrl.get(url));
    await this.waitForLoadingToFinish();
  }

  async navigateToSettings() {
    await this.page.goto(this.kbnUrl.get('/app/synthetics/settings'));
    await this.page.testSubj.waitForSelector('createConnectorButton');
  }

  async navigateToParamsSettings() {
    await this.page.goto(this.kbnUrl.get('/app/synthetics/settings/params'));
    await this.page.testSubj.waitForSelector('syntheticsParamsTable-loaded');
  }

  async navigateToSettingsTab(tabText: string) {
    await this.page.click(`text=${tabText}`);
  }

  async navigateToFleetIntegrationPolicies() {
    await this.page.goto(this.kbnUrl.get('/app/integrations/detail/synthetics/policies'));
    await expect(this.page.getByRole('heading', { name: 'Elastic Synthetics' })).toBeVisible();
  }

  async selectMonitorFromSelector(monitorName: string) {
    await this.page.click('[aria-label="Select a different monitor to view its details"]');
    await this.page.click(`text=${monitorName}`);
  }

  async navigateToAddMonitor() {
    await this.page.goto(this.kbnUrl.get('/app/synthetics/add-monitor'));
    await this.page.testSubj.waitForSelector('syntheticsMonitorConfigName', { timeout: 30_000 });
  }

  async waitForMonitorManagementLoadingToFinish() {
    await expect(this.page.testSubj.locator('syntheticsMonitorList-loaded')).toBeVisible({
      timeout: 30_000,
    });
  }

  async waitForLoadingToFinish() {
    await expect(this.page.testSubj.locator('kbnLoadingMessage')).toBeHidden({ timeout: 30_000 });
  }

  async ensureIsOnMonitorConfigPage() {
    await expect(this.page.testSubj.locator('syntheticsMonitorConfigSubmitButton')).toBeVisible({
      timeout: 30_000,
    });
  }

  async confirmAndSave(isUpdate = false) {
    await this.ensureIsOnMonitorConfigPage();
    await this.page.testSubj.click('syntheticsMonitorConfigSubmitButton');
    const msg = isUpdate ? 'Monitor updated successfully.' : 'Monitor added successfully.';
    await expect(this.page.getByText(msg)).toBeVisible();
    await this.page.testSubj.locator('toastCloseButton').click();
  }

  async selectMonitorType(monitorType: string) {
    await this.page.testSubj.click(monitorType);
  }

  async selectLocationsAddEdit({ locations }: { locations: string[] }) {
    for (const loc of locations) {
      await this.page.testSubj.click('syntheticsMonitorConfigLocations');
      await this.page.click(`text=${loc}`);
    }
  }

  async selectFrequencyAddEdit({ value, unit }: { value: number; unit: string }) {
    await this.page.testSubj.click('syntheticsMonitorConfigSchedule');
    const optionLocator = this.page.locator(`text=Every ${value} ${unit}`);
    await optionLocator.evaluate((element: HTMLOptionElement) => {
      if (element?.parentElement) {
        (element.parentElement as HTMLSelectElement).selectedIndex = element.index;
      }
    });
  }

  async fillFirstMonitorDetails({ url, location }: { url: string; location: string }) {
    await this.page.testSubj.fill('urls-input', url);
    await this.page.components
      .comboBox('syntheticsServiceLocations')
      .setSelectedOptions([location]);
  }

  async createBasicMonitorDetails({
    name,
    apmServiceName,
    locations,
  }: {
    name: string;
    apmServiceName: string;
    locations: string[];
  }) {
    await this.page.click('text="Advanced options"');
    await this.page.testSubj.fill('syntheticsMonitorConfigName', name);
    await this.page.testSubj.fill('syntheticsMonitorConfigAPMServiceName', apmServiceName);
    await this.selectLocationsAddEdit({ locations });
  }

  async createBasicHTTPMonitorDetails({
    name,
    url,
    apmServiceName,
    locations,
  }: {
    name: string;
    url: string;
    apmServiceName: string;
    locations: string[];
  }) {
    await this.selectMonitorType('syntheticsMonitorTypeHTTP');
    await this.createBasicMonitorDetails({ name, apmServiceName, locations });
    await this.page.testSubj.fill('syntheticsMonitorConfigURL', url);
  }

  async createBasicTCPMonitorDetails({
    name,
    host,
    apmServiceName,
    locations,
  }: {
    name: string;
    host: string;
    apmServiceName: string;
    locations: string[];
  }) {
    await this.selectMonitorType('syntheticsMonitorTypeTCP');
    await this.createBasicMonitorDetails({ name, apmServiceName, locations });
    await this.page.testSubj.fill('syntheticsMonitorConfigHost', host);
  }

  async createBasicICMPMonitorDetails({
    name,
    host,
    apmServiceName,
    locations,
  }: {
    name: string;
    host: string;
    apmServiceName: string;
    locations: string[];
  }) {
    await this.selectMonitorType('syntheticsMonitorTypeICMP');
    await this.createBasicMonitorDetails({ name, apmServiceName, locations });
    await this.page.testSubj.fill('syntheticsMonitorConfigHost', host);
  }

  async createBasicBrowserMonitorDetails({
    name,
    inlineScript,
    recorderScript,
    apmServiceName,
    locations,
  }: {
    name: string;
    inlineScript?: string;
    recorderScript?: string;
    apmServiceName: string;
    locations: string[];
  }) {
    await this.createBasicMonitorDetails({ name, apmServiceName, locations });
    if (inlineScript) {
      await this.page.testSubj.click('syntheticsSourceTab__inline');
      await this.page.fill('[data-test-subj=codeEditorContainer] textarea', inlineScript);
      return;
    }
    if (recorderScript) {
      await this.page.setInputFiles('input[data-test-subj=syntheticsFleetScriptRecorderUploader]', {
        name: 'file.js',
        mimeType: 'text/javascript',
        buffer: Buffer.from(recorderScript),
      });
    }
  }

  async createBasicAPIMonitorDetails({
    name,
    inlineScript,
    apmServiceName,
    locations,
  }: {
    name: string;
    inlineScript: string;
    apmServiceName: string;
    locations: string[];
  }) {
    await this.selectMonitorType('syntheticsMonitorTypeAPI');
    await this.createBasicMonitorDetails({ name, apmServiceName, locations });
    await this.page.testSubj.click('syntheticsSourceTab__inline');
    await this.page.fill('[data-test-subj=codeEditorContainer] textarea', inlineScript);
  }

  async createMonitor({
    monitorConfig,
    monitorType,
  }: {
    monitorConfig: Record<string, string | string[]>;
    monitorType: FormMonitorType;
  }) {
    switch (monitorType) {
      case FormMonitorType.HTTP:
        await this.createBasicHTTPMonitorDetails(monitorConfig as any);
        break;
      case FormMonitorType.TCP:
        await this.createBasicTCPMonitorDetails(monitorConfig as any);
        break;
      case FormMonitorType.ICMP:
        await this.createBasicICMPMonitorDetails(monitorConfig as any);
        break;
      case FormMonitorType.MULTISTEP:
        await this.createBasicBrowserMonitorDetails(monitorConfig as any);
        break;
      case FormMonitorType.API:
        await this.createBasicAPIMonitorDetails(monitorConfig as any);
        break;
      default:
        break;
    }
  }

  async enableMonitorManagement(shouldEnable = true) {
    const addMonitorBtn = this.page.getByRole('button', { name: 'Create monitor' });
    const isDisabled = await addMonitorBtn.isDisabled();
    const isEnabled = !isDisabled;
    if (isEnabled === shouldEnable) {
      return;
    }
    const toggle = this.page.testSubj.locator('syntheticsEnableSwitch');
    const button = this.page.testSubj.locator('syntheticsEnableButton');
    if (await toggle.isVisible({ timeout: 3000 })) {
      await toggle.click();
    } else if (await button.isVisible({ timeout: 3000 })) {
      await button.click();
    }
  }

  async getMonitorRowLocator(monitorName: string) {
    const monitorRow = this.page.locator(
      `.euiTableRow:has([data-test-subj="syntheticsMonitorDetailsLinkLink"]:has-text("${monitorName}"))`
    );
    await expect(monitorRow).toBeVisible();
    await monitorRow.scrollIntoViewIfNeeded();
    return monitorRow;
  }

  async deleteMonitor(monitorName: string) {
    const monitorRow = await this.getMonitorRowLocator(monitorName);
    await monitorRow.locator('[data-test-subj="euiCollapsedItemActionsButton"]').click();
    await this.page.testSubj.click('syntheticsMonitorDeleteAction');
    await expect(this.page.testSubj.locator('confirmModalTitleText')).toBeVisible();
    await this.page.testSubj.click('confirmModalConfirmButton');
  }

  async navigateToEditMonitor(monitorName: string) {
    const monitorRow = await this.getMonitorRowLocator(monitorName);
    await monitorRow.hover();
    await monitorRow.locator('[data-test-subj="syntheticsMonitorEditAction"]').click();
    await this.ensureIsOnMonitorConfigPage();
  }

  async adjustRows() {
    await this.page.testSubj.click('tablePaginationPopoverButton');
    await this.page.click('text="100 rows"');
  }

  async selectAllMonitors() {
    await this.page.testSubj.click('checkboxSelectAll');
  }

  async openBulkActionsMenu() {
    // The bulk actions button only renders once at least one monitor is selected.
    await this.page.testSubj.click('syntheticsBulkActionsButton');
  }

  async selectMaintenanceWindowInFlyout(title: string) {
    const flyout = this.page.testSubj.locator('syntheticsBulkMaintenanceWindowsFlyout');
    await flyout.locator('[data-test-subj="comboBoxSearchInput"]').click();
    await this.page.getByRole('option', { name: title }).click();
  }

  async saveBulkMaintenanceWindows() {
    await this.page.testSubj.click('syntheticsBulkMaintenanceWindowsSave');
  }

  async findEditMonitorConfiguration(monitorEditDetails: Array<[string, string]>) {
    await this.page.click('text="Advanced options"');
    for (const [selector, expected] of monitorEditDetails) {
      if (selector.includes('codeEditorContainer')) {
        // Monaco innerText includes the gutter line number and may wrap tokens.
        await expect(this.page.locator(selector)).toContainText(expected);
      } else {
        await expect(this.page.locator(selector)).toHaveValue(expected);
      }
    }
  }

  async openMonitorActionsMenu(monitorName: string) {
    await this.page.hover(`text=${monitorName}`);
    await this.page.click('[aria-label="Open actions menu"]');
  }

  async createPrivateLocation({
    name,
    agentPolicy,
    tags,
  }: {
    name: string;
    agentPolicy: string;
    tags?: string[];
  }) {
    await this.page.click('button:has-text("Create location")');
    await this.page.testSubj.fill('syntheticsLocationFormFieldText', name);
    await this.page.click('[aria-label="Select agent policy"]');
    await this.page.click(`button[role="option"]:has-text("${agentPolicy}Agents: 0")`);
    if (tags?.length) {
      await this.page.click('.euiComboBox__inputWrap');
      for (const tag of tags) {
        await this.page.fill('[aria-label="Tags"]', tag);
        await this.page.press('[aria-label="Tags"]', 'Enter');
      }
    }
    await this.page.click('button:has-text("Save")');
  }

  async deleteLocation() {
    await this.page.testSubj.click('action-delete');
    await this.page.testSubj.click('confirmModalConfirmButton');
  }

  async createGlobalParameter({
    key,
    value,
    description,
    tags,
  }: {
    key: string;
    value: string;
    description?: string;
    tags?: string[];
  }) {
    await this.page.testSubj.click('syntheticsAddParamFlyoutButton');
    await this.page.fill('input[name="key"]', key);
    await this.page.testSubj.fill('syntheticsAddParamFormTextArea', value);
    if (tags?.length) {
      await this.page.click('.euiComboBox__inputWrap');
      for (const tag of tags) {
        await this.page.fill('[aria-label="Tags"]', tag);
      }
    }
    if (description) {
      await this.page.fill('input[name="description"]', description);
    }
    await this.page.click('text=Save');
  }

  async editGlobalParameter({
    key,
    newValue,
    tags,
  }: {
    key?: string;
    newValue?: string;
    tags?: string[];
  }) {
    await this.page.testSubj.click('action-edit');
    if (key) {
      await this.page.fill('[aria-label="Key"]', key);
    }
    if (newValue) {
      await this.page.fill('[aria-label="New value"]', newValue);
    }
    if (tags?.length) {
      await this.page.click('.euiComboBox__inputWrap');
      for (const tag of tags) {
        await this.page.fill('[aria-label="Tags"]', tag);
        await this.page.press('[aria-label="Tags"]', 'Enter');
      }
    }
    await this.page.click('button:has-text("Save")');
  }

  async deleteGlobalParameter() {
    await this.page.testSubj.click('action-delete');
    await this.page.testSubj.click('confirmModalConfirmButton');
  }

  async selectFilterOption(filterLabel: string, optionText: string) {
    await this.page.click(`[aria-label="expands filter group for ${filterLabel} filter"]`);
    await this.page.click(`span >> text="${optionText}"`);
    await this.page.click(`[aria-label="Apply the selected filters for ${filterLabel}"]`);
  }

  async deleteMonitorFromEditPage() {
    await this.page.click('text="Delete monitor"');
    await this.page.testSubj.click('confirmModalConfirmButton');
  }

  async editStatusRuleSchedule({ value, unit }: { value: string; unit: string }) {
    await expect(this.page.testSubj.locator('editDefaultStatusRule')).toBeVisible({
      timeout: 30_000,
    });
    await this.page.testSubj.click('editDefaultStatusRule');
    await expect(this.page.getByText('Monitor status rule')).toBeVisible();
    await this.page.testSubj.locator('ruleScheduleUnitInput').selectOption(unit);
    await this.page.testSubj.locator('ruleScheduleNumberInput').fill(value);
    await this.page.testSubj.click('ruleFlyoutFooterSaveButton');
    await expect(this.page.getByText('Updated "Synthetics status internal rule"')).toBeVisible();
  }

  async goToRulesPage() {
    await this.page.goto(this.kbnUrl.get('/app/observability/alerts/rules'));
  }

  async navigateToAlertsPage() {
    await this.page.goto(this.kbnUrl.get('/app/observability/alerts'));
    await this.page.testSubj.waitForSelector('querySubmitButton');
  }

  async refreshOverview(refreshInterval = 15) {
    // Callers create monitors via the API after navigating with zero monitors, so
    // the overview has already redirected to its empty getting-started/management
    // state, which has no SyntheticsDatePicker. Re-navigate so the fresh load
    // re-queries the now-existing monitors and renders the populated overview
    // header before clicking the date picker's apply/refresh button.
    await this.navigateToOverview(refreshInterval);
    // The URL's auto-refresh interval plus late-mounting banners re-render the
    // toolbar while the overview settles, detaching the apply button mid-click.
    // Re-resolve and retry the click instead of a single attempt.
    await expect(async () => {
      await this.page.testSubj.locator('superDatePickerApplyTimeButton').click({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await this.waitForLoadingToFinish();
  }

  async openAlertRulesMenu() {
    await expect(this.page.testSubj.locator('syntheticsAlertsRulesButton')).toBeEnabled();
    await this.page.testSubj.click('syntheticsAlertsRulesButton');
  }

  async openManageStatusRule() {
    await this.openAlertRulesMenu();
    await expect(this.page.testSubj.locator('manageStatusRuleName')).toBeVisible({
      timeout: 30_000,
    });
    await this.page.testSubj.click('manageStatusRuleName');
  }

  async openManageTlsRule() {
    await this.openAlertRulesMenu();
    await this.page.testSubj.click('manageTlsRuleName');
  }

  async openCreateConnectorFlyout() {
    await this.page.testSubj.click('createConnectorButton');
    await this.page.testSubj.waitForSelector('create-connector-flyout');
  }

  async selectConnectorType(type: string) {
    const card = this.page.testSubj.locator(`.${type}-card`);
    await card.scrollIntoViewIfNeeded();
    await card.click();
  }

  async saveConnectorInFlyout() {
    await this.page.testSubj.click('create-connector-flyout-save-btn');
  }

  getDefaultConnectorsComboBox() {
    // This combo encodes a loading state in its data-test-subj
    // (default-connectors-input-{loading|loaded}) and re-fetches after each
    // selection. setSelectedOptions polls the read-back until the selection
    // settles, so the "-loaded" anchor reads correctly despite the reload.
    return this.page.components.comboBox('default-connectors-input-loaded');
  }

  isEuiFormFieldInValid(locator: Locator): Promise<boolean> {
    return locator.evaluate((el: HTMLElement) => {
      const classAttribute = el.getAttribute('class') ?? '';
      const isAriaInvalid = el.getAttribute('aria-invalid') ?? 'false';
      return classAttribute.indexOf('-isInvalid') > -1 || isAriaInvalid === 'true';
    });
  }
}
