/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Exception } from '../../objects/exception';
import {
  FIELD_INPUT,
  OPERATOR_INPUT,
  EXCEPTION_ITEM_CONTAINER,
  EXCEPTION_FLYOUT_TITLE,
  VALUES_INPUT,
  VALUES_MATCH_ANY_INPUT,
  VALUES_MATCH_INCLUDED_INPUT,
  ADD_AND_BTN,
  ADD_OR_BTN,
} from '../../screens/exceptions';

export const addExceptionEntryFieldValueOfItemX = (
  field: string,
  itemIndex = 0,
  fieldIndex = 0
) => {
  cy.get(EXCEPTION_ITEM_CONTAINER)
    .eq(itemIndex)
    .find(FIELD_INPUT)
    .eq(fieldIndex)
    .type(`{selectall}${field}{enter}`);
  cy.get(EXCEPTION_FLYOUT_TITLE).click();
};

export const selectCurrentEntryField = (index = 0) => {
  cy.get(FIELD_INPUT).eq(index).type(`{downarrow}{enter}`);
};

export const addExceptionEntryFieldValue = (field: string, index = 0) => {
  cy.get(FIELD_INPUT).eq(index).type(`{selectall}${field}{enter}`);
  cy.get(EXCEPTION_FLYOUT_TITLE).click();
};

export const addExceptionEntryFieldValueAndSelectSuggestion = (field: string, index = 0) => {
  cy.get(FIELD_INPUT).eq(index).type(`${field}`);
  cy.get(`[data-test-subj="filterFieldOption-${field}"]`).click();
};

export const addExceptionEntryOperatorValue = (operator: string, index = 0) => {
  cy.get(OPERATOR_INPUT).eq(index).type(`{selectall}${operator}{enter}`);
  cy.get(EXCEPTION_FLYOUT_TITLE).click();
};

export const addExceptionEntryFieldValueValue = (value: string, index = 0) => {
  cy.get(VALUES_INPUT).eq(index).type(`{selectall}${value}{enter}`);
  cy.get(EXCEPTION_FLYOUT_TITLE).click();
};

export const addExceptionEntryFieldMatchAnyValue = (values: string[], index = 0) => {
  values.forEach((value) => {
    cy.get(VALUES_MATCH_ANY_INPUT).eq(index).type(`{selectall}${value}{enter}`);
  });
  cy.get(EXCEPTION_FLYOUT_TITLE).click();
};

export const addExceptionEntryFieldMatchIncludedValue = (value: string, index = 0) => {
  cy.get(VALUES_MATCH_INCLUDED_INPUT).eq(index).type(`{selectall}${value}{enter}`);
  cy.get(EXCEPTION_FLYOUT_TITLE).click();
};

export const addExceptionConditions = (exception: Exception) => {
  cy.get(FIELD_INPUT).type(`${exception.field}{downArrow}{enter}`);
  cy.get(OPERATOR_INPUT).type(`{selectall}${exception.operator}{enter}`);
  if (exception.operator === 'is one of') {
    addExceptionEntryFieldMatchAnyValue(exception.values, 0);
  } else {
    exception.values.forEach((value) => {
      cy.get(VALUES_INPUT).type(`{selectall}${value}{enter}`);
    });
  }
};

export const validateExceptionConditionField = (value: string) => {
  cy.get(EXCEPTION_ITEM_CONTAINER).get(`input[value="${value}"]`).should('exist');
};

export const addTwoAndedConditions = (
  firstEntryField: string,
  firstEntryFieldValue: string,
  secondEntryField: string,
  secondEntryFieldValue: string
) => {
  addExceptionEntryFieldValue(firstEntryField, 0);
  addExceptionEntryFieldValueValue(firstEntryFieldValue, 0);

  cy.get(ADD_AND_BTN).click();

  addExceptionEntryFieldValue(secondEntryField, 1);
  addExceptionEntryFieldValueValue(secondEntryFieldValue, 1);
};

export const addTwoORedConditions = (
  firstEntryField: string,
  firstEntryFieldValue: string,
  secondEntryField: string,
  secondEntryFieldValue: string
) => {
  addExceptionEntryFieldValue(firstEntryField, 0);
  addExceptionEntryFieldValueValue(firstEntryFieldValue, 0);

  cy.get(ADD_OR_BTN).click();

  addExceptionEntryFieldValue(secondEntryField, 1);
  addExceptionEntryFieldValueValue(secondEntryFieldValue, 1);
};

export const editException = (updatedField: string, itemIndex = 0, fieldIndex = 0) => {
  addExceptionEntryFieldValueOfItemX(`${updatedField}{downarrow}{enter}`, itemIndex, fieldIndex);
  addExceptionEntryFieldValueValue('foo', itemIndex);
};
