/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DATA_VIEW_PATH, INITIAL_REST_VERSION } from '@kbn/data-views-plugin/server/constants';
import { ELASTIC_HTTP_VERSION_HEADER } from '@kbn/core-http-common';
import type {
  GetAllConnectorsResponse,
  ConnectorResponse,
} from '@kbn/actions-plugin/common/routes/connector/response';
import { DETECTION_ENGINE_RULES_BULK_ACTION } from '@kbn/security-solution-plugin/common/constants';
import { ELASTICSEARCH_PASSWORD, ELASTICSEARCH_USERNAME } from '../../env_var_names_constants';
import { deleteAllDocuments } from './elasticsearch';
import { getSpaceUrl } from '../space';
import { DEFAULT_ALERTS_INDEX_PATTERN } from './alerts';

export const ESS_API_AUTH = Object.freeze({
  user: Cypress.env(ELASTICSEARCH_USERNAME),
  pass: Cypress.env(ELASTICSEARCH_PASSWORD),
});

export const API_HEADERS = Object.freeze({
  'kbn-xsrf': 'cypress-creds',
  'x-elastic-internal-origin': 'security-solution',
  [ELASTIC_HTTP_VERSION_HEADER]: [INITIAL_REST_VERSION],
});

export const rootRequest = <T = unknown>({
  headers: optionHeaders = {},
  role = 'admin',
  ...restOptions
}: Partial<Cypress.RequestOptions> & { role?: string }): Cypress.Chainable<Cypress.Response<T>> => {
  if (Cypress.env('IS_SERVERLESS')) {
    return cy.task('getApiKeyForRole', role).then((response) => {
      return cy.request<T>({
        headers: {
          ...API_HEADERS,
          ...optionHeaders,
          Authorization: `ApiKey ${response}`,
        },
        ...restOptions,
      });
    });
  } else {
    return cy.request<T>({
      auth: ESS_API_AUTH,
      headers: {
        ...API_HEADERS,
        ...optionHeaders,
      },
      ...restOptions,
    });
  }
};

// a helper function to wait for the root request to be successful
// defaults to 5 second intervals for 3 attempts
// can be helpful when waiting for a resource to be created before proceeding
export const waitForRootRequest = <T = unknown>(
  fn: Cypress.Chainable<Cypress.Response<T>>,
  interval = 5000,
  timeout = 15000
) =>
  cy.waitUntil(() => fn.then((response) => cy.wrap(response.status === 200)), {
    interval,
    timeout,
  });

export const deleteAlertsAndRules = () => {
  cy.log('Delete all alerts and rules');

  cy.currentSpace().then((spaceId) => {
    const url = spaceId
      ? `/s/${spaceId}${DETECTION_ENGINE_RULES_BULK_ACTION}`
      : DETECTION_ENGINE_RULES_BULK_ACTION;

    rootRequest({
      method: 'POST',
      url,
      body: {
        query: '',
        action: 'delete',
      },
      failOnStatusCode: false,
      timeout: 300000,
    });

    deleteAllDocuments(`.lists-*,.items-*,${DEFAULT_ALERTS_INDEX_PATTERN}`);
  });
};

export const getConnectors = () =>
  rootRequest<GetAllConnectorsResponse>({
    method: 'GET',
    url: 'api/actions/connectors',
  });

export const deleteConnectors = () => {
  cy.log('Deleting connectors...');

  cy.currentSpace().then((spaceId) => {
    getConnectors().then(($response) => {
      const connectors = $response.body;
      const connectorNames = connectors.map((c) => c.name);

      cy.log(`Found ${connectors.length} connectors`, connectorNames);

      connectors.forEach((connector) => {
        deleteConnector(spaceId, connector);
      });
    });
  });
};

const deleteConnector = (spaceId: string, connector: ConnectorResponse) => {
  if (connector.is_preconfigured) {
    // NOTE: Preconfigured connectors can't be deleted.
    // https://www.elastic.co/guide/en/kibana/current/pre-configured-connectors.html
    cy.log(`Skipping connector "${connector.name}" as it's preconfigured`);
    return;
  }

  cy.log(`Deleting connector "${connector.name}"`);
  rootRequest({
    method: 'DELETE',
    url: spaceId
      ? getSpaceUrl(spaceId, `api/actions/connector/${connector.id}`)
      : `api/actions/connector/${connector.id}`,
  });
};

export const deletePrebuiltRulesAssets = () => {
  cy.task('deleteSecurityRulesFromKibana');
};

export const postDataView = (indexPattern: string, name?: string, id?: string) => {
  rootRequest({
    method: 'POST',
    url: DATA_VIEW_PATH,
    body: {
      data_view: {
        id: id || indexPattern,
        name: name || indexPattern,
        fieldAttrs: '{}',
        title: indexPattern,
        timeFieldName: '@timestamp',
      },
    },
    failOnStatusCode: false,
  });
};

export const deleteDataView = (dataViewId: string) => {
  rootRequest({
    method: 'POST',
    url: 'api/content_management/rpc/delete',
    body: {
      contentTypeId: 'index-pattern',
      id: dataViewId,
      options: { force: true },
      version: 1,
    },
    failOnStatusCode: false,
  });
};

/**
 * Refresh an index, making changes available to search.
 * Reusable utility which refreshes all saved object indices, to make them available for search, especially
 * useful when needing to perform a search on an index that has just been written to.
 *
 * An example of this when installing the prebuilt detection rules SO of type 'security-rule':
 * the savedObjectsClient does this with a call with explicit `refresh: false`.
 * So, despite of the fact that the endpoint waits until the prebuilt rule will be
 * successfully indexed, it doesn't wait until they become "visible" for subsequent read
 * operations.
 *
 * Additionally, this method clears the cache for all saved object indices. This helps in cases in which
 * saved object is read, then written to, and then read again, and the second read returns stale data.
 */
export const refreshSavedObjectIndices = (): void => {
  // Refresh indices to prevent a race condition between a write and subsequent read operation. To
  // fix it deterministically we have to refresh saved object indices and wait until it's done.
  cy.task('refreshIndex', { index: '*' });
  // Additionally, we need to clear the cache to ensure that the next read operation will
  // not return stale data.
  cy.task('clearCache');
};
