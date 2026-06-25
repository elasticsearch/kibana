/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createRuleAssetSavedObject } from '../../../../../helpers/rules';
import { visitRulesManagementTable } from '../../../../../tasks/rules_management';
import {
  COLLAPSED_ACTION_BTN,
  ELASTIC_RULES_BTN,
  ADD_ELASTIC_RULES_BTN,
  RULES_EMPTY_PROMPT,
  RULES_MONITORING_TAB,
  RULE_SWITCH,
  SELECT_ALL_RULES_ON_PAGE_CHECKBOX,
  INSTALL_ALL_RULES_BUTTON,
} from '../../../../../screens/alerts_detection_rules';
import {
  deleteFirstRule,
  disableAutoRefresh,
  getRulesManagementTableRows,
  selectAllRules,
  selectRulesByName,
  waitForRuleToUpdate,
} from '../../../../../tasks/alerts_detection_rules';
import {
  deleteSelectedRules,
  disableSelectedRules,
  enableSelectedRules,
} from '../../../../../tasks/rules_bulk_actions';
import {
  getInstalledPrebuiltRulesCount,
  installMockPrebuiltRulesPackage,
  installPrebuiltRuleAssets,
  installSpecificPrebuiltRulesRequest,
} from '../../../../../tasks/api_calls/prebuilt_rules';
import {
  deleteAlertsAndRules,
  deletePrebuiltRulesAssets,
} from '../../../../../tasks/api_calls/common';
import { login } from '../../../../../tasks/login';

const PREBUILT_RULE_ASSETS = Array.from(Array(5)).map((_, i) =>
  createRuleAssetSavedObject({
    name: `Test rule ${i + 1}`,
    rule_id: `rule_${i + 1}`,
  })
);

describe('Prebuilt rules', { tags: ['@ess', '@serverless', '@skipInServerlessMKI'] }, () => {
  before(() => {
    installMockPrebuiltRulesPackage();
  });

  beforeEach(() => {
    deleteAlertsAndRules();
    deletePrebuiltRulesAssets();
    installPrebuiltRuleAssets(PREBUILT_RULE_ASSETS);
    installSpecificPrebuiltRulesRequest(PREBUILT_RULE_ASSETS);

    login();

    visitRulesManagementTable();
    disableAutoRefresh();
  });

  describe('Alerts rules, prebuilt rules', () => {
    it('Loads prebuilt rules', () => {
      // Check that the rules table contains rules
      getRulesManagementTableRows().should('have.length.gte', 1);

      // Check the correct count of prebuilt rules is displayed
      getInstalledPrebuiltRulesCount().then((availablePrebuiltRulesCount) => {
        cy.get(ELASTIC_RULES_BTN).should(
          'have.text',
          `Elastic rules (${availablePrebuiltRulesCount})`
        );
      });
    });

    context('Rule monitoring table', () => {
      it('Allows to enable/disable all rules at once', () => {
        cy.get(RULES_MONITORING_TAB).click();

        cy.get(SELECT_ALL_RULES_ON_PAGE_CHECKBOX).click();
        enableSelectedRules();
        waitForRuleToUpdate();
        cy.get(RULE_SWITCH).should('have.attr', 'aria-checked', 'true');

        selectAllRules();
        disableSelectedRules();
        waitForRuleToUpdate();
        cy.get(RULE_SWITCH).should('have.attr', 'aria-checked', 'false');
      });
    });
  });

  describe('Actions with prebuilt rules', () => {
    context('Rules table', () => {
      it('Allows to enable/disable all rules at once', () => {
        selectAllRules();
        enableSelectedRules();
        waitForRuleToUpdate();
        cy.get(RULE_SWITCH).should('have.attr', 'aria-checked', 'true');

        disableSelectedRules();
        waitForRuleToUpdate();
        cy.get(RULE_SWITCH).should('have.attr', 'aria-checked', 'false');
      });

      it('Does not allow to delete one rule when more than one is selected', () => {
        selectAllRules();

        cy.get(COLLAPSED_ACTION_BTN).each((collapsedItemActionBtn) => {
          cy.wrap(collapsedItemActionBtn).should('have.attr', 'aria-disabled', 'true');
        });
      });

      it('Deletes and recovers one rule', () => {
        getInstalledPrebuiltRulesCount().then((availablePrebuiltRulesCount) => {
          const expectedNumberOfRulesAfterDeletion = availablePrebuiltRulesCount - 1;
          const expectedNumberOfRulesAfterRecovering = availablePrebuiltRulesCount;

          deleteFirstRule();

          cy.get(ELASTIC_RULES_BTN).should(
            'have.text',
            `Elastic rules (${expectedNumberOfRulesAfterDeletion})`
          );
          cy.get(ADD_ELASTIC_RULES_BTN).should('have.text', `Add Elastic rules1`);

          // Navigate to the prebuilt rule installation page
          cy.get(ADD_ELASTIC_RULES_BTN).click();

          // Click the "Install all rules" button
          cy.get(INSTALL_ALL_RULES_BUTTON).click();

          // Wait for the rules to be installed
          cy.get(INSTALL_ALL_RULES_BUTTON).should('be.disabled');

          // Navigate back to the rules page
          cy.go('back');

          cy.get(ELASTIC_RULES_BTN).should(
            'have.text',
            `Elastic rules (${expectedNumberOfRulesAfterRecovering})`
          );
        });
      });

      it('Deletes and recovers more than one rule', () => {
        getInstalledPrebuiltRulesCount().then((availablePrebuiltRulesCount) => {
          const rulesToDelete = ['Test rule 1', 'Test rule 2'] as const;
          const expectedNumberOfRulesAfterDeletion = availablePrebuiltRulesCount - 2;
          const expectedNumberOfRulesAfterRecovering = availablePrebuiltRulesCount;

          selectRulesByName(rulesToDelete);
          deleteSelectedRules();

          cy.get(ADD_ELASTIC_RULES_BTN).should(
            'have.text',
            `Add Elastic rules${rulesToDelete.length}`
          );
          cy.get(ELASTIC_RULES_BTN).should(
            'have.text',
            `Elastic rules (${expectedNumberOfRulesAfterDeletion})`
          );

          // Navigate to the prebuilt rule installation page
          cy.get(ADD_ELASTIC_RULES_BTN).click();

          // Click the "Install all rules" button
          cy.get(INSTALL_ALL_RULES_BUTTON).click();

          // Wait for the rules to be installed
          cy.get(INSTALL_ALL_RULES_BUTTON).should('be.disabled');

          // Navigate back to the rules page
          cy.go('back');

          // Check that the rules table contains all rules
          cy.get(ELASTIC_RULES_BTN).should(
            'have.text',
            `Elastic rules (${expectedNumberOfRulesAfterRecovering})`
          );
        });
      });

      it('Allows to delete all rules at once', () => {
        selectAllRules();
        deleteSelectedRules();
        cy.get(RULES_EMPTY_PROMPT).should('be.visible');
      });
    });
  });
});
