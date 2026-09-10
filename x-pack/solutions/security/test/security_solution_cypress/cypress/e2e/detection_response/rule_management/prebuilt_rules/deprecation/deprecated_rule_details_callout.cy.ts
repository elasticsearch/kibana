/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getCustomQueryRuleParams } from '../../../../../objects/rule';
import {
  createDeprecatedRuleAssetSavedObject,
  createRuleAssetSavedObject,
} from '../../../../../helpers/rules';
import {
  createAndInstallMockedPrebuiltRules,
  createDeprecatedRuleAssets,
  installMockPrebuiltRulesPackage,
} from '../../../../../tasks/api_calls/prebuilt_rules';
import { createRule } from '../../../../../tasks/api_calls/rules';
import {
  deleteAlertsAndRules,
  deletePrebuiltRulesAssets,
} from '../../../../../tasks/api_calls/common';
import { login } from '../../../../../tasks/login';
import { visitRuleDetailsPage } from '../../../../../tasks/rule_details';
import {
  CONFIRM_DELETE_RULE_BTN,
  DUPLICATE_WITHOUT_EXCEPTIONS_OPTION,
  CONFIRM_DUPLICATE_RULE,
} from '../../../../../screens/alerts_detection_rules';
import { assertSuccessToast } from '../../../../../screens/common/toast';
import { RULES_MANAGEMENT_URL } from '../../../../../urls/rules_management';
import {
  DEPRECATED_RULE_DETAILS_CALLOUT,
  DEPRECATED_RULE_DELETE_BUTTON,
  DEPRECATED_RULE_DUPLICATE_AND_DELETE_BUTTON,
  DEPRECATED_RULE_REASON,
} from '../../../../../screens/deprecated_rules';

const ACTIVE_RULE_ASSET = createRuleAssetSavedObject({
  name: 'My prebuilt rule',
  rule_id: 'my-prebuilt-rule',
  version: 1,
});

const DEPRECATED_ASSET = createDeprecatedRuleAssetSavedObject({
  rule_id: 'my-prebuilt-rule',
  version: 2,
  name: 'My prebuilt rule',
});

const DEPRECATED_ASSET_WITH_REASON = createDeprecatedRuleAssetSavedObject({
  rule_id: 'my-prebuilt-rule-with-reason',
  version: 2,
  name: 'My prebuilt rule with reason',
  deprecated_reason: 'Replaced by new rule XYZ',
});

const ACTIVE_RULE_ASSET_WITH_REASON = createRuleAssetSavedObject({
  name: 'My prebuilt rule with reason',
  rule_id: 'my-prebuilt-rule-with-reason',
  version: 1,
});

const NON_DEPRECATED_RULE_ASSET = createRuleAssetSavedObject({
  name: 'Non-deprecated prebuilt rule',
  rule_id: 'non-deprecated-rule',
  version: 1,
});

describe(
  'Deprecated rules - Rule Details page callout',
  {
    tags: ['@ess', '@skipInServerlessMKI'],
  },
  () => {
    before(() => {
      installMockPrebuiltRulesPackage();
    });

    beforeEach(() => {
      login();
      deleteAlertsAndRules();
      deletePrebuiltRulesAssets();
    });

    describe('Callout visibility', () => {
      describe('deprecated prebuilt rule', () => {
        let ruleId: string;

        beforeEach(() => {
          createAndInstallMockedPrebuiltRules([ACTIVE_RULE_ASSET]).then(({ body }) => {
            ruleId = body.results.created[0].id;
            createDeprecatedRuleAssets({ rules: [DEPRECATED_ASSET] });
          });
        });

        it('shows the deprecation callout with action buttons', () => {
          visitRuleDetailsPage(ruleId);
          cy.get(DEPRECATED_RULE_DETAILS_CALLOUT).should('be.visible');
          cy.get(DEPRECATED_RULE_DELETE_BUTTON).should('be.visible');
          cy.get(DEPRECATED_RULE_DUPLICATE_AND_DELETE_BUTTON).should('be.visible');
        });
      });

      describe('deprecated prebuilt rule with a deprecation reason', () => {
        let ruleId: string;

        beforeEach(() => {
          createAndInstallMockedPrebuiltRules([ACTIVE_RULE_ASSET_WITH_REASON]).then(({ body }) => {
            ruleId = body.results.created[0].id;
            createDeprecatedRuleAssets({ rules: [DEPRECATED_ASSET_WITH_REASON] });
          });
        });

        it('displays the deprecation reason', () => {
          visitRuleDetailsPage(ruleId);
          cy.get(DEPRECATED_RULE_REASON).should('be.visible');
          cy.get(DEPRECATED_RULE_REASON).should('contain.text', 'Replaced by new rule XYZ');
        });
      });

      describe('non-deprecated prebuilt rule', () => {
        let ruleId: string;

        beforeEach(() => {
          createAndInstallMockedPrebuiltRules([NON_DEPRECATED_RULE_ASSET]).then(({ body }) => {
            ruleId = body.results.created[0].id;
          });
        });

        it('does not show the callout', () => {
          visitRuleDetailsPage(ruleId);
          cy.get(DEPRECATED_RULE_DETAILS_CALLOUT).should('not.exist');
        });
      });

      describe('custom rule', () => {
        let ruleId: string;

        beforeEach(() => {
          createRule(
            getCustomQueryRuleParams({ rule_id: 'custom-rule', name: 'My custom rule' })
          ).then(({ body }) => {
            ruleId = body.id;
          });
        });

        it('does not show the callout', () => {
          visitRuleDetailsPage(ruleId);
          cy.get(DEPRECATED_RULE_DETAILS_CALLOUT).should('not.exist');
        });
      });
    });

    describe('Delete deprecated rule', () => {
      let ruleId: string;

      beforeEach(() => {
        createAndInstallMockedPrebuiltRules([ACTIVE_RULE_ASSET]).then(({ body }) => {
          ruleId = body.results.created[0].id;
          createDeprecatedRuleAssets({ rules: [DEPRECATED_ASSET] });
        });
      });

      it('deletes a deprecated rule from its details page and navigates back to the rules list', () => {
        visitRuleDetailsPage(ruleId);
        cy.get(DEPRECATED_RULE_DELETE_BUTTON).click();
        cy.get(CONFIRM_DELETE_RULE_BTN).click();

        assertSuccessToast('Rules deleted', 'Successfully deleted 1 rule');
        cy.url().should('include', RULES_MANAGEMENT_URL);
      });
    });

    describe('Duplicate and delete deprecated rule', () => {
      let ruleId: string;

      beforeEach(() => {
        createAndInstallMockedPrebuiltRules([ACTIVE_RULE_ASSET]).then(({ body }) => {
          ruleId = body.results.created[0].id;
          createDeprecatedRuleAssets({ rules: [DEPRECATED_ASSET] });
        });
      });

      it('duplicates a deprecated rule as a custom rule and deletes the original', () => {
        visitRuleDetailsPage(ruleId);
        cy.get(DEPRECATED_RULE_DETAILS_CALLOUT).should('be.visible');

        cy.location('pathname').then((originalPath) => {
          cy.get(DEPRECATED_RULE_DUPLICATE_AND_DELETE_BUTTON).click();

          cy.get(DUPLICATE_WITHOUT_EXCEPTIONS_OPTION).click();
          cy.get(CONFIRM_DUPLICATE_RULE).click();

          assertSuccessToast('Rules duplicated', 'Successfully duplicated 1 rule');

          cy.location('pathname').should('not.eq', originalPath);
          cy.location('pathname').should('match', /\/rules\/id\//);
        });
      });
    });
  }
);
