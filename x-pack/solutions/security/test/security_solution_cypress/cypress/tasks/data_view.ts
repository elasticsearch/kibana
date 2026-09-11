/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DATA_VIEW_PICKER,
  DATA_VIEW_PICKER_POPOVER,
  MANAGE_DATA_VIEW_BUTTON,
} from '../screens/data_view';

export const openTimelineDataViewPicker = () => {
  cy.get(DATA_VIEW_PICKER).within(() => {
    cy.get('button').click();
  });
};

export const openManageDataView = () => {
  cy.get(MANAGE_DATA_VIEW_BUTTON).click();
};

export const isDataViewSelection = (dataView: string) => {
  cy.get(DATA_VIEW_PICKER_POPOVER).within(() =>
    cy
      .get('li')
      // @ts-ignore
      .filter((_, element) => element.textContent.includes(dataView))
      .should('have.attr', 'aria-selected', 'true')
  );
};

export const selectDataView = (dataView: string) => {
  // click on the correct data view li element
  cy.get(DATA_VIEW_PICKER_POPOVER).within(() =>
    cy
      .get('li')
      // @ts-ignore
      .filter((_, element) => element.textContent.includes(dataView))
      .click()
  );

  // wait for the main button to be updated, and wait for the popover to be closed
  cy.get(DATA_VIEW_PICKER).within(() => {
    cy.get('button').find('[data-test-subj="fullText"]').should('have.text', dataView);
  });
  cy.get(DATA_VIEW_PICKER_POPOVER).should('not.exist');
};
