/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { recurse } from 'cypress-recurse';
import { closeModalIfVisible, closeToastIfVisible } from './integrations';
import { navigateTo } from './navigation';

export const preparePack = (packName: string) => {
  cy.contains('Packs').click();
  cy.getBySel('tablePaginationPopoverButton').click();
  cy.getBySel('tablePagination-50-rows').click();
  const createdPack = cy.contains(packName);
  createdPack.click();
};

/**
 * The read-only "Pack details" page was removed. The per-query scheduled
 * results (docs counts, "View in Lens"/"View in Discover" actions) that used to
 * live there now surface on the scheduled-execution details page, reached from
 * the History tab. This polls History until the scheduled execution for the
 * given pack is indexed, then opens its details page.
 */
export const openScheduledPackExecutionDetails = (packName: string) => {
  navigateTo('/app/osquery');

  // Scheduled results take a while to be indexed by ES, so we reload between
  // attempts (same approach as the legacy details poll).
  recurse<number>(
    () =>
      cy
        .getBySel('unifiedHistoryTable')
        .then(($table) => $table.find('tr:contains("' + packName + '")').length),
    (rowCount) => rowCount > 0,
    {
      timeout: 300000,
      post: () => {
        cy.reload();
      },
    }
  );

  // Open the scheduled execution's details page via the row's "Details" action
  // button (EuiButtonIcon with aria-label "Details" from HistoryDetailsButton
  // in unified_history_table.tsx).
  cy.contains('.euiTableRow', packName)
    .find('[aria-label="Details"]')
    .first()
    .should('be.visible')
    .click();

  // ScheduledExecutionDetailsPage renders the "View history" back button.
  cy.contains('View history').should('exist');
};

export const changePackActiveStatus = (packName: string) => {
  const regex = new RegExp(`Successfully (activated|deactivated) "${packName}" pack`);

  cy.getBySel('globalLoadingIndicator').should('not.exist');
  cy.get(`[aria-label="${packName}"]`).click();
  closeModalIfVisible();
  cy.contains(regex).should('not.exist');
  cy.contains(regex).should('exist');
  closeToastIfVisible();
  cy.contains(regex).should('not.exist');
};
