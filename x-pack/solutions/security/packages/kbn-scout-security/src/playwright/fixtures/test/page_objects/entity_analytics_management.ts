/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';
import { expect } from '../../../../../ui';

const PAGE_URL = 'security/entity_analytics_management';
const OLD_ENTITY_STORE_URL = 'security/entity_analytics_entity_store';
const OLD_ASSET_CRITICALITY_URL = 'security/entity_analytics_asset_criticality';

export class EntityAnalyticsManagementPage {
  // Page header
  public managementPage: Locator;
  public pageTitle: Locator;
  public entityAnalyticsSwitch: Locator;
  public entityAnalyticsHealth: Locator;
  public statusLoading: Locator;
  public errorPanel: Locator;

  // Tabs
  public tabs: Locator;
  public riskScoreTab: Locator;
  public assetCriticalityTab: Locator;
  public engineStatusTab: Locator;

  // Risk Score tab
  public riskPreviewError: Locator;
  public riskPreviewErrorButton: Locator;
  public riskScoreErrorPanel: Locator;

  // Risk Score tab - Form inputs
  public riskScoreRetainCheckbox: Locator;
  public includeClosedAlertsSwitch: Locator;
  public riskScoreSaveButton: Locator;
  public riskScoreDiscardButton: Locator;

  // Asset Criticality tab
  public assetCriticalityInfoPanel: Locator;
  public assetCriticalityFileUploadSection: Locator;
  public assetCriticalityDocLink: Locator;
  public assetCriticalityInsufficientPrivilegesCallout: Locator;
  public assetCriticalityIssueCallout: Locator;

  // Engine Status tab
  public engineComponentsStatusTable: Locator;

  // Privileges callouts
  public riskEnginePrivilegesCallout: Locator;
  public riskEnginePreviewPrivilegesCallout: Locator;

  constructor(private readonly page: ScoutPage) {
    // Page header
    this.managementPage = this.page.testSubj.locator('entityAnalyticsManagementPage');
    this.pageTitle = this.page.testSubj.locator('entityAnalyticsManagementPageTitle');
    this.entityAnalyticsSwitch = this.page.testSubj.locator('entity-analytics-switch');
    this.entityAnalyticsHealth = this.page.testSubj.locator('entity-analytics-health');
    this.statusLoading = this.page.testSubj.locator('entity-analytics-status-loading');
    this.errorPanel = this.page.testSubj.locator('entity-analytics-error-panel');

    // Tabs
    this.tabs = this.page.testSubj.locator('entityAnalyticsManagementTabs');
    this.riskScoreTab = this.page.testSubj.locator('riskScoreTab');
    this.assetCriticalityTab = this.page.testSubj.locator('assetCriticalityTab');
    this.engineStatusTab = this.page.testSubj.locator('engineStatusTab');

    // Risk Score tab
    this.riskPreviewError = this.page.testSubj.locator('risk-preview-error');
    this.riskPreviewErrorButton = this.page.testSubj.locator('risk-preview-error-button');
    this.riskScoreErrorPanel = this.page.testSubj.locator('risk-score-error-panel');

    // Risk Score tab - Form inputs
    this.riskScoreRetainCheckbox = this.page.testSubj.locator('riskScoreRetainCheckbox');
    this.includeClosedAlertsSwitch = this.page.testSubj.locator('includeClosedAlertsSwitch');
    this.riskScoreSaveButton = this.page.testSubj.locator('riskScoreSaveButton');
    this.riskScoreDiscardButton = this.page.testSubj.locator('riskScoreDiscardButton');

    // Asset Criticality tab
    this.assetCriticalityInfoPanel = this.page.testSubj.locator('asset-criticality-info-panel');
    this.assetCriticalityFileUploadSection = this.page.testSubj.locator(
      'asset-criticality-file-upload-section'
    );
    this.assetCriticalityDocLink = this.page.testSubj.locator('asset-criticality-doc-link');
    this.assetCriticalityInsufficientPrivilegesCallout = this.page.testSubj.locator(
      'asset-criticality-insufficient-privileges'
    );
    this.assetCriticalityIssueCallout = this.page.testSubj.locator(
      'asset-criticality-issue-callout'
    );

    // Engine Status tab
    this.engineComponentsStatusTable = this.page.testSubj.locator('engine-status-panel');

    // Privileges callouts
    this.riskEnginePrivilegesCallout = this.page.testSubj.locator(
      'callout-missing-risk-engine-privileges'
    );
    this.riskEnginePreviewPrivilegesCallout = this.page.testSubj.locator(
      'missing-risk-engine-preview-permissions'
    );
  }

  async navigate() {
    await this.page.gotoApp(PAGE_URL);
  }

  async navigateToOldEntityStoreUrl() {
    await this.page.gotoApp(OLD_ENTITY_STORE_URL);
  }

  async navigateToOldAssetCriticalityUrl() {
    await this.page.gotoApp(OLD_ASSET_CRITICALITY_URL);
  }

  async navigateToRiskScoreTab() {
    await this.riskScoreTab.click();
  }

  async navigateToAssetCriticalityTab() {
    await this.assetCriticalityTab.click();
  }

  async navigateToEngineStatusTab() {
    await this.engineStatusTab.click();
  }

  async toggleEntityAnalytics() {
    // `'visible'` (not `'attached'`) — the switch is rendered while the entity
    // store / risk engine status queries are still loading, but is correctly
    // disabled in that window. Waiting only for `attached` would let Playwright
    // proceed to `click()`, which then races the actionability check against
    // re-renders. Waiting for `visible` and explicitly asserting enabled state
    // keeps the wait deterministic. See https://github.com/elastic/kibana/issues/259664.
    await this.entityAnalyticsSwitch.waitFor({ state: 'visible' });
    await expect(this.entityAnalyticsSwitch).toBeEnabled();
    await this.entityAnalyticsSwitch.click();
  }

  async waitForStatusLoaded() {
    await this.statusLoading.waitFor({ state: 'detached', timeout: 30000 });
    await this.entityAnalyticsHealth.waitFor({ state: 'visible', timeout: 30000 });
  }

  /** Clicks "Clear Entity Data" and confirms the modal, which calls the entity store uninstall API. */
  async clearEntityData() {
    const modal = this.page.testSubj.locator('clear-entity-data-modal');
    await this.page.testSubj.locator('clear-entity-data-button').click();
    await modal.waitFor({ state: 'visible' });
    await this.page.testSubj.locator('confirmModalConfirmButton').click();
    await modal.waitFor({ state: 'detached' });
  }
}
