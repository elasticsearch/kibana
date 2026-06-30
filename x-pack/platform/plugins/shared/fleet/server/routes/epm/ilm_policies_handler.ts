/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FleetRequestHandler } from '../../types';

export const getIlmPoliciesHandler: FleetRequestHandler = async (context, _request, response) => {
  const esClient = (await context.core).elasticsearch.client.asCurrentUser;

  const { has_all_requested: hasManageIlm } = await esClient.security.hasPrivileges({
    cluster: ['manage_ilm'],
  });

  if (!hasManageIlm) {
    return response.ok({ body: { has_manage_ilm: false, items: [] } });
  }

  const lifecycles = await esClient.ilm.getLifecycle();

  // Exclude managed/system policies. ES system policies are named with a leading dot
  // (e.g. `.fleet-ilm-policy`) or have `managed: true` set on the policy object.
  const policyNames = Object.entries(lifecycles)
    .filter(([name, policy]) => {
      if (name.startsWith('.')) {
        return false;
      }
      if ((policy as { managed?: boolean }).managed === true) {
        return false;
      }
      return true;
    })
    .map(([name]) => name)
    .sort();

  return response.ok({ body: { has_manage_ilm: true, items: policyNames } });
};
