/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GetPackagePoliciesResponse } from '@kbn/fleet-plugin/common';
import { PACKAGE_POLICY_API_ROOT } from '@kbn/fleet-plugin/common';
import type {
  ExceptionListItemSchema,
  ExceptionListSchema,
} from '@kbn/securitysolution-io-ts-list-types';
import { ExceptionListTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import {
  ENDPOINT_ARTIFACT_LISTS,
  ENDPOINT_ARTIFACT_LIST_IDS,
  EXCEPTION_LIST_ITEM_URL,
  EXCEPTION_LIST_URL,
} from '@kbn/securitysolution-list-constants';
import type { GetEndpointExceptionsPerPolicyOptInResponse } from '../../../../common/api/endpoint/endpoint_exceptions_per_policy_opt_in/endpoint_exceptions_per_policy_opt_in.gen';
import {
  APP_BLOCKLIST_PATH,
  APP_TRUSTED_APPS_PATH,
  APP_TRUSTED_DEVICES_PATH,
} from '../../../../common/constants';
import { loadPage, request } from './common';
import { ENDPOINT_EXCEPTIONS_PER_POLICY_OPT_IN_ROUTE } from '../../../../common/endpoint/constants';

export const removeAllArtifacts = () => {
  for (const listId of ENDPOINT_ARTIFACT_LIST_IDS) {
    removeExceptionsList(listId);
  }
};

export const removeAllArtifactsPromise = (): Promise<number> =>
  Cypress.Promise.all(ENDPOINT_ARTIFACT_LIST_IDS.map(removeExceptionsListPromise)).then(
    (result) => result.filter(Boolean).length
  );

export const removeExceptionsList = (listId: string) => {
  request({
    method: 'DELETE',
    url: `${EXCEPTION_LIST_URL}?list_id=${listId}&namespace_type=agnostic`,
    failOnStatusCode: false,
  }).then(({ status }) => {
    expect(status).to.be.oneOf([200, 404]); // should either be success or not found
  });
};

const removeExceptionsListPromise = (listId: string) => {
  return new Cypress.Promise((resolve) => {
    request({
      method: 'DELETE',
      url: `${EXCEPTION_LIST_URL}?list_id=${listId}&namespace_type=agnostic`,
      failOnStatusCode: false,
    }).then(({ status }) => {
      expect(status).to.be.oneOf([200, 404]); // should either be success or not found
      resolve(status === 200);
    });
  });
};

const ENDPOINT_ARTIFACT_LIST_TYPES = {
  [ENDPOINT_ARTIFACT_LISTS.endpointExceptions.id]: ExceptionListTypeEnum.ENDPOINT,
  [ENDPOINT_ARTIFACT_LISTS.trustedApps.id]: ExceptionListTypeEnum.ENDPOINT,
  [ENDPOINT_ARTIFACT_LISTS.trustedDevices.id]: ExceptionListTypeEnum.ENDPOINT_TRUSTED_DEVICES,
  [ENDPOINT_ARTIFACT_LISTS.eventFilters.id]: ExceptionListTypeEnum.ENDPOINT_EVENTS,
  [ENDPOINT_ARTIFACT_LISTS.hostIsolationExceptions.id]:
    ExceptionListTypeEnum.ENDPOINT_HOST_ISOLATION_EXCEPTIONS,
  [ENDPOINT_ARTIFACT_LISTS.blocklists.id]: ExceptionListTypeEnum.ENDPOINT_BLOCKLISTS,
};

export const createArtifactList = (listId: keyof typeof ENDPOINT_ARTIFACT_LIST_TYPES) => {
  request<ExceptionListSchema>({
    method: 'POST',
    url: EXCEPTION_LIST_URL,
    body: {
      name: listId,
      description: 'This is a test list',
      list_id: listId,
      type: ENDPOINT_ARTIFACT_LIST_TYPES[listId],
      namespace_type: 'agnostic',
    },
  }).then((response) => {
    expect(response.status).to.eql(200);
    expect(response.body.list_id).to.eql(listId);
    expect(response.body.type).to.eql(ENDPOINT_ARTIFACT_LIST_TYPES[listId]);
  });
};

export const createPerPolicyArtifact = (name: string, body: object, policyId?: 'all' | string) =>
  request<ExceptionListItemSchema>({
    method: 'POST',
    url: EXCEPTION_LIST_ITEM_URL,
    body: {
      name,
      description: '',
      type: 'simple',
      namespace_type: 'agnostic',
      ...body,
      ...(policyId ? { tags: [`policy:${policyId}`] } : {}),
    },
  }).then((response) => {
    expect(response.status).to.eql(200);
    expect(response.body.name).to.eql(name);
    return response;
  });

export const yieldFirstPolicyID = (): Cypress.Chainable<string> =>
  request<GetPackagePoliciesResponse>({
    method: 'GET',
    url: `${PACKAGE_POLICY_API_ROOT}?page=1&perPage=1&kuery=ingest-package-policies.package.name: endpoint`,
  }).then(({ body }) => {
    expect(body.items.length).to.be.least(1);
    return body.items[0].id;
  });

export const trustedAppsFormSelectors = {
  selectOs: (os: 'windows' | 'macos' | 'linux') => {
    cy.getByTestSubj('trustedApps-form-osSelectField').click();
    cy.get(`button[role="option"][id="${os}"]`).click();
  },

  openFieldSelector: (group = 1, entry = 0) => {
    cy.getByTestSubj(
      `trustedApps-form-conditionsBuilder-group${group}-entry${entry}-field`
    ).click();
  },

  selectField: (field: 'Signature' | 'Hash' | 'Path' = 'Signature', group = 1, entry = 0) => {
    cy.getByTestSubj(
      `trustedApps-form-conditionsBuilder-group${group}-entry${entry}-field-type-${field}`
    ).click();
  },

  fillOutValueField: (value: string, group = 1, entry = 0) => {
    cy.getByTestSubj(`trustedApps-form-conditionsBuilder-group${group}-entry${entry}-value`).type(
      value
    );
  },

  clickAndConditionButton: () => {
    cy.getByTestSubj('trustedApps-form-conditionsBuilder-group1-AndButton').click();
  },

  submitForm: () => {
    cy.getByTestSubj('trustedAppsListPage-flyout-submitButton').click();
  },

  fillOutTrustedAppsFlyout: () => {
    cy.getByTestSubj('trustedApps-form-nameTextField').type('Test TrustedApp');
    cy.getByTestSubj('trustedApps-form-descriptionField').type('Test Description');
  },

  expectedFieldOptions: (fields = ['Path', 'Hash', 'Signature']) => {
    if (fields.length) {
      fields.forEach((field) => {
        cy.getByTestSubj(
          `trustedApps-form-conditionsBuilder-group1-entry0-field-type-${field}`
        ).contains(field);
      });
    } else {
      const fields2 = ['Path', 'Hash', 'Signature'];
      fields2.forEach((field) => {
        cy.getByTestSubj(
          `trustedApps-form-conditionsBuilder-group1-entry0-field-type-${field}`
        ).should('not.exist');
      });
    }
  },

  expectAllFieldOptionsRendered: () => {
    trustedAppsFormSelectors.expectedFieldOptions();
  },

  expectFieldOptionsNotRendered: () => {
    trustedAppsFormSelectors.expectedFieldOptions([]);
  },

  openTrustedApps: ({ create, itemId }: { create?: boolean; itemId?: string } = {}) => {
    if (!create && !itemId) {
      loadPage(APP_TRUSTED_APPS_PATH);
    } else if (create) {
      loadPage(`${APP_TRUSTED_APPS_PATH}?show=create`);
    } else if (itemId) {
      loadPage(`${APP_TRUSTED_APPS_PATH}?itemId=${itemId}&show=edit`);
    }
  },

  validateSuccessPopup: (type: 'create' | 'update' | 'delete') => {
    let expectedTitle = '';
    switch (type) {
      case 'create':
        expectedTitle = '"Test TrustedApp" has been added to your trusted applications.';
        break;
      case 'update':
        expectedTitle = '"Test TrustedApp" has been updated';
        break;
      case 'delete':
        expectedTitle = '"Test TrustedApp" has been removed from trusted applications.';
        break;
    }
    cy.getByTestSubj('euiToastHeader__title').contains(expectedTitle);
  },

  validateRenderedCondition: (expectedCondition: RegExp) => {
    cy.getByTestSubj('trustedAppsListPage-card')
      .first()
      .within(() => {
        cy.getByTestSubj('trustedAppsListPage-card-criteriaConditions-os')
          .invoke('text')
          .should('match', /OS\s*IS\s*Mac/);
        cy.getByTestSubj('trustedAppsListPage-card-criteriaConditions-condition')
          .invoke('text')
          .should('match', expectedCondition);
      });
  },
  validateRenderedConditions: (expectedConditions: RegExp) => {
    cy.getByTestSubj('trustedAppsListPage-card-criteriaConditions')
      .invoke('text')
      .should('match', expectedConditions);
  },
  removeSingleCondition: (group = 1, entry = 0) => {
    cy.getByTestSubj(
      `trustedApps-form-conditionsBuilder-group${group}-entry${entry}-remove`
    ).click();
  },
  deleteTrustedAppItem: () => {
    cy.getByTestSubj('trustedAppsListPage-card')
      .first()
      .within(() => {
        cy.getByTestSubj('trustedAppsListPage-card-header-actions-button').click();
      });

    cy.getByTestSubj('trustedAppsListPage-card-cardDeleteAction').click();
    cy.getByTestSubj('trustedAppsListPage-deleteModal-submitButton').click();
  },
};

export const trustedDevicesFormSelectors = {
  selectOs: (osOption: 'Windows and Mac' | 'Windows' | 'Mac') => {
    cy.getByTestSubj('trustedDevices-form-osSelectField').click();
    cy.get('[role="option"]')
      .contains(new RegExp(`^${osOption}$`))
      .click();
  },

  selectField: (field: 'Username' | 'Host' | 'Device ID' | 'Manufacturer' | 'Product ID') => {
    cy.getByTestSubj('trustedDevices-form-entry0fieldSelect').click();
    cy.get('[role="option"]').contains(field).click();
  },

  selectOperator: (operator: 'is' | 'matches') => {
    cy.getByTestSubj('trustedDevices-form-entry0operatorSelect').click();
    cy.get('[role="option"]')
      .contains(operator === 'is' ? 'is' : 'matches')
      .click();
  },

  fillValue: (value: string) => {
    cy.getByTestSubj('trustedDevices-form-entry0valueField').within(() => {
      cy.get('input[role="combobox"]').click();
      cy.get('input[role="combobox"]').should('be.focused');
      cy.get('input[role="combobox"]').type(`{selectall}{backspace}`);
      cy.get('input[role="combobox"]').should('have.value', '');
      cy.get('input[role="combobox"]').type(`${value}{enter}`);
    });
  },

  fillOutTrustedDevicesFlyout: (name = 'Test Trusted Device', description = 'Test Description') => {
    cy.getByTestSubj('trustedDevices-form-nameTextField').clear();
    cy.getByTestSubj('trustedDevices-form-nameTextField').type(name);
    cy.getByTestSubj('trustedDevices-form-descriptionField').clear();
    cy.getByTestSubj('trustedDevices-form-descriptionField').type(description);
  },

  submitForm: () => {
    cy.getByTestSubj('trustedDevicesList-flyout-submitButton').click();
  },

  validateSuccessPopup: (action: 'create' | 'update' | 'delete') => {
    const messages = {
      create: 'has been added to your trusted devices list',
      update: 'has been updated',
      delete: 'has been removed from the trusted devices list',
    };
    cy.get('[data-test-subj="globalToastList"]').should('contain.text', messages[action]);
  },

  validateRenderedCondition: (expectedCondition: RegExp) => {
    cy.getByTestSubj('trustedDevicesList-card')
      .first()
      .within(() => {
        cy.getByTestSubj('trustedDevicesList-card-criteriaConditions-condition')
          .invoke('text')
          .should('match', expectedCondition);
      });
  },

  deleteTrustedDeviceItem: () => {
    cy.getByTestSubj('trustedDevicesList-card')
      .first()
      .within(() => {
        cy.getByTestSubj('trustedDevicesList-card-header-actions-button').click();
      });

    cy.getByTestSubj('trustedDevicesList-card-cardDeleteAction').click();
    cy.getByTestSubj('trustedDevicesList-deleteModal-submitButton').click();
  },

  openTrustedDevices: ({ create, itemId }: { create?: boolean; itemId?: string } = {}) => {
    if (!create && !itemId) {
      loadPage(APP_TRUSTED_DEVICES_PATH);
    } else if (create) {
      loadPage(`${APP_TRUSTED_DEVICES_PATH}?show=create`);
    } else if (itemId) {
      loadPage(`${APP_TRUSTED_DEVICES_PATH}?itemId=${itemId}&show=edit`);
    }
  },
};

export const blocklistFormSelectors = {
  expectSingleOperator: (field: 'Path' | 'Signature' | 'Hash') => {
    cy.getByTestSubj('blocklist-form-field-select').contains(field);
    cy.getByTestSubj('blocklist-form-operator-select-single').should('have.value', 'is one of');
    cy.getByTestSubj('blocklist-form-operator-select-single').should('have.attr', 'readonly');
    cy.getByTestSubj('blocklist-form-operator-select-multi').should('not.exist');
  },
  expectMultiOperator: (field: 'Path' | 'Signature' | 'Hash', type = 'is one of') => {
    cy.getByTestSubj('blocklist-form-field-select').contains(field);
    cy.getByTestSubj('blocklist-form-operator-select-multi').contains(type);
    cy.getByTestSubj('blocklist-form-operator-select-multi').should('not.have.attr', 'readonly');
    cy.getByTestSubj('blocklist-form-operator-select-single').should('not.exist');
  },
  selectPathField: (caseless = true) => {
    cy.getByTestSubj('blocklist-form-field-select').click();
    cy.getByTestSubj(
      caseless ? 'blocklist-form-file.path.caseless' : 'blocklist-form-file.path'
    ).click();
  },
  selectSignatureField: () => {
    cy.getByTestSubj('blocklist-form-field-select').click();
    cy.getByTestSubj('blocklist-form-file.Ext.code_signature').click();
  },
  selectOs: (os: 'windows' | 'macos' | 'linux') => {
    cy.getByTestSubj('blocklist-form-os-select').click();
    cy.get(`button[role="option"][id="${os}"]`).click();
  },
  selectOperator: (operator: 'is one of' | 'is') => {
    const matchOperator = operator === 'is' ? 'match' : 'match_any';
    cy.getByTestSubj('blocklist-form-operator-select-multi').click();
    cy.get(`button[role="option"][id="${matchOperator}"]`).click();
  },
  selectHashField: () => {
    cy.getByTestSubj('blocklist-form-field-select').click();
    cy.getByTestSubj('blocklist-form-file.hash.*').click();
  },
  openBlocklist: ({ create, itemId }: { create?: boolean; itemId?: string } = {}) => {
    if (!create && !itemId) {
      loadPage(APP_BLOCKLIST_PATH);
    } else if (create) {
      loadPage(`${APP_BLOCKLIST_PATH}?show=create`);
    } else if (itemId) {
      loadPage(`${APP_BLOCKLIST_PATH}?itemId=${itemId}&show=edit`);
    }
  },
  fillOutBlocklistFlyout: () => {
    cy.getByTestSubj('blocklist-form-name-input').type('Test Blocklist');
    cy.getByTestSubj('blocklist-form-description-input').type('Test Description');
  },
  setMultiValue: () => {
    cy.getByTestSubj('blocklist-form-values-input').within(() => {
      cy.getByTestSubj('comboBoxSearchInput').type(`Elastic, Inc.{enter}`);
    });
  },
  setSingleValue: () => {
    cy.getByTestSubj('blocklist-form-value-input').type('Elastic, Inc.');
  },
  validateMultiValue: ({ empty } = { empty: false }) => {
    if (!empty) {
      cy.getByTestSubj('blocklist-form-values-input').within(() => {
        cy.getByTestSubj('comboBoxInput').within(() => {
          cy.getByTestSubj('blocklist-form-values-input-Elastic');
          cy.getByTestSubj('blocklist-form-values-input- Inc.');
        });
      });
    } else {
      cy.getByTestSubj('blocklist-form-values-input').within(() => {
        cy.getByTestSubj('comboBoxInput').children('span').should('not.exist');
      });
    }
  },
  validateSingleValue: (value = 'Elastic, Inc.') => {
    cy.getByTestSubj('blocklist-form-value-input').should('have.value', value);
  },
  submitBlocklist: () => {
    cy.getByTestSubj('blocklistPage-flyout-submitButton').click();
  },
  expectSubmitButtonToBe: (state: 'disabled' | 'enabled') => {
    cy.getByTestSubj('blocklistPage-flyout-submitButton').should(
      state === 'disabled' ? 'be.disabled' : 'not.be.disabled'
    );
  },
  clearMultiValueInput: () => {
    cy.getByTestSubj('comboBoxClearButton').click();
  },
  validateSuccessPopup: (type: 'create' | 'update' | 'delete') => {
    let expectedTitle: string | RegExp = '';
    switch (type) {
      case 'create':
        expectedTitle = '"Test Blocklist" has been added to your blocklist.';
        break;
      case 'update':
        expectedTitle = /"Test Blocklist" has been updated/;
        break;
      case 'delete':
        expectedTitle = /"Test Blocklist" has been removed from .*blocklist/i;
        break;
    }
    cy.getByTestSubj('euiToastHeader__title').contains(expectedTitle);
  },
  validateRenderedCondition: (expectedCondition: RegExp) => {
    // Wait for flyout to close (after create/update) before looking for the card
    cy.getByTestSubj('blocklistPage-flyout').should('not.exist');
    cy.getByTestSubj('blocklistPage-card')
      .first()
      .within(() => {
        cy.getByTestSubj('blocklistPage-card-criteriaConditions-condition')
          .invoke('text')
          // .should('match', /OS\s*IS\s*Windows/);
          .should('match', expectedCondition);
      });
  },
  deleteBlocklistItem: () => {
    // Wait for list to load and card to appear
    cy.getByTestSubj('blocklistPage-card').should('exist');
    cy.getByTestSubj('blocklistPage-card')
      .first()
      .within(() => {
        cy.getByTestSubj('blocklistPage-card-header-actions-button').click();
      });

    cy.getByTestSubj('blocklistPage-card-cardDeleteAction').click();
    cy.getByTestSubj('blocklistPage-deleteModal-submitButton').click();
  },
};

export const fetchEndpointExceptionPerPolicyOptInStatus = (): Cypress.Chainable<boolean> =>
  request<GetEndpointExceptionsPerPolicyOptInResponse>({
    method: 'GET',
    url: ENDPOINT_EXCEPTIONS_PER_POLICY_OPT_IN_ROUTE,
    headers: { 'elastic-api-version': '1' },
  }).then((response) => response.body.status);

export const enableEndpointExceptionPerPolicyOptIn = () =>
  request<GetEndpointExceptionsPerPolicyOptInResponse>({
    method: 'POST',
    url: ENDPOINT_EXCEPTIONS_PER_POLICY_OPT_IN_ROUTE,
    headers: { 'elastic-api-version': '1' },
    failOnStatusCode: false,
  });

export const resetEndpointExceptionPerPolicyOptInStatus = () => {
  const index = '.kibana_security_solution';
  const id = 'security:reference-data:ENDPOINT-EXCEPTIONS-PER-POLICY-OPT-IN-STATUS';

  return cy.request({
    method: 'DELETE',
    url: `${Cypress.env('ELASTICSEARCH_URL')}/${index}/_doc/${id}`,
    auth: {
      user: Cypress.env('ELASTICSEARCH_USERNAME'),
      pass: Cypress.env('ELASTICSEARCH_PASSWORD'),
    },
    failOnStatusCode: false,
  });
};
