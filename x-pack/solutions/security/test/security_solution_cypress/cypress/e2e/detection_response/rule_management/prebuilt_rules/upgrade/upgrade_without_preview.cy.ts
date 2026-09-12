/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getPrebuiltRuleMockOfType } from '@kbn/security-solution-plugin/server/lib/detection_engine/prebuilt_rules/mocks';
import { ROLES } from '@kbn/security-solution-plugin/common/test';
import { IS_SERVERLESS } from '../../../../../env_var_names_constants';
import { waitForPageTitleToBeShown } from '../../../../../tasks/alert_assignments';
import { createRuleAssetSavedObject } from '../../../../../helpers/rules';
import {
  getReviewSingleRuleButtonByRuleId,
  getUpgradeSingleRuleButtonByRuleId,
  NO_RULES_AVAILABLE_FOR_UPGRADE_MESSAGE,
  RULES_MANAGEMENT_TABLE,
  RULES_UPDATES_TAB,
  TAGS_PROPERTY_VALUE_ITEM,
  UPGRADE_ALL_RULES_BUTTON,
  CONFLICTS_MODAL_UPGRADE_RULES_WITH_CONFLICTS,
  UPGRADE_SELECTED_RULES_BUTTON,
  CONFLICTS_MODAL_UPGRADE_CONFLICT_FREE_RULES,
  CONFLICTS_MODAL_CANCEL,
  RULES_UPDATES_TABLE,
  MODIFIED_RULE_BADGE,
} from '../../../../../screens/alerts_detection_rules';
import {
  expectRulesInTable,
  goToRuleDetailsOf,
  selectRulesByName,
} from '../../../../../tasks/alerts_detection_rules';
import {
  deleteAlertsAndRules,
  deletePrebuiltRulesAssets,
} from '../../../../../tasks/api_calls/common';
import { installMockPrebuiltRulesPackage } from '../../../../../tasks/api_calls/prebuilt_rules';
import { setUpRuleUpgrades } from '../../../../../tasks/prebuilt_rules/setup_rule_upgrades';
import { resetRulesTableState } from '../../../../../tasks/common';
import { login } from '../../../../../tasks/login';
import {
  assertRulesNotPresentInRuleUpdatesTable,
  assertRuleUpgradeSuccessToastShown,
  assertUpgradeRequestIsComplete,
  clickRuleUpdatesTab,
  filterPrebuiltRulesUpdateTableByRuleCustomization,
} from '../../../../../tasks/prebuilt_rules';
import {
  visitRulesManagementTable,
  visitRulesUpgradeTable,
} from '../../../../../tasks/rules_management';

describe(
  'Detection rules, Prebuilt Rules Upgrade Without Preview',
  { tags: ['@ess', '@serverless', '@skipInServerlessMKI'] },
  () => {
    before(() => {
      installMockPrebuiltRulesPackage();
    });

    beforeEach(() => {
      resetRulesTableState();
      deletePrebuiltRulesAssets();
      deleteAlertsAndRules();
      login();
    });

    describe('upgrade a single rule', () => {
      const PREBUILT_RULE_ID = 'test-prebuilt-rule';
      const PREBUILT_RULE_ASSET = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID,
        version: 1,
        name: 'Prebuilt rule',
        description: 'Non-customized prebuilt rule',
        tags: ['old-tag-1', 'old-tag-2'],
      });
      const NEW_PREBUILT_RULE_ASSET = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID,
        version: 2,
        name: 'New Prebuilt rule',
        description: 'New Non-customized prebuilt rule',
        tags: ['new-tag-1', 'new-tag-2'],
      });

      it('upgrades a conflict-free prebuilt rule', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET],
          rulePatches: [],
          newRuleAssets: [NEW_PREBUILT_RULE_ASSET],
        });
        visitRulesUpgradeTable();

        // Attempt to upgrade rule
        cy.get(getUpgradeSingleRuleButtonByRuleId(PREBUILT_RULE_ID)).click();
        // Wait for request to complete
        assertUpgradeRequestIsComplete([PREBUILT_RULE_ASSET]);

        assertRuleUpgradeSuccessToastShown([PREBUILT_RULE_ASSET]);
        assertRulesNotPresentInRuleUpdatesTable([PREBUILT_RULE_ASSET]);

        visitRulesManagementTable();
        expectRulesInTable(RULES_MANAGEMENT_TABLE, [NEW_PREBUILT_RULE_ASSET['security-rule'].name]);
        goToRuleDetailsOf(NEW_PREBUILT_RULE_ASSET['security-rule'].name);

        cy.get(TAGS_PROPERTY_VALUE_ITEM).then((items) => {
          const tags = items.map((_, item) => item.textContent).toArray();
          cy.wrap(tags).should('deep.equal', ['new-tag-1', 'new-tag-2']);
        });
      });

      it('displays "Review" button for prebuilt rules with upgrade conflicts', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET],
          rulePatches: [{ rule_id: PREBUILT_RULE_ID, name: 'Customized Prebuilt Rule A' }],
          newRuleAssets: [NEW_PREBUILT_RULE_ASSET],
        });
        visitRulesUpgradeTable();

        expect(cy.get(getReviewSingleRuleButtonByRuleId(PREBUILT_RULE_ID)).should('exist'));
      });
    });

    describe('bulk upgrade', () => {
      const PREBUILT_RULE_ID_A = 'test-prebuilt-rule-a';
      const PREBUILT_RULE_ID_B = 'test-prebuilt-rule-b';
      const PREBUILT_RULE_ID_C = 'test-prebuilt-rule-c';
      const PREBUILT_RULE_ASSET_A = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID_A,
        version: 1,
        name: 'Prebuilt rule A',
        description: 'Non-customized prebuilt rule A',
        tags: ['old-tag-1', 'old-tag-2'],
      });
      const NEW_PREBUILT_RULE_ASSET_A = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID_A,
        version: 2,
        name: 'New Prebuilt rule A',
        description: 'New Non-customized prebuilt rule A',
        tags: ['new-tag-1', 'new-tag-2'],
      });
      const PREBUILT_RULE_ASSET_B = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID_B,
        version: 1,
        name: 'Prebuilt rule B',
        description: 'Non-customized prebuilt rule B',
        tags: ['old-tag-1', 'old-tag-2'],
      });
      const NEW_PREBUILT_RULE_ASSET_B = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID_B,
        version: 2,
        name: 'New Prebuilt rule B',
        description: 'New Non-customized prebuilt rule B',
        tags: ['new-tag-1', 'new-tag-2'],
      });
      const PREBUILT_RULE_ASSET_C = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID_C,
        version: 1,
        name: 'Prebuilt rule C',
        description: 'Non-customized prebuilt rule C',
        tags: ['old-tag-1', 'old-tag-2'],
      });
      const NEW_PREBUILT_RULE_ASSET_C = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID_C,
        version: 2,
        name: 'New Prebuilt rule C',
        description: 'New Non-customized prebuilt rule C',
        tags: ['new-tag-1', 'new-tag-2'],
      });

      it('upgrades all conflict-free prebuilt rules', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B],
          rulePatches: [],
          newRuleAssets: [NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B],
        });
        visitRulesUpgradeTable();

        cy.get(UPGRADE_ALL_RULES_BUTTON).click();
        assertUpgradeRequestIsComplete([NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B]);
        assertRuleUpgradeSuccessToastShown([NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B]);
        assertRulesNotPresentInRuleUpdatesTable([
          PREBUILT_RULE_ASSET_A,
          PREBUILT_RULE_ASSET_B,
          NEW_PREBUILT_RULE_ASSET_A,
          NEW_PREBUILT_RULE_ASSET_B,
        ]);

        cy.get(RULES_UPDATES_TAB).should('not.exist');
        cy.get(NO_RULES_AVAILABLE_FOR_UPGRADE_MESSAGE).should('exist');
      });

      it('upgrades selected conflict-free prebuilt rules', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B],
          rulePatches: [],
          newRuleAssets: [NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B],
        });
        visitRulesUpgradeTable();

        selectRulesByName([
          PREBUILT_RULE_ASSET_A['security-rule'].name,
          PREBUILT_RULE_ASSET_B['security-rule'].name,
        ]);

        cy.get(UPGRADE_SELECTED_RULES_BUTTON).click();

        assertUpgradeRequestIsComplete([NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B]);
        assertRuleUpgradeSuccessToastShown([NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B]);
        assertRulesNotPresentInRuleUpdatesTable([
          PREBUILT_RULE_ASSET_A,
          PREBUILT_RULE_ASSET_B,
          NEW_PREBUILT_RULE_ASSET_A,
          NEW_PREBUILT_RULE_ASSET_B,
        ]);
      });

      it('upgrades all prebuilt rules with auto-resolved conflicts', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B],
          rulePatches: [
            { rule_id: PREBUILT_RULE_ID_A, tags: ['custom-tag-1'] },
            { rule_id: PREBUILT_RULE_ID_B, tags: ['custom-tag-2'] },
          ],
          newRuleAssets: [NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B],
        });
        visitRulesUpgradeTable();

        cy.get(UPGRADE_ALL_RULES_BUTTON).click();
        cy.get(CONFLICTS_MODAL_UPGRADE_RULES_WITH_CONFLICTS).click();

        assertUpgradeRequestIsComplete([NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B]);
        assertRuleUpgradeSuccessToastShown([NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B]);
        assertRulesNotPresentInRuleUpdatesTable([
          PREBUILT_RULE_ASSET_A,
          PREBUILT_RULE_ASSET_B,
          NEW_PREBUILT_RULE_ASSET_A,
          NEW_PREBUILT_RULE_ASSET_B,
        ]);

        cy.get(RULES_UPDATES_TAB).should('not.exist');
        cy.get(NO_RULES_AVAILABLE_FOR_UPGRADE_MESSAGE).should('exist');
      });

      it('upgrades selected conflict-free prebuilt rules with auto-resolved conflicts', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B],
          rulePatches: [
            { rule_id: PREBUILT_RULE_ID_A, tags: ['custom-tag-1'] },
            { rule_id: PREBUILT_RULE_ID_B, tags: ['custom-tag-2'] },
          ],
          newRuleAssets: [NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B],
        });
        visitRulesUpgradeTable();

        selectRulesByName([
          PREBUILT_RULE_ASSET_A['security-rule'].name,
          PREBUILT_RULE_ASSET_B['security-rule'].name,
        ]);

        cy.get(UPGRADE_SELECTED_RULES_BUTTON).click();
        cy.get(CONFLICTS_MODAL_UPGRADE_RULES_WITH_CONFLICTS).click();

        assertUpgradeRequestIsComplete([PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B]);
        assertRuleUpgradeSuccessToastShown([PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B]);
        assertRulesNotPresentInRuleUpdatesTable([
          PREBUILT_RULE_ASSET_A,
          PREBUILT_RULE_ASSET_B,
          NEW_PREBUILT_RULE_ASSET_A,
          NEW_PREBUILT_RULE_ASSET_B,
        ]);
      });

      it('unable to upgrade only prebuilt rules with non-solvable conflicts', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B],
          rulePatches: [
            { rule_id: PREBUILT_RULE_ID_A, name: 'Customized prebuilt rule A' },
            { rule_id: PREBUILT_RULE_ID_B, name: 'Customized prebuilt rule B' },
          ],
          newRuleAssets: [NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B],
        });
        visitRulesUpgradeTable();

        cy.get(UPGRADE_ALL_RULES_BUTTON).click();

        cy.get(CONFLICTS_MODAL_UPGRADE_CONFLICT_FREE_RULES).should('not.exist');
        cy.get(CONFLICTS_MODAL_UPGRADE_RULES_WITH_CONFLICTS).should('not.exist');
        cy.get(CONFLICTS_MODAL_CANCEL).should('be.visible');
      });

      it('upgrades all conflict-free and solvable conflict prebuilt rules skipping prebuilt rules with non-solvable conflicts', () => {
        // Prebuilt rule A - conflict-free
        // Prebuilt rule B - solvable conflict
        // Prebuilt rule C - non-solvable conflict
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B, PREBUILT_RULE_ASSET_C],
          rulePatches: [
            { rule_id: PREBUILT_RULE_ID_B, tags: ['custom-tag'] },
            { rule_id: PREBUILT_RULE_ID_C, name: 'Customized prebuilt rule C' },
          ],
          newRuleAssets: [
            NEW_PREBUILT_RULE_ASSET_A,
            NEW_PREBUILT_RULE_ASSET_B,
            NEW_PREBUILT_RULE_ASSET_C,
          ],
        });
        visitRulesUpgradeTable();

        selectRulesByName([
          PREBUILT_RULE_ASSET_A['security-rule'].name,
          PREBUILT_RULE_ASSET_B['security-rule'].name,
          'Customized prebuilt rule C',
        ]);

        cy.get(UPGRADE_SELECTED_RULES_BUTTON).click();
        cy.get(CONFLICTS_MODAL_UPGRADE_RULES_WITH_CONFLICTS).click();

        assertUpgradeRequestIsComplete([PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B]);
        assertRuleUpgradeSuccessToastShown([PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B]);
        assertRulesNotPresentInRuleUpdatesTable([
          PREBUILT_RULE_ASSET_A,
          PREBUILT_RULE_ASSET_B,
          NEW_PREBUILT_RULE_ASSET_A,
          NEW_PREBUILT_RULE_ASSET_B,
        ]);
        expectRulesInTable(RULES_UPDATES_TABLE, ['Customized prebuilt rule C']);
      });

      it('upgrades selected conflict-free and solvable conflict prebuilt rules skipping prebuilt rules with non-solvable conflicts', () => {
        // Prebuilt rule A - conflict-free
        // Prebuilt rule B - solvable conflict
        // Prebuilt rule C - non-solvable conflict
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B, PREBUILT_RULE_ASSET_C],
          rulePatches: [
            { rule_id: PREBUILT_RULE_ID_B, tags: ['custom-tag'] },
            { rule_id: PREBUILT_RULE_ID_C, name: 'Customized prebuilt rule C' },
          ],
          newRuleAssets: [
            NEW_PREBUILT_RULE_ASSET_A,
            NEW_PREBUILT_RULE_ASSET_B,
            NEW_PREBUILT_RULE_ASSET_C,
          ],
        });
        visitRulesUpgradeTable();

        selectRulesByName([
          PREBUILT_RULE_ASSET_A['security-rule'].name,
          PREBUILT_RULE_ASSET_B['security-rule'].name,
          'Customized prebuilt rule C',
        ]);

        cy.get(UPGRADE_SELECTED_RULES_BUTTON).click();
        cy.get(CONFLICTS_MODAL_UPGRADE_RULES_WITH_CONFLICTS).click();

        assertUpgradeRequestIsComplete([PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B]);
        assertRuleUpgradeSuccessToastShown([PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B]);
        assertRulesNotPresentInRuleUpdatesTable([
          PREBUILT_RULE_ASSET_A,
          PREBUILT_RULE_ASSET_B,
          NEW_PREBUILT_RULE_ASSET_A,
          NEW_PREBUILT_RULE_ASSET_B,
        ]);
        expectRulesInTable(RULES_UPDATES_TABLE, ['Customized prebuilt rule C']);
      });

      it('disables "Update selected rules" button when all selected prebuilt rules have conflicts', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B],
          rulePatches: [
            { rule_id: PREBUILT_RULE_ID_A, name: 'Customized Prebuilt Rule A' },
            { rule_id: PREBUILT_RULE_ID_B, name: 'Customized Prebuilt Rule B' },
          ],
          newRuleAssets: [NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B],
        });

        visitRulesManagementTable();
        clickRuleUpdatesTab();

        selectRulesByName(['Customized Prebuilt Rule A', 'Customized Prebuilt Rule B']);
        cy.get(UPGRADE_SELECTED_RULES_BUTTON).should('be.disabled');
      });
    });

    describe('type change upgrade', () => {
      const PREBUILT_RULE_ID_A = 'test-prebuilt-rule-a';
      const PREBUILT_RULE_ID_B = 'test-prebuilt-rule-b';
      const PREBUILT_RULE_ASSET_A = createRuleAssetSavedObject({
        ...getPrebuiltRuleMockOfType('query'),
        rule_id: PREBUILT_RULE_ID_A,
        version: 1,
        name: 'Custom Query Non-Customized Prebuilt Rule A',
      });
      const NEW_PREBUILT_RULE_ASSET_A = createRuleAssetSavedObject({
        ...getPrebuiltRuleMockOfType('esql'),
        rule_id: PREBUILT_RULE_ID_A,
        version: 2,
        name: 'New ES|QL Non-Customized Prebuilt Rule A',
      });
      const PREBUILT_RULE_ASSET_B = createRuleAssetSavedObject({
        ...getPrebuiltRuleMockOfType('query'),
        rule_id: PREBUILT_RULE_ID_B,
        version: 1,
        name: 'Custom Query Prebuilt Rule B',
      });
      const NEW_PREBUILT_RULE_ASSET_B = createRuleAssetSavedObject({
        ...getPrebuiltRuleMockOfType('esql'),
        rule_id: PREBUILT_RULE_ID_B,
        version: 2,
        name: 'New ES|QL Prebuilt Rule B',
      });

      it('disables individual upgrade buttons', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B],
          rulePatches: [
            {
              rule_id: PREBUILT_RULE_ID_B,
              tags: ['customized'],
            },
          ],
          newRuleAssets: [NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B],
        });
        visitRulesUpgradeTable();

        // All buttons should be displayed as review buttons because rule type changes are considered conflicts
        for (const ruleId of [PREBUILT_RULE_ID_A, PREBUILT_RULE_ID_B]) {
          expect(cy.get(getReviewSingleRuleButtonByRuleId(ruleId)).should('exist'));
        }
      });

      it('upgrades selected non-customized type-changed rules, skipping customized type-changed rules', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B],
          rulePatches: [
            {
              rule_id: PREBUILT_RULE_ID_B,
              tags: ['customized'],
            },
          ],
          newRuleAssets: [NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B],
        });
        visitRulesUpgradeTable();

        selectRulesByName([
          'Custom Query Non-Customized Prebuilt Rule A',
          'Custom Query Prebuilt Rule B',
        ]);

        // Rule A's type change is a solvable conflict (the rule is not customized),
        // so the button must be enabled and the upgrade goes through the conflicts modal.
        cy.get(UPGRADE_SELECTED_RULES_BUTTON).click();
        cy.get(CONFLICTS_MODAL_UPGRADE_RULES_WITH_CONFLICTS).click();

        assertUpgradeRequestIsComplete([PREBUILT_RULE_ASSET_A]);
        assertRuleUpgradeSuccessToastShown([PREBUILT_RULE_ASSET_A]);
        assertRulesNotPresentInRuleUpdatesTable([PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_A]);
        expectRulesInTable(RULES_UPDATES_TABLE, ['Custom Query Prebuilt Rule B']);
      });

      it('disables "Update selected rules" button when only customized type-changed rules are selected', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B],
          rulePatches: [
            {
              rule_id: PREBUILT_RULE_ID_B,
              tags: ['customized'],
            },
          ],
          newRuleAssets: [NEW_PREBUILT_RULE_ASSET_A, NEW_PREBUILT_RULE_ASSET_B],
        });
        visitRulesUpgradeTable();

        selectRulesByName(['Custom Query Prebuilt Rule B']);
        cy.get(UPGRADE_SELECTED_RULES_BUTTON).should('be.disabled');
      });
    });

    describe('rules upgrade table filtering', () => {
      const PREBUILT_RULE_ID_A = 'test-prebuilt-rule-a';
      const PREBUILT_RULE_ID_B = 'test-prebuilt-rule-b';
      const PREBUILT_RULE_ID_C = 'test-prebuilt-rule-c';
      const PREBUILT_RULE_ASSET_A = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID_A,
        version: 1,
        name: 'Prebuilt rule A',
        description: 'Non-customized prebuilt rule A',
        tags: ['old-tag-1', 'old-tag-2'],
      });
      const NEW_PREBUILT_RULE_ASSET_A = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID_A,
        version: 2,
        name: 'New Prebuilt rule A',
        description: 'New Non-customized prebuilt rule A',
        tags: ['new-tag-1', 'new-tag-2'],
      });
      const PREBUILT_RULE_ASSET_B = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID_B,
        version: 1,
        name: 'Prebuilt rule B',
        description: 'Non-customized prebuilt rule B',
        tags: ['old-tag-1', 'old-tag-2'],
      });
      const NEW_PREBUILT_RULE_ASSET_B = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID_B,
        version: 2,
        name: 'New Prebuilt rule B',
        description: 'New Non-customized prebuilt rule B',
        tags: ['new-tag-1', 'new-tag-2'],
      });
      const PREBUILT_RULE_ASSET_C = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID_C,
        version: 1,
        name: 'Prebuilt rule C',
        description: 'Non-customized prebuilt rule C',
        tags: ['old-tag-1', 'old-tag-2'],
      });
      const NEW_PREBUILT_RULE_ASSET_C = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID_C,
        version: 2,
        name: 'New Prebuilt rule C',
        description: 'New Non-customized prebuilt rule C',
        tags: ['new-tag-1', 'new-tag-2'],
      });

      it('filters by customized prebuilt rules', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B, PREBUILT_RULE_ASSET_C],
          rulePatches: [{ rule_id: PREBUILT_RULE_ID_A, name: 'Customized Prebuilt Rule A' }],
          newRuleAssets: [
            NEW_PREBUILT_RULE_ASSET_A,
            NEW_PREBUILT_RULE_ASSET_B,
            NEW_PREBUILT_RULE_ASSET_C,
          ],
        });

        visitRulesManagementTable();
        clickRuleUpdatesTab();

        // Filter table to show modified rules only
        filterPrebuiltRulesUpdateTableByRuleCustomization('Modified');
        cy.get(MODIFIED_RULE_BADGE).should('exist');

        // Verify only rules with customized rule sources are displayed
        expectRulesInTable(RULES_UPDATES_TABLE, ['Customized Prebuilt Rule A']);
        assertRulesNotPresentInRuleUpdatesTable([PREBUILT_RULE_ASSET_B]);
      });

      it('filters by non-customized prebuilt rules', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET_A, PREBUILT_RULE_ASSET_B, PREBUILT_RULE_ASSET_C],
          rulePatches: [{ rule_id: PREBUILT_RULE_ID_A, name: 'Customized Prebuilt Rule A' }],
          newRuleAssets: [
            NEW_PREBUILT_RULE_ASSET_A,
            NEW_PREBUILT_RULE_ASSET_B,
            NEW_PREBUILT_RULE_ASSET_C,
          ],
        });

        visitRulesManagementTable();
        clickRuleUpdatesTab();

        // Filter table to show unmodified rules only
        filterPrebuiltRulesUpdateTableByRuleCustomization('Unmodified');
        cy.get(MODIFIED_RULE_BADGE).should('not.exist');

        // Verify only rules with non-customized rule sources are displayed
        expectRulesInTable(RULES_UPDATES_TABLE, [
          PREBUILT_RULE_ASSET_B['security-rule'].name,
          PREBUILT_RULE_ASSET_C['security-rule'].name,
        ]);
        cy.get('Customized Prebuilt Rule A').should('not.exist');
      });
    });

    describe('RBAC restrictions: readonly user', () => {
      const PREBUILT_RULE_ID = 'test-prebuilt-rule';
      const PREBUILT_RULE_ASSET = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID,
        version: 1,
        name: 'Prebuilt rule A',
      });
      const NEW_PREBUILT_RULE_ASSET = createRuleAssetSavedObject({
        rule_id: PREBUILT_RULE_ID,
        version: 2,
        name: 'New Prebuilt rule A',
      });

      it('unable to upgrade prebuilt rules', () => {
        setUpRuleUpgrades({
          currentRuleAssets: [PREBUILT_RULE_ASSET],
          rulePatches: [],
          newRuleAssets: [NEW_PREBUILT_RULE_ASSET],
        });
        const isServerless = Cypress.env(IS_SERVERLESS);
        login(isServerless ? ROLES.t1_analyst : ROLES.reader);
        visitRulesUpgradeTable();
        waitForPageTitleToBeShown();

        cy.get(RULES_UPDATES_TAB).should('not.exist');
      });
    });
  }
);
