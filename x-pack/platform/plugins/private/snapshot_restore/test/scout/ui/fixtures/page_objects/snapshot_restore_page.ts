/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage } from '@kbn/scout';

export class SnapshotRestorePage {
  constructor(private readonly page: ScoutPage) {}

  async waitForSnapshotsTab({
    state = 'noRepos',
  }: { state?: 'noRepos' | 'noSnapshots' | 'hasSnapshots' } = {}) {
    // noRepos    → RepositoryEmptyPrompt renders registerRepositoryButton
    // noSnapshots → SnapshotEmptyPrompt renders emptyPrompt (repos exist, no snapshots yet)
    // hasSnapshots → snapshotList table
    const selectorMap = {
      noRepos: 'registerRepositoryButton',
      noSnapshots: 'emptyPrompt',
      hasSnapshots: 'snapshotList',
    };
    await this.page.testSubj.waitForSelector(selectorMap[state], { state: 'visible' });
  }

  async navToRepositories() {
    await this.page.testSubj.click('repositories_tab');
    await this.page.testSubj.waitForSelector('registerRepositoryButton', { state: 'visible' });
  }

  async navToPolicies() {
    await this.page.testSubj.click('policies_tab');
    await this.page.testSubj.waitForSelector('createPolicyButton', { state: 'visible' });
  }

  async navToRestoreStatus() {
    await this.page.testSubj.click('restore_status_tab');
    await this.page.testSubj.waitForSelector('noRestoredSnapshotsHeader', { state: 'visible' });
  }

  async fillCreateNewPolicyPageOne(
    policyName: string,
    snapshotName: string,
    repositoryName?: string
  ) {
    await this.page.testSubj.click('createPolicyButton');
    await this.page.testSubj.fill('nameInput', policyName);
    await this.page.testSubj.fill('snapshotNameInput', snapshotName);
    if (repositoryName) {
      await this.page.testSubj.locator('repositorySelect').selectOption(repositoryName);
    }
    await this.page.testSubj.click('nextButton');
    await this.page.testSubj.waitForSelector('allIndicesToggle', { state: 'visible' });
  }

  async fillCreateNewPolicyPageTwo() {
    await this.page.testSubj.click('nextButton');
    await this.page.testSubj.waitForSelector('expireAfterValueInput', { state: 'visible' });
  }

  async fillCreateNewPolicyPageThree() {
    await this.page.testSubj.click('nextButton');
    await this.page.testSubj.waitForSelector('submitButton', { state: 'visible' });
  }

  async submitNewPolicy() {
    await this.page.testSubj.click('submitButton');
    await this.page.testSubj.waitForSelector('policyActionMenuButton', { state: 'visible' });
  }

  async closeFlyout() {
    await this.page.testSubj.click('srPolicyDetailsFlyoutCloseButton');
    await this.page.testSubj.waitForSelector('policyLink', { state: 'visible' });
  }
}
