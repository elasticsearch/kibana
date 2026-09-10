/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createDeprecatedRuleAssetSavedObject,
  createRuleAssetSavedObject,
} from '../../../../../helpers/rules';
import {
  createAndInstallMockedPrebuiltRules,
  createDeprecatedRuleAssets,
  installMockPrebuiltRulesPackage,
} from '../../../../../tasks/api_calls/prebuilt_rules';
import {
  deleteAlertsAndRules,
  deletePrebuiltRulesAssets,
} from '../../../../../tasks/api_calls/common';
import { login } from '../../../../../tasks/login';
import { visitRulesManagementTable } from '../../../../../tasks/rules_management';
import {
  DEPRECATED_RULES_TABLE_CALLOUT,
  DEPRECATED_RULES_TABLE_VIEW_BUTTON,
  DEPRECATED_RULES_TABLE_DELETE_BUTTON,
  DEPRECATED_RULES_TABLE_CALLOUT_DISMISS_BUTTON,
  DEPRECATED_RULES_MODAL,
  DEPRECATED_RULES_MODAL_CLOSE,
  DEPRECATED_RULES_MODAL_DELETE_ALL,
  DEPRECATED_RULES_DELETE_CONFIRM_MODAL,
  DEPRECATED_RULES_DELETE_CONFIRM_MODAL_CONFIRM_BUTTON,
} from '../../../../../screens/deprecated_rules';

const DISMISSAL_STORAGE_KEY = 'securitySolution.deprecatedRulesCallout.dismissedAt';

const ACTIVE_RULE = createRuleAssetSavedObject({
  name: 'My prebuilt rule',
  rule_id: 'my-prebuilt-rule',
  version: 1,
});

const DEPRECATED_ASSET = createDeprecatedRuleAssetSavedObject({
  rule_id: 'my-prebuilt-rule',
  version: 2,
  name: 'My prebuilt rule',
});

describe(
  'Deprecated rules - Rule Management page callout',
  {
    tags: ['@ess', '@skipInServerlessMKI'],
  },
  () => {
    before(() => {
      installMockPrebuiltRulesPackage();
    });

    beforeEach(() => {
      deleteAlertsAndRules();
      deletePrebuiltRulesAssets();

      // Clear any callout dismissal state
      cy.clearLocalStorage(DISMISSAL_STORAGE_KEY);
    });

    describe('Callout visibility', () => {
      it('displays the callout when the user has installed deprecated rules', () => {
        createAndInstallMockedPrebuiltRules([ACTIVE_RULE]);
        createDeprecatedRuleAssets({ rules: [DEPRECATED_ASSET] });

        login();
        visitRulesManagementTable();

        cy.get(DEPRECATED_RULES_TABLE_CALLOUT).should('be.visible');
        cy.get(DEPRECATED_RULES_TABLE_VIEW_BUTTON).should('be.visible');
        cy.get(DEPRECATED_RULES_TABLE_DELETE_BUTTON).should('be.visible');
      });

      it('does not display the callout when no deprecated rules are installed', () => {
        // Install a rule but do NOT add a deprecated asset for it
        createAndInstallMockedPrebuiltRules([ACTIVE_RULE]);

        login();
        visitRulesManagementTable();

        cy.get(DEPRECATED_RULES_TABLE_CALLOUT).should('not.exist');
      });
    });

    describe('Callout dismissal', () => {
      beforeEach(() => {
        createAndInstallMockedPrebuiltRules([ACTIVE_RULE]);
        createDeprecatedRuleAssets({ rules: [DEPRECATED_ASSET] });
        login();
        visitRulesManagementTable();
      });

      it('dismisses the callout and keeps it hidden after a page refresh', () => {
        cy.get(DEPRECATED_RULES_TABLE_CALLOUT).should('be.visible');

        // Dismiss the callout via the EuiCallOut dismiss (X) button
        cy.get(DEPRECATED_RULES_TABLE_CALLOUT_DISMISS_BUTTON).click();
        cy.get(DEPRECATED_RULES_TABLE_CALLOUT).should('not.exist');

        // Reload the page — callout should remain hidden
        visitRulesManagementTable();
        cy.get(DEPRECATED_RULES_TABLE_CALLOUT).should('not.exist');
      });

      it('shows the callout again after 7 days have passed since dismissal', () => {
        // Dismiss the callout first
        cy.get(DEPRECATED_RULES_TABLE_CALLOUT_DISMISS_BUTTON).click();
        cy.get(DEPRECATED_RULES_TABLE_CALLOUT).should('not.exist');

        // Simulate 8 days having passed by backdating the dismissal timestamp
        cy.window().then((win) => {
          const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
          win.localStorage.setItem(DISMISSAL_STORAGE_KEY, String(eightDaysAgo));
        });

        // Reload — callout should now reappear
        visitRulesManagementTable();
        cy.get(DEPRECATED_RULES_TABLE_CALLOUT).should('be.visible');
      });
    });

    describe('Deprecated rules modal', () => {
      beforeEach(() => {
        createAndInstallMockedPrebuiltRules([ACTIVE_RULE]);
        createDeprecatedRuleAssets({ rules: [DEPRECATED_ASSET] });
        login();
        visitRulesManagementTable();

        // Open the modal
        cy.get(DEPRECATED_RULES_TABLE_VIEW_BUTTON).click();
        cy.get(DEPRECATED_RULES_MODAL).should('be.visible');
      });

      it('lists all installed deprecated rules with links to their details pages', () => {
        cy.get(DEPRECATED_RULES_MODAL).within(() => {
          // Description should include the count
          cy.contains('1 deprecated rule').should('be.visible');
          // Each rule name should be rendered as a clickable link
          cy.contains('a', 'My prebuilt rule').should('be.visible');
        });
      });

      it('closes the modal when the close button is clicked', () => {
        cy.get(DEPRECATED_RULES_MODAL_CLOSE).click();
        cy.get(DEPRECATED_RULES_MODAL).should('not.exist');
      });

      it('deletes all deprecated rules when the delete all button is clicked and confirmed', () => {
        cy.get(DEPRECATED_RULES_MODAL_DELETE_ALL).click();
        cy.get(DEPRECATED_RULES_DELETE_CONFIRM_MODAL).should('be.visible');
        cy.get(DEPRECATED_RULES_DELETE_CONFIRM_MODAL_CONFIRM_BUTTON).click();

        // Modal closes and callout disappears after successful deletion
        cy.get(DEPRECATED_RULES_MODAL).should('not.exist');
        cy.get(DEPRECATED_RULES_TABLE_CALLOUT).should('not.exist');
      });
    });
  }
);
