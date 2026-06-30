/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import path from 'path';

import {
  deleteAlertsAndRules,
  deletePrebuiltRulesAssets,
} from '../../../../../tasks/api_calls/common';
import { getCustomQueryRuleParams } from '../../../../../objects/rule';
import { TOASTER_BODY, TOASTER } from '../../../../../screens/alerts_detection_rules';
import {
  selectAllRules,
  waitForRuleExecution,
  exportRule,
  importRules,
  expectManagementTableRules,
} from '../../../../../tasks/alerts_detection_rules';
import { bulkExportRules } from '../../../../../tasks/rules_bulk_actions';
import {
  createExceptionList,
  deleteExceptionList,
} from '../../../../../tasks/api_calls/exceptions';
import { getExceptionList } from '../../../../../objects/exception';
import { createRule } from '../../../../../tasks/api_calls/rules';
import { exportRuleFromDetailsPage, visitRuleDetailsPage } from '../../../../../tasks/rule_details';
import { resetRulesTableState } from '../../../../../tasks/common';
import { login } from '../../../../../tasks/login';
import { visit } from '../../../../../tasks/navigation';
import { RULES_MANAGEMENT_URL } from '../../../../../urls/rules_management';
import {
  createAndInstallMockedPrebuiltRules,
  getInstalledPrebuiltRulesCount,
  installMockPrebuiltRulesPackage,
  preventPrebuiltRulesPackageInstallation,
} from '../../../../../tasks/api_calls/prebuilt_rules';
import { createRuleAssetSavedObject } from '../../../../../helpers/rules';

const EXPORTED_RULES_FILENAME = 'rules_export.ndjson';
const exceptionList = getExceptionList();

const prebuiltRules = Array.from(Array(7)).map((_, i) => {
  return createRuleAssetSavedObject({
    name: `Test rule ${i + 1}`,
    rule_id: `rule_${i + 1}`,
  });
});

describe('Export rules', { tags: ['@ess', '@serverless', '@skipInServerlessMKI'] }, () => {
  before(() => {
    installMockPrebuiltRulesPackage();
  });

  const downloadsFolder = Cypress.config('downloadsFolder');
  const RULE_NAME = 'Rule to export';

  beforeEach(() => {
    preventPrebuiltRulesPackageInstallation();

    login();
    // Make sure persisted rules table state is cleared
    resetRulesTableState();
    deletePrebuiltRulesAssets();
    deleteAlertsAndRules();
    // Rules get exported via _bulk_action endpoint
    cy.intercept('POST', '/api/detection_engine/rules/_bulk_action').as('bulk_action');
    // Prevent installation of whole prebuilt rules package, use mock prebuilt rules instead
    preventPrebuiltRulesPackageInstallation();
    visit(RULES_MANAGEMENT_URL);
    createRule(getCustomQueryRuleParams({ name: RULE_NAME, enabled: false })).as('ruleResponse');
  });

  it('exports a custom rule from the rule management table', function () {
    exportRule('Rule to export');
    cy.wait('@bulk_action').then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      cy.get(TOASTER_BODY).should('have.text', 'Successfully exported 1 of 1 rule.');
    });
  });

  it('exports a custom rule from the rule details page', function () {
    visitRuleDetailsPage(this.ruleResponse.body.id);

    exportRuleFromDetailsPage();

    cy.wait('@bulk_action').then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      cy.get(TOASTER_BODY).should('have.text', 'Successfully exported 1 of 1 rule.');
    });
  });

  it('creates an importable file from executed rule', () => {
    // Rule needs to be enabled to make sure it has been executed so rule's SO contains runtime fields like `execution_summary`
    createRule(getCustomQueryRuleParams({ name: 'Enabled rule to export', enabled: true }));
    waitForRuleExecution('Enabled rule to export');

    exportRule('Enabled rule to export');

    cy.get(TOASTER).should('have.text', 'Rules exported');
    cy.get(TOASTER_BODY).should('have.text', 'Successfully exported 1 of 1 rule.');

    deleteAlertsAndRules();
    importRules(path.join(downloadsFolder, EXPORTED_RULES_FILENAME));

    cy.get(TOASTER).should('have.text', 'Successfully imported 1 rule');
    expectManagementTableRules(['Enabled rule to export']);
  });

  // https://github.com/elastic/kibana/issues/179960
  it('exports all rules', { tags: ['@skipInServerless'] }, function () {
    const expectedNumberCustomRulesToBeExported = 1;

    createAndInstallMockedPrebuiltRules(prebuiltRules);

    selectAllRules();
    bulkExportRules();

    getInstalledPrebuiltRulesCount().then((availablePrebuiltRulesCount) => {
      const totalNumberOfRules =
        expectedNumberCustomRulesToBeExported + availablePrebuiltRulesCount;
      cy.get(TOASTER_BODY).should(
        'contain',
        `Successfully exported ${totalNumberOfRules} of ${totalNumberOfRules} rules.`
      );
    });
  });

  context('rules with exceptions', () => {
    beforeEach(() => {
      deleteExceptionList(exceptionList.list_id, exceptionList.namespace_type);
      // create rule with exceptions
      createExceptionList(exceptionList, exceptionList.list_id).then((response) =>
        createRule(
          getCustomQueryRuleParams({
            name: 'rule with exceptions',
            exceptions_list: [
              {
                id: response.body.id,
                list_id: exceptionList.list_id,
                type: exceptionList.type,
                namespace_type: exceptionList.namespace_type,
              },
            ],
            rule_id: '2',
            enabled: false,
          })
        )
      );
    });

    // https://github.com/elastic/kibana/issues/180029
    it('exports custom rules with exceptions', { tags: ['@skipInServerlessMKI'] }, function () {
      // one rule with exception, one without it
      const expectedNumberCustomRulesToBeExported = prebuiltRules.length + 2; // prebuilt rules + a custom rule + a rule with exceptions

      createAndInstallMockedPrebuiltRules(prebuiltRules);
      cy.reload();
      selectAllRules();
      bulkExportRules();

      cy.get(TOASTER_BODY).should(
        'contain',
        `Successfully exported ${expectedNumberCustomRulesToBeExported}`
      );
    });
  });
});
