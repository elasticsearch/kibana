/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getCustomQueryRuleParams } from '../../../../objects/rule';
import {
  ADD_EXCEPTION_BTN,
  ATTACH_ALERT_TO_CASE_BUTTON,
  CREATE_NEW_CASE_FROM_MODAL_BUTTON,
} from '../../../../screens/alerts';
import {
  addAlertTagToNAlerts,
  closeAlerts,
  expandFirstAlertActions,
  selectNumberOfAlerts,
} from '../../../../tasks/alerts';
import { createRule } from '../../../../tasks/api_calls/rules';
import { deleteAlertsAndRules } from '../../../../tasks/api_calls/common';
import { loginWithUser } from '../../../../tasks/login';
import { visit } from '../../../../tasks/navigation';
import { ALERTS_URL } from '../../../../urls/navigation';
import {
  createUsersAndRoles,
  deleteUsersAndRoles,
  rulesAllUser,
  rulesAllWithCasesUser,
  rulesReadUser,
  secAll as rulesNone,
  secAllUser as rulesNoneUser,
  rulesAll,
  rulesRead,
  rulesAllWithCases,
} from '../../../../tasks/privileges';
import { assertSuccessToast } from '../../../../screens/common/toast';
import { waitForAlertsToPopulate } from '../../../../tasks/create_new_rule';
import {
  removeAllAssigneesForFirstAlert,
  updateAssigneesForFirstAlert,
} from '../../../../tasks/alert_assignments';
import { sortUsingDataGridBtn } from '../../../../tasks/table_pagination';
import { NO_PRIVILEGES_BOX } from '../../../../screens/common/page';
import { openKibanaNavigation } from '../../../../tasks/kibana_navigation';
import { DETECTIONS_PAGE } from '../../../../screens/kibana_navigation';

const usersToCreate = [rulesAllUser, rulesAllWithCasesUser, rulesReadUser, rulesNoneUser];
const rolesToCreate = [rulesAll, rulesAllWithCases, rulesRead, rulesNone];

describe('Alerts page - privileges', { tags: ['@ess'] }, () => {
  before(() => {
    cy.task('esArchiverLoad', { archiveName: 'auditbeat_multiple' });
    deleteAlertsAndRules();
    deleteUsersAndRoles(usersToCreate, rolesToCreate);
    createUsersAndRoles(usersToCreate, rolesToCreate);
    // This triggers the creation of list indexes which is necessary to visualize the alerts page
    loginWithUser(rulesAllUser);
    visit(ALERTS_URL);
  });

  after(() => {
    cy.task('esArchiverUnload', { archiveName: 'auditbeat_multiple' });
  });

  beforeEach(() => {
    loginWithUser(rulesAllUser);
    deleteAlertsAndRules();
    createRule(getCustomQueryRuleParams());
  });

  describe('securitySolutionRulesV1.all', () => {
    beforeEach(() => {
      loginWithUser(rulesAllUser);
      visit(ALERTS_URL);
      waitForAlertsToPopulate();
    });

    it(`should be able close alerts`, () => {
      selectNumberOfAlerts(3);

      closeAlerts();
      assertSuccessToast('Successfully closed 3 alerts.', '');
    });

    it(`should be able to add an exception`, () => {
      expandFirstAlertActions();

      cy.get(ADD_EXCEPTION_BTN).click();
      cy.get('[data-test-subj="exceptionFlyoutTitle"]').should('be.visible');
    });
  });

  describe('securitySolutionRulesV1.all with cases', () => {
    beforeEach(() => {
      loginWithUser(rulesAllWithCasesUser);
      visit(ALERTS_URL);
      waitForAlertsToPopulate();
    });

    it(`should be able to add to case`, () => {
      expandFirstAlertActions();

      cy.get(ATTACH_ALERT_TO_CASE_BUTTON).click();
      cy.get(CREATE_NEW_CASE_FROM_MODAL_BUTTON).click();

      cy.get('[data-test-subj="create-case-submit"]').should('be.enabled');
    });
  });

  describe('securitySolutionRulesV1.read', () => {
    beforeEach(() => {
      loginWithUser(rulesReadUser);
      visit(ALERTS_URL);
      waitForAlertsToPopulate();
      sortUsingDataGridBtn('Assignees');
    });

    it('should be able to assign/unassign alerts', () => {
      const assignees = [rulesReadUser.username];
      updateAssigneesForFirstAlert(assignees);
      removeAllAssigneesForFirstAlert();
    });

    it('should be able to apply alert tags', () => {
      addAlertTagToNAlerts(5);
    });

    it(`should not be able to add an exception`, () => {
      expandFirstAlertActions();
      cy.get(ADD_EXCEPTION_BTN).should('not.exist');
    });
  });

  describe('securitySolutionRulesV1 none', () => {
    beforeEach(() => {
      loginWithUser(rulesNoneUser);
      visit(ALERTS_URL);
    });

    it('should not be able to see the alerts page', () => {
      cy.get(NO_PRIVILEGES_BOX).should('exist');
    });

    it('should not see the "detections" link in the sidebar', () => {
      openKibanaNavigation();
      cy.get(DETECTIONS_PAGE).should('not.exist');
    });
  });
});
