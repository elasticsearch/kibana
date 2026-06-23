/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout';
import { KibanaCodeEditorWrapper } from '@kbn/scout';
import type { DiscoverAppMenu } from './discover_app_menu';

const RULE_FORM_ID = 'ruleV2Form';

export class RuleFormPage {
  public readonly nameInput: Locator;
  public readonly submitButton: Locator;
  public readonly flyoutNextButton: Locator;
  public readonly flyoutSubmitButton: Locator;
  /** @deprecated Use {@link flyoutNextButton} or {@link flyoutSubmitButton}. */
  public readonly flyoutSaveButton: Locator;
  public readonly cancelButton: Locator;
  /**
   * Inline field-level error shown below the rule name input when the name
   * field fails validation (empty or equals the default placeholder).
   */
  public readonly nameFieldError: Locator;
  public readonly flyout: Locator;
  public readonly flyoutValidationCallout: Locator;
  public readonly form: Locator;
  public readonly esqlModeButton: Locator;

  private readonly codeEditor: KibanaCodeEditorWrapper;

  constructor(private readonly page: ScoutPage, private readonly discoverAppMenu: DiscoverAppMenu) {
    this.codeEditor = new KibanaCodeEditorWrapper(page);

    this.nameInput = this.page.testSubj.locator('ruleNameInput');
    this.submitButton = this.page.testSubj.locator('ruleV2FormSubmitButton');
    this.flyoutNextButton = this.page.testSubj.locator('composeDiscoverNext');
    this.flyoutSubmitButton = this.page.testSubj.locator('composeDiscoverSubmit');
    this.flyoutSaveButton = this.flyoutNextButton;
    this.cancelButton = this.page.testSubj.locator('composeDiscoverCancel');
    // The ComposeDiscoverFlyout title ID.
    this.flyout = this.page.locator('[aria-labelledby="composeDiscoverFlyoutTitle"]');
    // EuiFormRow puts `id` on the label; the error text is a sibling, not a descendant.
    this.nameFieldError = this.flyout.getByText(/Name is required/);
    this.flyoutValidationCallout = this.page.testSubj.locator('ruleV2FlyoutValidationErrors');
    this.form = this.page.locator(`#${RULE_FORM_ID}`);
    this.esqlModeButton = this.page.testSubj.locator('select-text-based-language-btn');
  }

  async gotoCreate() {
    await this.page.gotoApp('management/alertingV2/rules/create');
  }

  async gotoRulesList() {
    await this.page.gotoApp('management/alertingV2/rules');
  }

  async gotoRuleDetails(ruleId: string) {
    await this.page.gotoApp(`management/alertingV2/rules/${ruleId}`);
  }

  async gotoDiscover() {
    await this.page.gotoApp('discover');
  }

  /**
   * Returns the breadcrumb anchor with the given text. The Kibana chrome
   * doesn't currently expose a `data-test-subj` for individual breadcrumb
   * links, so this falls back to a scoped role-based locator.
   */
  breadcrumb(text: string) {
    return this.page
      .getByRole('navigation', { name: 'Breadcrumbs' })
      .getByRole('link', { name: text });
  }

  async setRuleName(name: string) {
    await this.nameInput.fill(name);
  }

  async clearRuleName() {
    await this.nameInput.fill('');
  }

  async clickSave() {
    await this.submitButton.click();
  }

  async clickFlyoutSave() {
    await this.discoverAppMenu.dismissQuerySandboxIfOpen();
    // Details step validates the name field via Next, not Submit.
    if (await this.nameInput.isVisible()) {
      await this.waitForProceedButtonEnabled();
      await this.flyoutNextButton.click();
      return;
    }
    await this.waitForProceedButtonEnabled();
    await this.clickVisibleProceedButton();
  }

  /**
   * Advances through the ComposeDiscoverFlyout steps until the Details step
   * (where the rule name input appears). Assumes the flyout is already open
   * with a Discover query that includes a splittable alert condition (WHERE clause).
   */
  async navigateToDetailsStep() {
    await this.clickNextWhenEnabled();
    await this.clickNextWhenEnabled();
    await this.nameInput.waitFor({ state: 'visible' });
  }

  private async waitForProceedButtonEnabled() {
    await this.discoverAppMenu.dismissQuerySandboxIfOpen();
    await this.page.waitForFunction(() => {
      const next = document.querySelector(
        '[data-test-subj="composeDiscoverNext"]'
      ) as HTMLButtonElement | null;
      const submit = document.querySelector(
        '[data-test-subj="composeDiscoverSubmit"]'
      ) as HTMLButtonElement | null;
      const button = next ?? submit;
      return Boolean(button && !button.disabled);
    });
  }

  private async clickVisibleProceedButton() {
    if (await this.flyoutSubmitButton.isVisible()) {
      await this.flyoutSubmitButton.click();
      return;
    }

    await this.flyoutNextButton.click();
  }

  private async clickNextWhenEnabled() {
    await this.waitForProceedButtonEnabled();
    await this.clickVisibleProceedButton();
  }

  async switchToEsqlMode() {
    await this.esqlModeButton.click();
  }

  /**
   * Alerts → Create ES|QL rule. Uses the shared {@link DiscoverAppMenu}
   * page object so selectors stay in sync with `discover_alerts_menu.spec.ts`.
   */
  async openRulesFlyoutFromDiscover() {
    await this.discoverAppMenu.openCreateEsqlRuleFlyout();
  }

  /** Sets the Discover ES|QL editor (model index 0) without submitting. */
  async setDiscoverQueryWithFlyoutOpen(query: string) {
    await this.codeEditor.setCodeEditorValue(query, 0);
  }

  /**
   * Submits the Discover ES|QL query while the compose flyout is open.
   * The flyout overlay intercepts pointer events on the submit button, so we
   * trigger the click programmatically instead.
   */
  async submitDiscoverQuery() {
    await this.page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('[data-test-subj="querySubmitButton"]')?.click();
    });
  }

  /** Scroll the rule form to the bottom (used to assert error callout in viewport). */
  async scrollFormToBottom() {
    await this.form.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
  }
}
