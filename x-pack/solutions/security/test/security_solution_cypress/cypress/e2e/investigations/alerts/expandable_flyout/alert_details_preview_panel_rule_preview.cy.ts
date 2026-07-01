/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expandAlertAtIndexExpandableFlyout } from '../../../../tasks/expandable_flyout/common';
import {
  DOCUMENT_DETAILS_FLYOUT_CREATED_BY,
  DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_ABOUT_SECTION_CONTENT,
  DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_ABOUT_SECTION_HEADER,
  DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_DEFINITION_SECTION_CONTENT,
  DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_DEFINITION_SECTION_HEADER,
  DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_FOOTER,
  DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_FOOTER_LINK,
  DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_SCHEDULE_SECTION_CONTENT,
  DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_SCHEDULE_SECTION_HEADER,
  DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_TITLE,
  DOCUMENT_DETAILS_FLYOUT_UPDATED_BY,
} from '../../../../screens/expandable_flyout/alert_details_preview_panel_rule_preview';
import {
  toggleRulePreviewAboutSection,
  toggleRulePreviewDefinitionSection,
  toggleRulePreviewScheduleSection,
} from '../../../../tasks/expandable_flyout/alert_details_preview_panel_rule_preview';
import { clickRuleSummaryButton } from '../../../../tasks/expandable_flyout/alert_details_right_panel_overview_tab';
import { deleteAlertsAndRules } from '../../../../tasks/api_calls/common';
import { login } from '../../../../tasks/login';
import { visit } from '../../../../tasks/navigation';
import { createRule } from '../../../../tasks/api_calls/rules';
import { getNewRule } from '../../../../objects/rule';
import { ALERTS_URL } from '../../../../urls/navigation';
import { waitForAlertsToPopulate } from '../../../../tasks/create_new_rule';

describe(
  'Alert details expandable flyout rule preview panel',
  { tags: ['@ess', '@serverless'] },
  () => {
    const rule = getNewRule();

    beforeEach(() => {
      deleteAlertsAndRules();
      login();
      createRule(rule);
      visit(ALERTS_URL);
      waitForAlertsToPopulate();
      // Wait for any in-flight alerts search that may have been triggered by a
      // background rule evaluation immediately after waitForAlertsToPopulate's
      // 500 ms idle window closed. A second idle check here ensures the spinner
      // is gone before we try to expand the alert row (fixes #257389).
      cy.waitForNetworkIdle('/internal/search/privateRuleRegistryAlertsSearchStrategy', 500);
      expandAlertAtIndexExpandableFlyout();
      clickRuleSummaryButton();
    });

    describe('rule preview', () => {
      it('should display rule preview and its sub sections', () => {
        cy.log('rule preview panel');

        cy.log('title');

        cy.get(DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_TITLE).scrollIntoView();
        cy.get(DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_TITLE).should('contain.text', rule.name);
        cy.get(DOCUMENT_DETAILS_FLYOUT_CREATED_BY).should('be.visible');
        cy.get(DOCUMENT_DETAILS_FLYOUT_UPDATED_BY).should('be.visible');

        cy.log('about');

        cy.get(DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_ABOUT_SECTION_HEADER).should(
          'contain.text',
          'About'
        );
        cy.get(DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_ABOUT_SECTION_CONTENT)
          .should('contain.text', 'Severity')
          .and('contain.text', 'High')
          .and('contain.text', 'Risk score')
          .and('contain.text', '17');

        toggleRulePreviewAboutSection();

        cy.log('definition');

        toggleRulePreviewDefinitionSection();

        cy.get(DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_DEFINITION_SECTION_HEADER).should(
          'contain.text',
          'Definition'
        );
        cy.get(DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_DEFINITION_SECTION_CONTENT).should(
          'contain.text',
          'Index patterns'
        );
        // @ts-ignore
        rule.index.forEach((index: string) =>
          cy
            .get(DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_DEFINITION_SECTION_CONTENT)
            .should('contain.text', index)
        );
        cy.get(DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_DEFINITION_SECTION_CONTENT)
          .should('contain.text', 'Custom query')
          .and('contain.text', rule.query);
        cy.get(DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_DEFINITION_SECTION_CONTENT)
          .should('contain.text', 'Rule type')
          .and('contain.text', rule.type);

        toggleRulePreviewDefinitionSection();

        cy.log('schedule');

        toggleRulePreviewScheduleSection();

        cy.get(DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_SCHEDULE_SECTION_HEADER).should(
          'contain.text',
          'Schedule'
        );
        cy.get(DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_SCHEDULE_SECTION_CONTENT)
          .should('contain.text', 'Runs every')
          .and('contain.text', rule.interval);

        toggleRulePreviewScheduleSection();

        cy.log('footer');

        cy.get(DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_FOOTER).should('be.visible');
        cy.get(DOCUMENT_DETAILS_FLYOUT_RULE_PREVIEW_FOOTER_LINK).should(
          'contain.text',
          'Show full rule details'
        );
      });
    });
  }
);
