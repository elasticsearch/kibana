/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getNewRule } from '../../../../../objects/rule';
import {
  ADD_TO_CASE_BUTTON,
  ADD_TO_CASE_MODAL,
  SELECTED_ALERTS,
  TAKE_ACTION_POPOVER_BTN,
} from '../../../../../screens/alerts';
import { selectNumberOfAlerts } from '../../../../../tasks/alerts';
import { createRule } from '../../../../../tasks/api_calls/rules';
import { deleteAlertsAndRules } from '../../../../../tasks/api_calls/common';
import { waitForAlertsToPopulate } from '../../../../../tasks/create_new_rule';
import { login } from '../../../../../tasks/login';
import { visit } from '../../../../../tasks/navigation';
import { ALERTS_URL } from '../../../../../urls/navigation';

describe('Alerts table bulk actions', { tags: ['@ess', '@serverless'] }, () => {
  before(() => {
    cy.task('esArchiverLoad', { archiveName: 'auditbeat_multiple' });
  });

  after(() => {
    cy.task('esArchiverUnload', { archiveName: 'auditbeat_multiple' });
  });

  beforeEach(() => {
    login();
    deleteAlertsAndRules();
    createRule(getNewRule());
    visit(ALERTS_URL);
  });

  it('opens the case selector from the bulk action', () => {
    waitForAlertsToPopulate();
    selectNumberOfAlerts(2);
    cy.get(SELECTED_ALERTS).should('have.text', `Selected 2 alerts`);
    cy.get(TAKE_ACTION_POPOVER_BTN).first().click();
    cy.get(TAKE_ACTION_POPOVER_BTN).should('be.visible');
    cy.get(ADD_TO_CASE_BUTTON).click();
    cy.get(ADD_TO_CASE_MODAL).should('be.visible');
  });
});
