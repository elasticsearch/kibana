/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { rootRequest } from './common';

/**
 * Deletes all existing Fleet packages, package policies, agent policies, and agents.
 */
export const cleanFleet = (): Cypress.Chainable => {
  // NOTE: order does matter.
  return deleteAgents()
    .then(() => {
      return deletePackagePolicies();
    })
    .then(() => {
      return deletePackages();
    })
    .then(() => {
      return deleteAgentPolicies();
    });
};

const deleteAgents = () => {
  return rootRequest<{ items: Array<{ id: string }> }>({
    method: 'GET',
    url: 'api/fleet/agents?perPage=1000',
  }).then((response) => {
    if (response.body.items && response.body.items.length > 0) {
      // Delete agents in parallel
      const deletePromises = response.body.items.map((agent: { id: string }) =>
        rootRequest({
          method: 'DELETE',
          url: `api/fleet/agents/${agent.id}`,
          failOnStatusCode: false, // Don't fail if agent is already deleted
        })
      );
      return Cypress.Promise.all(deletePromises);
    }
  });
};

const deleteAgentPolicies = () => {
  return rootRequest<{ items: Array<{ id: string }> }>({
    method: 'GET',
    url: 'api/fleet/agent_policies',
  }).then((response) => {
    response.body.items.forEach((item: { id: string }) => {
      rootRequest({
        method: 'POST',
        url: `api/fleet/agent_policies/delete`,
        body: {
          agentPolicyId: item.id,
        },
      });
    });
  });
};

const deletePackagePolicies = () => {
  return rootRequest<{ items: Array<{ id: string }> }>({
    method: 'GET',
    url: 'api/fleet/package_policies',
  }).then((response) => {
    rootRequest({
      method: 'POST',
      url: `api/fleet/package_policies/delete`,
      body: {
        packagePolicyIds: response.body.items.map((item: { id: string }) => item.id),
      },
    });
  });
};

const deletePackages = () => {
  return rootRequest<{ items: Array<{ status: string; name: string; version: string }> }>({
    method: 'GET',
    url: 'api/fleet/epm/packages',
  }).then((response) => {
    response.body.items.forEach((item) => {
      if (item.status === 'installed') {
        rootRequest({
          method: 'DELETE',
          url: `api/fleet/epm/packages/${item.name}/${item.version}`,
        });
      }
    });
  });
};
