/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  CLOUD_SERVERLESS,
  ELASTICSEARCH_PASSWORD,
  ELASTICSEARCH_USERNAME,
  IS_SERVERLESS,
} from '../../env_var_names_constants';

const HEADERS = Object.freeze({
  'kbn-xsrf': 'cypress-creds',
  'x-elastic-internal-origin': 'security-solution',
});

/**
 * Persist `hideAnnouncements` globally so agent-builder announcement modals do not block UI.
 * Call after operations that reload Kibana saved objects (e.g. esArchiver), which can reset
 * persisted global settings, and after login when tests do not go through `initializeDataViews`.
 *
 * Intentionally avoids importing from `common.ts` — that file pulls in heavy plugin dependencies
 * that inflate the Cypress support bundle and cause flaky load failures in CI parallel workers.
 */
export const suppressGlobalAnnouncements = () => {
  if (Cypress.env(IS_SERVERLESS) || Cypress.env(CLOUD_SERVERLESS)) {
    cy.task('getApiKeyForRole', 'admin').then((apiKey) => {
      cy.request({
        method: 'POST',
        url: '/internal/kibana/global_settings',
        headers: { ...HEADERS, Authorization: `ApiKey ${apiKey}` },
        body: { changes: { hideAnnouncements: true } },
        failOnStatusCode: false,
      });
    });
  } else {
    cy.request({
      method: 'POST',
      url: '/internal/kibana/global_settings',
      auth: {
        user: Cypress.env(ELASTICSEARCH_USERNAME),
        pass: Cypress.env(ELASTICSEARCH_PASSWORD),
      },
      headers: HEADERS,
      body: { changes: { hideAnnouncements: true } },
      failOnStatusCode: false,
    });
  }
};
