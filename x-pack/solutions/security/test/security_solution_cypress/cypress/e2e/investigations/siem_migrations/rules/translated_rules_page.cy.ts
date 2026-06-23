/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  RULE_MIGRATION_PROGRESS_BAR,
  RULE_MIGRATION_PROGRESS_BAR_TEXT,
  TRANSLATED_RULE_EDIT_BTN,
  TRANSLATED_RULE_QUERY_VIEWER,
  TRANSLATED_RULE_RESULT_BADGE,
  TRANSLATED_RULES_RESULT_TABLE,
} from '../../../../screens/siem_migrations';
import { deleteConnectors } from '../../../../tasks/api_calls/common';
import { suppressGlobalAnnouncements } from '../../../../tasks/api_calls/suppress_global_announcements';
import { createBedrockConnector } from '../../../../tasks/api_calls/connectors';
import { visit } from '../../../../tasks/navigation';
import {
  editTranslatedRuleByRow,
  saveUpdatedTranslatedRuleQuery,
  selectMigrationConnector,
  updateTranslatedRuleQuery,
  navigateToTranslatedRulesPage,
  openReprocessDialog,
  reprocessWithoutPrebuiltRulesMatching,
} from '../../../../tasks/siem_migrations';
import { GET_STARTED_URL } from '../../../../urls/navigation';
import { role } from '../common/role';

// TODO: https://github.com/elastic/kibana/issues/228940 remove @skipInServerlessMKI tag when privileges issue is fixed
describe(
  'Rule Migrations - Translated Rules Page',
  {
    tags: ['@ess', '@serverless', '@skipInServerlessMKI'],
  },
  () => {
    before(() => {
      role.setup();
    });

    after(() => {
      role.teardown();
    });

    beforeEach(() => {
      deleteConnectors();
      cy.task('esArchiverLoad', {
        archiveName: 'siem_migrations/rules',
      });

      cy.task('esArchiverLoad', {
        archiveName: 'siem_migrations/rule_migrations',
      });

      createBedrockConnector();

      role.login();
      suppressGlobalAnnouncements();
      visit(`${GET_STARTED_URL}/siem_migrations`);
      selectMigrationConnector();
      navigateToTranslatedRulesPage(true);
    });

    afterEach(() => {
      cy.task('esArchiverUnload', {
        archiveName: 'siem_migrations/rules',
      });

      cy.task('esArchiverUnload', {
        archiveName: 'siem_migrations/rule_migrations',
      });
    });

    it('should be able to see the result of the completed migration', () => {
      cy.get(TRANSLATED_RULES_RESULT_TABLE.ROWS).should('have.length', 6);
      cy.get(TRANSLATED_RULES_RESULT_TABLE.STATUS('partial')).should('have.length', 4);
      cy.get(TRANSLATED_RULES_RESULT_TABLE.STATUS('full')).should('have.length', 1);
      cy.get(TRANSLATED_RULES_RESULT_TABLE.STATUS('failed')).should('have.length', 1);
    });

    it('should be able to edit a rule with partial translation', () => {
      cy.get(TRANSLATED_RULES_RESULT_TABLE.TABLE).should('be.visible');

      editTranslatedRuleByRow(1);
      const newESQLQuery = 'FROM auditbeat-* metadata _id, _version, _index';
      updateTranslatedRuleQuery(newESQLQuery);
      saveUpdatedTranslatedRuleQuery();

      cy.get(TRANSLATED_RULE_EDIT_BTN).should('be.visible');
      cy.get(TRANSLATED_RULE_QUERY_VIEWER).should('contain.text', newESQLQuery);
      cy.get(TRANSLATED_RULE_RESULT_BADGE).should('have.text', 'Translated');
    });

    it('should be able to reprocess a failed Rule', () => {
      cy.intercept({
        url: '**/start',
      }).as('reprocessFailedRules');
      openReprocessDialog();
      reprocessWithoutPrebuiltRulesMatching();
      cy.wait('@reprocessFailedRules')
        .its('request.body.settings')
        .should('have.property', 'skip_prebuilt_rules_matching', true);
      cy.get(RULE_MIGRATION_PROGRESS_BAR).should('be.visible');
      cy.get(RULE_MIGRATION_PROGRESS_BAR_TEXT).should('contain.text', '83%');
    });
  }
);
