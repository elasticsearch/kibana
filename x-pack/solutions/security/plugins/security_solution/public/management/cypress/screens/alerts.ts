/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { APP_ALERTS_PATH } from '../../../../common/constants';
import { loadPage } from '../tasks/common';

export const navigateToAlertsList = (urlQueryParams: string = '') => {
  loadPage(`${APP_ALERTS_PATH}${urlQueryParams ? `?${urlQueryParams}` : ''}`);
};

export const clickAlertListRefreshButton = (): Cypress.Chainable => {
  cy.getByTestSubj('querySubmitButton').first().click();
  return cy.getByTestSubj('querySubmitButton').should('be.enabled');
};

/**
 * Waits until the Alerts list has alerts data and return the number of rows that are currently displayed
 * @param timeout
 */
export const getAlertsTableRows = (timeout?: number): Cypress.Chainable<JQuery<HTMLDivElement>> => {
  let $rows: JQuery<HTMLDivElement> = Cypress.$();

  return cy
    .waitUntil(
      () => {
        clickAlertListRefreshButton();

        return cy
          .getByTestSubj('alertsTableIsLoaded')
          .find<HTMLDivElement>('.euiDataGridRow')
          .then(($rowsFound) => {
            $rows = $rowsFound;
            return Boolean($rows);
          });
      },
      { timeout, interval: 1000 }
    )
    .then(() => $rows);
};

export const openAlertDetailsView = (rowIndex: number = 0): void => {
  cy.getByTestSubj('expand-event').eq(rowIndex).click();
  cy.getByTestSubj('securitySolutionFlyoutFooterDropdownButton').click();
};

export const openAlertDetailsViewFromTimeline = (rowIndex: number = 0): void => {
  cy.getByTestSubj('timeline-container').within(() => {
    cy.getByTestSubj('docTableExpandToggleColumn').eq(rowIndex).click();
  });
  cy.getByTestSubj('securitySolutionFlyoutFooterDropdownButton').click();
};

export const openInvestigateInTimelineView = (): void => {
  cy.getByTestSubj('send-alert-to-timeline-button').first().click();
};

export const openResponderFromEndpointAlertDetails = (): void => {
  cy.getByTestSubj('endpointResponseActions-action-item').click();
};

export const addAlertToCase = (caseId: string, caseOwner: string): void => {
  cy.getByTestSubj('add-to-case-action').click();
  cy.getByTestSubj(`cases-table-row-select-${caseId}`).click();
  cy.contains(`An alert was added to \"Test ${caseOwner} case`);
};
