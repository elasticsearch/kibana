/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createEndpointExceptionList,
  deleteEndpointExceptionList,
  getEndpointExceptionListItems,
} from '../../../../../tasks/api_calls/exceptions';
import { deleteAlertsAndRules } from '../../../../../tasks/api_calls/common';
import { createDocument, deleteAllDocuments } from '../../../../../tasks/api_calls/elasticsearch';
import {
  expandFirstAlert,
  goToClosedAlertsOnRuleDetailsPage,
  openAddEndpointExceptionFromAlertActionButton,
  openAddEndpointExceptionFromFirstAlert,
  waitForAlerts,
} from '../../../../../tasks/alerts';
import { login } from '../../../../../tasks/login';
import { getEndpointRule } from '../../../../../objects/rule';
import { createRule } from '../../../../../tasks/api_calls/rules';
import { waitForAlertsToPopulate } from '../../../../../tasks/create_new_rule';
import {
  addExceptionEntryFieldValueAndSelectSuggestion,
  addExceptionEntryFieldValueValue,
  addExceptionFlyoutItemName,
  editExceptionFlyoutItemName,
  selectBulkCloseAlerts,
  selectCloseSingleAlerts,
  submitNewExceptionItem,
  validateExceptionConditionField,
} from '../../../../../tasks/exceptions';
import { ALERTS_COUNT } from '../../../../../screens/alerts';
import {
  ADD_NESTED_BTN,
  ENDPOINT_EXCEPTION_CARD,
  ENDPOINT_EXCEPTION_CARD_CONDITIONS,
  ENDPOINT_EXCEPTION_CARD_HEADER_TITLE,
  ENDPOINT_EXCEPTION_ITEM_CONFIRM_BTN,
  ENDPOINT_EXCEPTION_ITEM_NAME_INPUT,
  ENTRY_DELETE_BTN,
  EXCEPTION_ITEM_CONTAINER,
  FIELD_INPUT,
  OPERATOR_INPUT,
} from '../../../../../screens/exceptions';
import {
  navigateToEndpointExceptions,
  visitRuleDetailsPage,
  waitForTheRuleToBeExecuted,
} from '../../../../../tasks/rule_details';

const ENDPOINT_ALERTS_DATA_STREAM = 'logs-endpoint.alerts-default';
const ENDPOINT_FILE_PATH_FIELD = 'file.path';
const WINDOWS_MATCHING_PATH = 'c:\\users\\matching\\app.exe';
const WINDOWS_MATCHING_PATH_PATTERN = 'c:\\users\\matching\\*.exe';
const WINDOWS_MATCHING_PATH_SECOND = 'c:\\users\\matching\\second.exe';
const WINDOWS_NON_MATCHING_PATH = 'c:\\users\\other\\app.exe';
const WINDOWS_FILE_HASH = 'eb2d506e924e71d587890a8f743f39515c1116267db3815fe3a9e9d1f5aa6c21';
const ENDPOINT_EXCEPTION_CONFIRM_MODAL_SUBMIT_BTN =
  '[data-test-subj="endpointExceptionConfirmModal-submitButton"]';
const EXCEPTION_ITEM_ENTRY_CONTAINER = '[data-test-subj="exceptionItemEntryContainer"]';
const VALUES_WILDCARD_INPUT =
  '[data-test-subj="valuesAutocompleteWildcard"] [data-test-subj="comboBoxSearchInput"]';

interface ExceptionEntryLike {
  field?: string;
  operator?: string;
  type?: string;
  value?: unknown;
}

const createWindowsEndpointAlert = (
  filePath: string,
  timestamp: string
): Record<string, unknown> => ({
  '@timestamp': timestamp,
  file: {
    path: filePath,
    hash: {
      sha256: WINDOWS_FILE_HASH,
    },
  },
  host: {
    hostname: 'windows-host',
    name: 'windows-host',
    os: {
      family: 'windows',
      name: 'Windows',
      type: 'windows',
    },
  },
  agent: {
    id: 'endpoint-agent-id',
    name: 'windows-host',
    type: 'endpoint',
  },
  event: {
    action: 'process_started',
    category: ['process'],
    code: 'test',
    dataset: 'process',
    kind: 'alert',
    module: 'endpoint',
    type: ['start'],
  },
  process: {
    executable: filePath,
    name: 'app.exe',
  },
  ecs: {
    version: '8.0.0',
  },
});

const clearPrefilledEndpointExceptionEntries = () => {
  cy.get(EXCEPTION_ITEM_CONTAINER)
    .find(EXCEPTION_ITEM_ENTRY_CONTAINER)
    .should('have.length.greaterThan', 0);

  cy.get(EXCEPTION_ITEM_CONTAINER)
    .find(ENTRY_DELETE_BTN)
    .then(($deleteButtons) => {
      if ($deleteButtons.length > 1) {
        cy.get(EXCEPTION_ITEM_CONTAINER).find(ENTRY_DELETE_BTN).first().scrollIntoView();
        cy.get(EXCEPTION_ITEM_CONTAINER).find(ENTRY_DELETE_BTN).first().click();
        clearPrefilledEndpointExceptionEntries();
        return;
      }

      cy.get(EXCEPTION_ITEM_CONTAINER)
        .find(EXCEPTION_ITEM_ENTRY_CONTAINER)
        .should('have.length', 1);
    });
};

const setEndpointExceptionWildcardCondition = () => {
  cy.get(EXCEPTION_ITEM_CONTAINER).find(FIELD_INPUT).first().scrollIntoView();
  cy.get(EXCEPTION_ITEM_CONTAINER)
    .find(FIELD_INPUT)
    .first()
    .should('be.visible')
    .type(`{selectall}${ENDPOINT_FILE_PATH_FIELD}`);
  cy.get(`[data-test-subj="filterFieldOption-${ENDPOINT_FILE_PATH_FIELD}"]`).click();

  cy.get(EXCEPTION_ITEM_CONTAINER).find(OPERATOR_INPUT).first().scrollIntoView();
  cy.get(EXCEPTION_ITEM_CONTAINER)
    .find(OPERATOR_INPUT)
    .first()
    .should('be.visible')
    .type('{selectall}matches{enter}');

  cy.get(EXCEPTION_ITEM_CONTAINER).find(VALUES_WILDCARD_INPUT).first().scrollIntoView();
  cy.get(EXCEPTION_ITEM_CONTAINER)
    .find(VALUES_WILDCARD_INPUT)
    .first()
    .should('be.visible')
    .type(`{selectall}${WINDOWS_MATCHING_PATH_PATTERN}{enter}`);
};

const submitEndpointExceptionWithOptionalConfirmModal = () => {
  cy.get(ENDPOINT_EXCEPTION_ITEM_CONFIRM_BTN).click();
  cy.waitUntil(
    () =>
      cy.get('body').then(($body) => {
        const hasConfirmModal = $body.find(ENDPOINT_EXCEPTION_CONFIRM_MODAL_SUBMIT_BTN).length > 0;
        const hasSubmitButton = $body.find(ENDPOINT_EXCEPTION_ITEM_CONFIRM_BTN).length > 0;

        return hasConfirmModal || !hasSubmitButton;
      }),
    { interval: 500, timeout: 10000 }
  );
  cy.get('body').then(($body) => {
    if ($body.find(ENDPOINT_EXCEPTION_CONFIRM_MODAL_SUBMIT_BTN).length > 0) {
      cy.get(ENDPOINT_EXCEPTION_CONFIRM_MODAL_SUBMIT_BTN).click();
    }
  });
  cy.get(ENDPOINT_EXCEPTION_ITEM_CONFIRM_BTN).should('not.exist');
};

// TODO: https://github.com/elastic/kibana/issues/161539
describe(
  'Endpoint Exceptions workflows from Alert',
  { tags: ['@ess', '@serverless', '@skipInServerless'] },
  () => {
    const ITEM_NAME = 'Sample Exception List Item';
    const ITEM_NAME_EDIT = 'Sample Exception List Item';
    const ADDITIONAL_ENTRY = 'host.hostname';

    beforeEach(() => {
      login();
      deleteAlertsAndRules();
      deleteEndpointExceptionList();
      createEndpointExceptionList();

      cy.task('esArchiverLoad', { archiveName: 'endpoint' });
      createRule(getEndpointRule()).then((rule) =>
        visitRuleDetailsPage(rule.body.id, { tab: 'alerts' })
      );

      waitForTheRuleToBeExecuted();
      waitForAlertsToPopulate();
    });

    after(() => {
      cy.task('esArchiverUnload', { archiveName: 'endpoint' });
      deleteEndpointExceptionList();
    });

    it('Should be able to create and close single Endpoint exception from overflow menu', () => {
      // The Endpoint will populated with predefined fields
      openAddEndpointExceptionFromFirstAlert();

      // As the endpoint.alerts-* is used to trigger the alert the
      // file.Ext.code_signature will be auto-populated
      validateExceptionConditionField('file.Ext.code_signature');

      selectCloseSingleAlerts();
      addExceptionFlyoutItemName(ITEM_NAME, ENDPOINT_EXCEPTION_ITEM_NAME_INPUT);
      submitNewExceptionItem(ENDPOINT_EXCEPTION_ITEM_CONFIRM_BTN);

      // Instead of immediately checking if the Opened Alert has moved to the closed tab,
      // use the waitForAlerts method to create a buffer, allowing the alerts some time to
      // be moved to the Closed Alert tab.
      waitForAlerts();

      // Closed alert should appear in table
      goToClosedAlertsOnRuleDetailsPage();
      cy.get(ALERTS_COUNT).should('exist');
    });

    it('Should be able to create Endpoint exception from Alerts take action button, and change multiple exception items without resetting to initial auto-prefilled entries', () => {
      // Open first Alert Summary
      expandFirstAlert();

      // The Endpoint should populated with predefined fields
      openAddEndpointExceptionFromAlertActionButton();

      // As the endpoint.alerts-* is used to trigger the alert the
      // file.Ext.code_signature will be auto-populated
      validateExceptionConditionField('file.Ext.code_signature');
      addExceptionFlyoutItemName(ITEM_NAME, ENDPOINT_EXCEPTION_ITEM_NAME_INPUT);

      // Add non-nested condition
      cy.get(ADD_NESTED_BTN).click();
      // edit conditions
      addExceptionEntryFieldValueAndSelectSuggestion(ADDITIONAL_ENTRY, 6);
      addExceptionEntryFieldValueValue('foo', 4);

      // Change the name again
      editExceptionFlyoutItemName(ITEM_NAME_EDIT, ENDPOINT_EXCEPTION_ITEM_NAME_INPUT);

      // validate the condition is still "agent.name" or got rest after the name is changed
      validateExceptionConditionField(ADDITIONAL_ENTRY);

      selectCloseSingleAlerts();
      submitNewExceptionItem(ENDPOINT_EXCEPTION_ITEM_CONFIRM_BTN);

      navigateToEndpointExceptions();

      // new exception item displays
      cy.get(ENDPOINT_EXCEPTION_CARD).should('have.length', 1);
      cy.get(ENDPOINT_EXCEPTION_CARD_HEADER_TITLE).should('have.text', ITEM_NAME_EDIT);
      cy.get(ENDPOINT_EXCEPTION_CARD_CONDITIONS).contains('span', ADDITIONAL_ENTRY);
    });

    it('Should close all matching alerts when an Endpoint exception wildcard value contains backslashes', () => {
      deleteAlertsAndRules();
      deleteEndpointExceptionList();
      createEndpointExceptionList();
      deleteAllDocuments(ENDPOINT_ALERTS_DATA_STREAM);
      createDocument(
        ENDPOINT_ALERTS_DATA_STREAM,
        createWindowsEndpointAlert(WINDOWS_MATCHING_PATH, '2026-01-01T00:00:03.000Z')
      );
      createDocument(
        ENDPOINT_ALERTS_DATA_STREAM,
        createWindowsEndpointAlert(WINDOWS_MATCHING_PATH_SECOND, '2026-01-01T00:00:02.000Z')
      );
      createDocument(
        ENDPOINT_ALERTS_DATA_STREAM,
        createWindowsEndpointAlert(WINDOWS_NON_MATCHING_PATH, '2026-01-01T00:00:01.000Z')
      );
      createRule(getEndpointRule()).then((rule) =>
        visitRuleDetailsPage(rule.body.id, { tab: 'alerts' })
      );
      waitForTheRuleToBeExecuted();
      waitForAlertsToPopulate(3);

      openAddEndpointExceptionFromFirstAlert();
      clearPrefilledEndpointExceptionEntries();
      setEndpointExceptionWildcardCondition();
      validateExceptionConditionField(ENDPOINT_FILE_PATH_FIELD);
      selectBulkCloseAlerts();
      addExceptionFlyoutItemName(ITEM_NAME, ENDPOINT_EXCEPTION_ITEM_NAME_INPUT);
      submitEndpointExceptionWithOptionalConfirmModal();

      getEndpointExceptionListItems().then(({ body }) => {
        const pathEntry = body.data[0].entries.find(
          (entry: ExceptionEntryLike) => entry.field === ENDPOINT_FILE_PATH_FIELD
        );
        expect(pathEntry).to.deep.include({
          field: ENDPOINT_FILE_PATH_FIELD,
          operator: 'included',
          type: 'wildcard',
          value: WINDOWS_MATCHING_PATH_PATTERN,
        });
      });

      waitForAlerts();
      cy.get(ALERTS_COUNT).should('contain', '1');

      goToClosedAlertsOnRuleDetailsPage();
      cy.get(ALERTS_COUNT).should('contain', '2');
    });
  }
);
