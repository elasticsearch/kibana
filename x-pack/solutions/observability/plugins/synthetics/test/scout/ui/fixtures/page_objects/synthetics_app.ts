/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, KibanaUrl, Locator } from '@kbn/scout-oblt';
import { EuiComboBoxWrapper } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { FormMonitorType } from '../constants';

export class SyntheticsAppPage {
  public readonly ruleMonitorCountButton: Locator;
  constructor(private readonly page: ScoutPage, private readonly kbnUrl: KibanaUrl) {
    this.ruleMonitorCountButton = page.testSubj.locator(
      'syntheticsStatusRuleVizMonitorQueryIDsButton'
    );
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

  async navigateToStepDetails({
    configId,
    stepIndex,
    checkGroup,
    locationId,
  }: {
    checkGroup: string;
    configId: string;
    stepIndex: number;
    locationId?: string;
  }) {
    const locationQuery = locationId ? `?locationId=${locationId}` : '';
    const stepDetailsPath = `/app/synthetics/monitor/${configId}/test-run/${checkGroup}/step/${stepIndex}${locationQuery}`;
    await this.page.goto(this.kbnUrl.get(stepDetailsPath));
    await this.page.testSubj.waitForSelector('synth-step-metrics');
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
    const comboBox = new EuiComboBoxWrapper(this.page, {
      dataTestSubj: 'syntheticsServiceLocations',
    });
    await comboBox.selectMultiOption(location);
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

  async findEditMonitorConfiguration(monitorEditDetails: Array<[string, string]>) {
    await this.page.click('text="Advanced options"');
    for (const [selector, expected] of monitorEditDetails) {
      if (selector.includes('codeEditorContainer')) {
        await expect(this.page.locator(selector)).toHaveText(expected);
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

  async refreshOverview() {
    // The overview header replaced the shared refresh button with the
    // SyntheticsDatePicker, whose EuiSuperDatePicker apply/refresh button drives
    // the app refresh.
    await this.page.testSubj.click('superDatePickerApplyTimeButton');
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
    return new EuiComboBoxWrapper(this.page, {
      dataTestSubj: 'default-connectors-input-loaded',
    });
  }

  isEuiFormFieldInValid(locator: Locator): Promise<boolean> {
    return locator.evaluate((el: HTMLElement) => {
      const classAttribute = el.getAttribute('class') ?? '';
      const isAriaInvalid = el.getAttribute('aria-invalid') ?? 'false';
      return classAttribute.indexOf('-isInvalid') > -1 || isAriaInvalid === 'true';
    });
  }
}
