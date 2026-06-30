/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getCustomQueryRuleParams } from '../../../objects/rule';
import { createRule, waitForRulesToFinishExecution } from '../../../tasks/api_calls/rules';
import { deleteAlertsAndRules } from '../../../tasks/api_calls/common';
import { createIndex, deleteIndex, createDocument } from '../../../tasks/api_calls/elasticsearch';
import { login } from '../../../tasks/login';
import { visit } from '../../../tasks/navigation';
import { RULES_MONITORING_URL } from '../../../urls/rules_management';
import { interceptGetRulesWithGaps } from '../../../tasks/api_calls/gaps';
import {
  RULE_GAPS_OVERVIEW_PANEL,
  RULE_MONITORING_EXPAND_BUTTON,
  LAST_RESPONSE_SUMMARY_CHART,
  LAST_RESPONSE_SUMMARY_TABLE,
  RULE_GAP_SUMMARY_CHART,
  RULE_GAP_SUMMARY_TABLE,
} from '../../../screens/rule_gaps';

const TEST_INDEX = 'test_monitoring_panel_index';

describe(
  'Rules Monitoring Overview Panel',
  { tags: ['@ess', '@serverless', '@skipInServerlessMKI'] },
  () => {
    before(() => {
      login();
      deleteAlertsAndRules();
      deleteIndex(TEST_INDEX);
      createIndex(TEST_INDEX, { '@timestamp': { type: 'date' } });
      createDocument(TEST_INDEX, {});

      // Succeeded: valid index with data
      createRule(
        getCustomQueryRuleParams({
          rule_id: 'successful-rule',
          index: [TEST_INDEX],
          enabled: true,
        })
      );

      // Warning: non-existent index
      createRule(
        getCustomQueryRuleParams({
          rule_id: 'warning-rule',
          index: ['non_existent_index'],
          enabled: true,
        })
      );

      // Failed: malformed query
      createRule(
        getCustomQueryRuleParams({
          rule_id: 'failed-rule',
          index: [TEST_INDEX],
          query: 'host.name: "*',
          enabled: true,
        })
      );

      // No response: disabled rule (never executes)
      createRule(
        getCustomQueryRuleParams({
          rule_id: 'no-response-rule',
          enabled: false,
        })
      );

      waitForRulesToFinishExecution(['successful-rule', 'warning-rule', 'failed-rule'], new Date());
    });

    after(() => {
      deleteIndex(TEST_INDEX);
    });

    beforeEach(() => {
      login();
      interceptGetRulesWithGaps();
      visit(RULES_MONITORING_URL);
    });

    it('displays the monitoring overview panel and allows expanding to view charts and tables', () => {
      // Panel should be visible and expanded by default
      cy.get(RULE_GAPS_OVERVIEW_PANEL).should('be.visible');
      cy.get(RULE_MONITORING_EXPAND_BUTTON).should('have.attr', 'aria-expanded', 'true');
      cy.get(LAST_RESPONSE_SUMMARY_CHART).should('exist');
      cy.get(RULE_GAP_SUMMARY_CHART).should('exist');

      // collapse the panel by clicking the title button
      cy.get(RULE_MONITORING_EXPAND_BUTTON).click();
      cy.get(RULE_MONITORING_EXPAND_BUTTON).should('have.attr', 'aria-expanded', 'false');
      cy.get(LAST_RESPONSE_SUMMARY_CHART).should('not.exist');
      cy.get(RULE_GAP_SUMMARY_CHART).should('not.exist');

      // expand the panel by clicking the title button
      cy.get(RULE_MONITORING_EXPAND_BUTTON).click();

      // Last response summary should display with real execution data
      cy.get(LAST_RESPONSE_SUMMARY_CHART).should('be.visible');
      cy.get(LAST_RESPONSE_SUMMARY_CHART).contains('Last response summary');
      cy.get(LAST_RESPONSE_SUMMARY_TABLE).should('be.visible');
      cy.get(LAST_RESPONSE_SUMMARY_TABLE).contains('Succeeded');
      cy.get(LAST_RESPONSE_SUMMARY_TABLE).contains('Warning');
      cy.get(LAST_RESPONSE_SUMMARY_TABLE).contains('Failed');
      cy.get(LAST_RESPONSE_SUMMARY_TABLE).contains('No response');

      // Rule gap summary should display with mocked gaps data
      cy.get(RULE_GAP_SUMMARY_CHART).should('be.visible');
      cy.get(RULE_GAP_SUMMARY_CHART).contains('Rule gap summary');
      cy.get(RULE_GAP_SUMMARY_TABLE).should('be.visible');
      cy.get(RULE_GAP_SUMMARY_TABLE).contains('Filled');
      cy.get(RULE_GAP_SUMMARY_TABLE).contains('In progress');
      cy.get(RULE_GAP_SUMMARY_TABLE).contains('Unfilled');

      // Collapse the panel again
      cy.get(RULE_MONITORING_EXPAND_BUTTON).click();
      cy.get(RULE_MONITORING_EXPAND_BUTTON).should('have.attr', 'aria-expanded', 'false');
      cy.get(LAST_RESPONSE_SUMMARY_CHART).should('not.exist');
      cy.get(RULE_GAP_SUMMARY_CHART).should('not.exist');
    });
  }
);
