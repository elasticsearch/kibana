/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const deleteRiskEngineConfiguration = () => {
  cy.request({
    method: 'GET',
    url: `/api/saved_objects/_find?type=risk-engine-configuration`,
    failOnStatusCode: false,
    headers: { 'kbn-xsrf': 'cypress-creds', 'x-elastic-internal-origin': 'security-solution' },
  }).then((res) => {
    const savedObjectId = res?.body?.saved_objects?.[0]?.id;
    if (savedObjectId) {
      return cy.request({
        method: 'DELETE',
        url: `/api/saved_objects/risk-engine-configuration/${savedObjectId}`,
        failOnStatusCode: false,
        headers: { 'kbn-xsrf': 'cypress-creds', 'x-elastic-internal-origin': 'security-solution' },
      });
    }
  });
};

export const interceptRiskPreviewError = () => {
  cy.intercept('POST', '/internal/risk_score/preview', {
    statusCode: 500,
  });
};

export const interceptRiskPreviewSuccess = () => {
  cy.intercept('POST', '/internal/risk_score/preview', {
    statusCode: 200,
    body: {
      scores: { host: [], user: [] },
    },
  });
};

export const interceptRiskInitError = () => {
  cy.intercept('POST', '/internal/risk_score/engine/init', {
    statusCode: 500,
  });
};
