/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, StartServicesAccessor } from '@kbn/core/server';
import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import type { EndpointInternalFleetServicesInterface } from '../../../../endpoint/services/fleet/endpoint_fleet_services_factory';
import type { EndpointAuthz } from '../../../../../common/endpoint/types/authz';
import {
  satisfiesEndpointAuthzRequirement,
  type EndpointAuthzRequirement,
} from '../../../../../common/endpoint/service/authz';
import { EndpointAuthorizationError } from '../../../../endpoint/errors';
import { createRequestScopedReadonlySoClient } from './create_request_scoped_readonly_so_client';

export type PolicyAccessContext = Readonly<{
  spaceId: string;
  fleet: Omit<EndpointInternalFleetServicesInterface, 'getSoClient'> & {
    getSoClient: EndpointInternalFleetServicesInterface['getSoClient'];
  };
}>;

export const createPolicyAccessContext = async (
  endpointAppContextService: EndpointAppContextService,
  input: Readonly<{ request: KibanaRequest; spaceId: string }>,
  requiredAuthz: EndpointAuthzRequirement,
  getStartServices: StartServicesAccessor
): Promise<PolicyAccessContext> => {
  const authz: EndpointAuthz = await endpointAppContextService.getEndpointAuthz(input.request);

  if (!satisfiesEndpointAuthzRequirement(authz, requiredAuthz)) {
    throw new EndpointAuthorizationError();
  }

  const fleet = endpointAppContextService.getInternalFleetServices(input.spaceId);
  const requestScopedSoClient = await createRequestScopedReadonlySoClient({
    getStartServices,
    request: input.request,
  });

  return {
    spaceId: input.spaceId,
    fleet: {
      ...fleet,
      getSoClient: () => requestScopedSoClient,
    },
  };
};
