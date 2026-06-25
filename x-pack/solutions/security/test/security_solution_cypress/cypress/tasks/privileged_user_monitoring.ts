/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MONITORING_ENGINE_DELETE_URL } from '@kbn/security-solution-plugin/common/entity_analytics/privileged_user_monitoring/constants';
import { getDataTestSubjectSelector } from '../helpers/common';
import { rootRequest } from './api_calls/common';

export const deletePrivMonEngine = () => {
  return rootRequest({
    method: 'DELETE',
    url: MONITORING_ENGINE_DELETE_URL,
    failOnStatusCode: false,
    timeout: 300000,
  });
};

export const uploadCSVFile = (fileName: string, content: string) => {
  return cy.get(getDataTestSubjectSelector('privileged-user-monitoring-file-picker')).selectFile({
    contents: Cypress.Buffer.from(content),
    fileName,
    mimeType: 'text/csv',
    lastModified: Date.now(),
  });
};

export const openFilePicker = () => {
  cy.get(getDataTestSubjectSelector('privilegedUserMonitoringImportCSVCard')).click();
};

export const openIndexPicker = () => {
  cy.get(getDataTestSubjectSelector('privilegedUserMonitoringAddIndexCard')).click();
};

export const closeIndexPicker = () => {
  cy.get(getDataTestSubjectSelector('index-selector-modal')).find('.euiModalHeader').click();
};

export const openCreateIndexModal = () => {
  cy.get(`${getDataTestSubjectSelector('create-index-button')}`)
    .should('exist')
    .click();
};

export const typeIndexName = (newIndex: string) => {
  cy.get(`${getDataTestSubjectSelector('createIndexModalIndexName')}`)
    .should('exist')
    .type(newIndex);
};

export const clickCreateIndexButton = () => {
  cy.get(`${getDataTestSubjectSelector('createIndexModalCreateButton')}`)
    .should('exist')
    .click();
};

export const waitForIndexPickerLoader = () => {
  const loaderSelector = `${getDataTestSubjectSelector(
    'index-selector-modal'
  )} span[aria-label="Loading"]`;
  cy.get(loaderSelector).should('exist');
  cy.get(loaderSelector).should('not.exist');
};

export const expandIndexPickerOptions = () => {
  waitForIndexPickerLoader();
  cy.get(`${getDataTestSubjectSelector('comboBoxToggleListButton')}`)
    .should('exist')
    .click();
};

export const selectIndexPickerOption = (index: string) => {
  cy.get(`[data-test-subj="privMonIndexOption-${index}"]`).should('exist').click();
};

export const clickFileUploaderAssignButton = () => {
  cy.get(getDataTestSubjectSelector('privileged-user-monitoring-assign-button')).click();
};

export const clickFileUploaderUpdateButton = () => {
  cy.get(getDataTestSubjectSelector('privileged-user-monitoring-update-button')).click();
};
