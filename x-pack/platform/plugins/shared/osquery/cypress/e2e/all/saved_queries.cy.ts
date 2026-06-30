/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { closeToastIfVisible, generateRandomStringName } from '../../tasks/integrations';
import {
  LIVE_QUERY_EDITOR,
  RESULTS_TABLE_BUTTON,
  RESULTS_TABLE_COLUMNS_BUTTON,
} from '../../screens/live_query';
import {
  ADD_QUERY_BUTTON,
  customActionEditSavedQuerySelector,
  customActionRunSavedQuerySelector,
  rowActionsMenuSelector,
  SAVED_QUERY_DROPDOWN_SELECT,
} from '../../screens/packs';
import { preparePack } from '../../tasks/packs';
import {
  addToCaseFromResultsHeader,
  BIG_QUERY,
  checkResults,
  deleteAndConfirm,
  fillInQueryTimeout,
  inputQuery,
  selectAllAgents,
  submitQuery,
  verifyQueryTimeout,
  viewRecentCaseAndCheckResults,
} from '../../tasks/live_query';
import { navigateTo } from '../../tasks/navigation';
import {
  loadCase,
  cleanupCase,
  loadPack,
  cleanupPack,
  loadSavedQuery,
  cleanupSavedQuery,
} from '../../tasks/api_fixtures';
import { ServerlessRoleName } from '../../support/roles';
import { getAdvancedButton } from '../../screens/integrations';

describe('ALL - Saved queries', { tags: ['@ess', '@serverless'] }, () => {
  let caseId: string;

  before(() => {
    loadCase('securitySolution').then((caseInfo) => {
      caseId = caseInfo.id;
    });
  });

  beforeEach(() => {
    cy.login(ServerlessRoleName.SOC_MANAGER);
    navigateTo('/app/osquery');
  });

  after(() => {
    cleanupCase(caseId);
  });

  it(
    'should create a new query and verify: \n ' +
      '- hidden columns, full screen and sorting \n' +
      '- pagination \n' +
      '- query can viewed (status), edited and deleted ',
    () => {
      const timeout = '601';
      const suffix = generateRandomStringName(1)[0];
      const savedQueryId = `Saved-Query-Id-${suffix}`;
      const savedQueryDescription = `Test saved query description ${suffix}`;
      cy.contains('Run query').click();
      selectAllAgents();
      inputQuery(BIG_QUERY);
      getAdvancedButton().click();
      fillInQueryTimeout(timeout);
      submitQuery();
      checkResults();
      // enter fullscreen
      cy.getBySel(RESULTS_TABLE_BUTTON).trigger('mouseover', { force: true });
      cy.contains(/Enter fullscreen$/).should('exist');
      cy.contains('Exit fullscreen').should('not.exist');
      cy.getBySel(RESULTS_TABLE_BUTTON).click({ force: true });

      cy.getBySel(RESULTS_TABLE_BUTTON).trigger('mouseover', { force: true });
      cy.contains(/Enter Fullscreen$/).should('not.exist');
      cy.contains('Exit fullscreen').should('exist');

      // hidden columns
      cy.getBySel(RESULTS_TABLE_COLUMNS_BUTTON).should('have.text', 'Columns35');
      cy.getBySel('dataGridColumnSelectorButton').click();
      cy.get('[data-popover-open="true"]').should('be.visible');
      cy.getBySel('dataGridColumnSelectorColumnItem-osquery.cmdline').click();
      cy.getBySel('dataGridColumnSelectorColumnItem-osquery.cwd').click();
      cy.get(
        '[data-test-subj^="dataGridColumnSelectorColumnItem-osquery.disk_bytes_written"]'
      ).click();
      cy.getBySel('dataGridColumnSelectorButton').click();
      cy.get('[data-popover-open="true"]').should('not.exist');
      cy.getBySel(RESULTS_TABLE_COLUMNS_BUTTON).should('have.text', 'Columns35');

      // change pagination
      cy.getBySel('pagination-button-next').scrollIntoView().click({ force: true });
      cy.getBySel('globalLoadingIndicator').should('not.exist');
      cy.getBySel('pagination-button-next').scrollIntoView().click({ force: true });
      cy.getBySel(RESULTS_TABLE_COLUMNS_BUTTON).should('have.text', 'Columns35');

      // exit fullscreen
      cy.getBySel(RESULTS_TABLE_BUTTON).trigger('mouseover', { force: true });
      cy.contains(/Enter fullscreen$/).should('not.exist');
      cy.contains('Exit fullscreen').should('exist');
      cy.getBySel(RESULTS_TABLE_BUTTON).click({ force: true });

      // sorting
      cy.getBySel('dataGridHeaderCellActionButton-osquery.egid').click({ force: true });
      cy.contains(/Sort A-Z$/).click();
      cy.getBySel(RESULTS_TABLE_COLUMNS_BUTTON).should('have.text', 'Columns35');
      cy.getBySel(RESULTS_TABLE_BUTTON).trigger('mouseover', { force: true });
      cy.contains(/Enter fullscreen$/).should('exist');

      // visit Status results
      cy.getBySel('osquery-status-tab').click();
      cy.get('tbody > tr.euiTableRow').should('have.lengthOf', 2);

      // save new query from the detail page
      cy.contains('Exit full screen').should('not.exist');
      navigateTo('/app/osquery/live_queries');
      cy.get('tbody tr', { timeout: 60000 })
        .first()
        .within(() => {
          cy.get('[aria-label="Details"]').click();
        });
      cy.contains('Query results');
      cy.getBySel('save-query-button').should('exist').click();
      cy.getBySel('osquery-save-query-flyout').should('exist');
      cy.get('input[name="id"]').type(`${savedQueryId}{downArrow}{enter}`);
      cy.get('input[name="description"]').type(`${savedQueryDescription}{downArrow}{enter}`);
      cy.getBySel('savedQueryFlyoutSaveButton').click();
      cy.contains('Successfully saved');
      closeToastIfVisible();

      // play saved query
      navigateTo('/app/osquery/saved_queries');
      cy.contains(savedQueryId);
      cy.get(`[aria-label="Run ${savedQueryId}"]`).click();
      selectAllAgents();
      verifyQueryTimeout(timeout);
      submitQuery();

      // edit saved query
      navigateTo('/app/osquery/saved_queries');
      cy.contains(savedQueryId);

      cy.get(rowActionsMenuSelector(savedQueryId)).click();
      cy.contains('Edit query').click();
      cy.get('input[name="description"]').type(` Edited{downArrow}{enter}`);

      // Run in test configuration
      cy.contains('Test configuration').click();
      selectAllAgents();
      verifyQueryTimeout(timeout);
      cy.wait(500);
      submitQuery();
      checkResults();

      // Disabled submit button in test configuration
      cy.contains('Submit').should('not.be.disabled');
      cy.getBySel('osquery-save-query-flyout').within(() => {
        cy.contains('Query is a required field').should('not.exist');
        // this clears the input
        inputQuery('{selectall}{backspace}{selectall}{backspace}');
        cy.contains('Query is a required field');
        inputQuery(BIG_QUERY);
        cy.contains('Query is a required field').should('not.exist');
      });

      // Save edited
      cy.getBySel('euiFlyoutCloseButton').click();
      cy.getBySel('update-query-button').click();
      cy.contains(`${savedQueryDescription} Edited`);

      // delete saved query
      cy.contains(savedQueryId);
      cy.get(rowActionsMenuSelector(savedQueryId)).click();
      cy.contains('Edit query').click();

      deleteAndConfirm('query');
      cy.contains(savedQueryId).should('exist');
      cy.contains(savedQueryId).should('not.exist');
    }
  );

  // Removed: 'shows ID must be unique error'
  // Migrated to Jest component test: public/form/query_id_field.test.tsx
  // Phase 2 migration — ID uniqueness validation is a form-field-level assertion

  // Removed: 'checks default values on new saved query'
  // Migrated to Jest component test: public/form/results_type_field.test.tsx
  // Phase 2 migration — form field default values are UI-only assertions

  describe('prebuilt', () => {
    let packName: string;
    let packId: string;
    let savedQueryId: string;

    before(() => {
      loadPack({
        queries: {
          test: {
            interval: 10,
            query: 'select * from uptime;',
            ecs_mapping: {},
          },
        },
      }).then((data) => {
        packId = data.saved_object_id;
        packName = data.name;
      });
      loadSavedQuery().then((data) => {
        savedQueryId = data.saved_object_id;
      });
    });

    beforeEach(() => {
      cy.login(ServerlessRoleName.SOC_MANAGER);
      navigateTo('/app/osquery/saved_queries');
      cy.getBySel('tablePaginationPopoverButton').click();
      cy.getBySel('tablePagination-50-rows').click();
    });

    after(() => {
      cleanupPack(packId);
      cleanupSavedQuery(savedQueryId);
    });

    // Removed: 'checks result type on prebuilt saved query'
    // Migrated to Jest component test: public/form/results_type_field.test.tsx
    // Phase 2 migration — result type field rendering is a UI-only assertion

    it('user can run prebuilt saved query and add to case', () => {
      // Navigate to page 2 where users_elastic is located
      cy.getBySel('pagination-button-1').click();
      cy.get(customActionRunSavedQuerySelector('users_elastic')).click();

      selectAllAgents();
      submitQuery();
      checkResults();
      addToCaseFromResultsHeader(caseId);
      viewRecentCaseAndCheckResults();
    });

    it('user can not delete prebuilt saved query but can delete normal saved query', () => {
      // Navigate to page 2 where users_elastic is located
      cy.getBySel('pagination-button-1').click();
      cy.get(rowActionsMenuSelector('users_elastic')).click();
      cy.contains('Edit query').click();
      cy.contains('Delete query').should('not.exist');
      navigateTo(`/app/osquery/saved_queries/${savedQueryId}`);

      deleteAndConfirm('query');
    });

    it('user can edit prebuilt saved query under pack', () => {
      preparePack(packName);
      cy.contains(`Edit ${packName}`);
      cy.getBySel(ADD_QUERY_BUTTON).click();

      cy.contains('Attach next query');
      cy.getBySel('globalLoadingIndicator').should('not.exist');
      cy.getBySel(LIVE_QUERY_EDITOR).should('exist');
      cy.getBySel(SAVED_QUERY_DROPDOWN_SELECT)
        .click()
        .type('users_elastic{downArrow}{downArrow}{enter}');
      // Wait for saved query data to fully load before modifying the query
      cy.contains('Unique identifier of the us').should('exist');
      cy.contains('User ID').should('exist');
      inputQuery('where name=1');
      cy.getBySel('resultsTypeField').click();
      cy.contains('Differential (Ignore removals)').click();

      cy.get(`[aria-labelledby="flyoutTitle"]`).within(() => {
        cy.getBySel('ECSMappingEditorForm')
          .first()
          .within(() => {
            cy.get(`[aria-label="Delete ECS mapping row"]`).first().click();
          });
      });
      cy.contains('Unique identifier of the us').should('not.exist');
      cy.contains('User ID').should('not.exist');
      // Wait for the editor debounce (500ms) to propagate query changes to the form
      cy.wait(1000);
      cy.getBySel('query-flyout-save-button').click();
      cy.get(`[aria-labelledby="flyoutTitle"]`).should('not.exist');

      cy.get(customActionEditSavedQuerySelector('users_elastic')).click();

      cy.contains('SELECT * FROM users;where name=1');
      cy.contains('Unique identifier of the us.').should('not.exist');
      cy.contains('User ID').should('not.exist');
      cy.contains('Differential (Ignore removals)').should('exist');
      cy.get(`[aria-labelledby="flyoutTitle"]`).contains('Cancel').click();
    });
  });
});
