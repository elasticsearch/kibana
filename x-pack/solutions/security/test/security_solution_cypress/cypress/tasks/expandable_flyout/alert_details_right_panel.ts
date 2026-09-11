/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DOCUMENT_DETAILS_FLYOUT_CLOSE_BUTTON,
  DOCUMENT_DETAILS_FLYOUT_COLLAPSE_DETAILS_BUTTON,
  DOCUMENT_DETAILS_FLYOUT_EXPAND_DETAILS_BUTTON,
  DOCUMENT_DETAILS_FLYOUT_FOOTER,
  DOCUMENT_DETAILS_FLYOUT_FOOTER_TAKE_ACTION_BUTTON,
  DOCUMENT_DETAILS_FLYOUT_FOOTER_TAKE_ACTION_BUTTON_DROPDOWN,
  DOCUMENT_DETAILS_FLYOUT_JSON_TAB,
  DOCUMENT_DETAILS_FLYOUT_TABLE_TAB,
} from '../../screens/expandable_flyout/alert_details_right_panel';
import {
  CREATE_NEW_CASE_FROM_MODAL_BUTTON,
  DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_NEW_CASE_CREATE_BUTTON,
  DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_NEW_CASE_DESCRIPTION_INPUT,
  DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_NEW_CASE_NAME_INPUT,
  VIEW_CASE_TOASTER_LINK,
} from '../../screens/expandable_flyout/common';
import { TOASTER_CLOSE_ICON } from '../../screens/alerts_detection_rules';

/* Header */

/**
 * Expand the left section of the document details expandable flyout by clicking on the expand icon button
 */
export const expandDocumentDetailsExpandableFlyoutLeftSection = () => {
  cy.get(DOCUMENT_DETAILS_FLYOUT_EXPAND_DETAILS_BUTTON).click();
};

/**
 * Expand the left section of the document details expandable flyout by clicking on the collapse icon button
 */
export const collapseDocumentDetailsExpandableFlyoutLeftSection = () => {
  cy.get(DOCUMENT_DETAILS_FLYOUT_COLLAPSE_DETAILS_BUTTON).click();
};

/**
 * Open the Table tab in the document details expandable flyout right section
 */
export const openTableTab = (index = 0) => {
  cy.get(DOCUMENT_DETAILS_FLYOUT_TABLE_TAB).eq(index).click();
};

/**
 * Open the Json tab in the document details expandable flyout right section
 */
export const openJsonTab = (index = 0) => {
  cy.get(DOCUMENT_DETAILS_FLYOUT_JSON_TAB).eq(index).click();
};

/**
 * Close document details flyout
 */
export const closeFlyout = () => {
  cy.get(DOCUMENT_DETAILS_FLYOUT_CLOSE_BUTTON).click();
};

/* Footer */

/**
 * Scroll down to the flyout footer's take action button, open its dropdown and click on the desired option
 */
export const openTakeActionButtonAndSelectItem = (option: string) => {
  openTakeActionButton();
  selectTakeActionItem(option);
};

/**
 * Scroll down to the flyout footer's take action button and open its dropdown
 */
export const openTakeActionButton = () => {
  cy.get(DOCUMENT_DETAILS_FLYOUT_FOOTER).within(() =>
    cy.get(DOCUMENT_DETAILS_FLYOUT_FOOTER_TAKE_ACTION_BUTTON).click()
  );
};

/**
 * Click on the item within the flyout's footer take action button dropdown
 */
export const selectTakeActionItem = (option: string) => {
  cy.get(DOCUMENT_DETAILS_FLYOUT_FOOTER_TAKE_ACTION_BUTTON_DROPDOWN).within(() =>
    cy.get(option).click()
  );
};

/**
 * Create new case from the expandable flyout take action button
 */
export const fillOutFormToCreateNewCase = () => {
  cy.get(CREATE_NEW_CASE_FROM_MODAL_BUTTON).click();
  cy.get(DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_NEW_CASE_NAME_INPUT).type('case');
  cy.get(DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_NEW_CASE_DESCRIPTION_INPUT).type('case description');

  cy.get(DOCUMENT_DETAILS_FLYOUT_FOOTER_ADD_TO_NEW_CASE_CREATE_BUTTON).click();

  cy.get(VIEW_CASE_TOASTER_LINK).should('be.visible');
  cy.get(TOASTER_CLOSE_ICON).click();
};
