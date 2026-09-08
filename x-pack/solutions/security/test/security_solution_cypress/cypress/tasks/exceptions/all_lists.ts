/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EXCEPTION_ITEM_DELETE_CONFIRM_MODAL,
  EXCEPTION_ITEM_DELETE_CONFIRM_MODAL_CONFIRM_BTN,
  EXCEPTION_ITEM_HEADER_ACTION_MENU,
  EXCEPTION_ITEM_OVERFLOW_ACTION_DELETE,
  EXCEPTION_ITEM_OVERFLOW_ACTION_EDIT,
} from '../../screens/exceptions';

export const editFirstExceptionItemInListDetailPage = () => {
  // Click on the first exception overflow menu items
  cy.get(EXCEPTION_ITEM_HEADER_ACTION_MENU).click();

  // Open the edit modal
  cy.get(EXCEPTION_ITEM_OVERFLOW_ACTION_EDIT).click();
};
export const deleteFirstExceptionItemInListDetailPage = () => {
  // Click on the first exception overflow menu items
  cy.get(EXCEPTION_ITEM_HEADER_ACTION_MENU).click();

  // Delete exception
  cy.get(EXCEPTION_ITEM_OVERFLOW_ACTION_DELETE).click();

  // Confirm deletion in the confirmation modal
  cy.get(EXCEPTION_ITEM_DELETE_CONFIRM_MODAL).should('be.visible');
  cy.get(EXCEPTION_ITEM_DELETE_CONFIRM_MODAL_CONFIRM_BTN).click();
};
