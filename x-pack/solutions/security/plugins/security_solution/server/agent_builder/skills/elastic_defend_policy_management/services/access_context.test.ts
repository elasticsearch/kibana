/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StartServicesAccessor } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core/server/mocks';
import {
  ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ,
  ENDPOINT_POLICY_READ_REQUIRED_AUTHZ,
} from '../../../../../common/endpoint/service/authz';
import { getEndpointAuthzInitialStateMock } from '../../../../../common/endpoint/service/authz/mocks';
import { EndpointAuthorizationError } from '../../../../endpoint/errors';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import { createPolicyAccessContext } from './access_context';

const NON_DEFAULT_SPACE_ID = 'space-marketing';

type PrivilegeGrants = Readonly<{
  canReadSecuritySolution: boolean;
  canReadPolicyManagement: boolean;
}>;

const createAccessDeps = (grants: PrivilegeGrants) => {
  const endpointAppContextService = createMockEndpointAppContextService();
  const request = httpServerMock.createKibanaRequest();
  const scopedFleet = endpointAppContextService.getInternalFleetServices();
  const getScopedClient = jest.fn().mockReturnValue({ sentinel: 'request-scoped-so-client' });
  const getStartServices = jest.fn(async () => [
    { savedObjects: { getScopedClient } },
  ]) as unknown as StartServicesAccessor;

  endpointAppContextService.getInternalFleetServices.mockReset();
  endpointAppContextService.getInternalFleetServices.mockReturnValue(scopedFleet);
  endpointAppContextService.getEndpointAuthz.mockResolvedValue(
    getEndpointAuthzInitialStateMock(grants)
  );

  return {
    endpointAppContextService,
    request,
    scopedFleet,
    getScopedClient,
    getStartServices,
  };
};

describe('createPolicyAccessContext', () => {
  it.each([
    {
      requirement: ENDPOINT_POLICY_READ_REQUIRED_AUTHZ,
      grants: { canReadSecuritySolution: false, canReadPolicyManagement: true },
      allowed: true,
    },
    {
      requirement: ENDPOINT_POLICY_READ_REQUIRED_AUTHZ,
      grants: { canReadSecuritySolution: true, canReadPolicyManagement: false },
      allowed: false,
    },
    {
      requirement: ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ,
      grants: { canReadSecuritySolution: true, canReadPolicyManagement: false },
      allowed: true,
    },
    {
      requirement: ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ,
      grants: { canReadSecuritySolution: false, canReadPolicyManagement: true },
      allowed: false,
    },
  ])(
    'evaluates $requirement.all with security=$grants.canReadSecuritySolution policy=$grants.canReadPolicyManagement as $allowed',
    async ({ requirement, grants, allowed }) => {
      const { endpointAppContextService, request, getStartServices } = createAccessDeps(grants);
      const input = { request, spaceId: NON_DEFAULT_SPACE_ID };

      if (allowed) {
        const access = await createPolicyAccessContext(
          endpointAppContextService,
          input,
          requirement,
          getStartServices
        );

        expect(access.spaceId).toBe(NON_DEFAULT_SPACE_ID);
        expect(endpointAppContextService.getEndpointAuthz).toHaveBeenCalledTimes(1);
        expect(endpointAppContextService.getEndpointAuthz).toHaveBeenCalledWith(request);
        expect(endpointAppContextService.getInternalFleetServices).toHaveBeenCalledTimes(1);
        expect(endpointAppContextService.getInternalFleetServices).toHaveBeenCalledWith(
          NON_DEFAULT_SPACE_ID
        );
        expect(getStartServices).toHaveBeenCalledTimes(1);
        return;
      }

      await expect(
        createPolicyAccessContext(endpointAppContextService, input, requirement, getStartServices)
      ).rejects.toBeInstanceOf(EndpointAuthorizationError);
      expect(endpointAppContextService.getEndpointAuthz).toHaveBeenCalledTimes(1);
      expect(endpointAppContextService.getEndpointAuthz).toHaveBeenCalledWith(request);
      expect(endpointAppContextService.getInternalFleetServices).not.toHaveBeenCalled();
      expect(getStartServices).not.toHaveBeenCalled();
    }
  );

  it('rebinds getSoClient to the request-scoped helper client after grants', async () => {
    const { endpointAppContextService, request, scopedFleet, getScopedClient, getStartServices } =
      createAccessDeps({
        canReadSecuritySolution: false,
        canReadPolicyManagement: true,
      });
    const input = { request, spaceId: NON_DEFAULT_SPACE_ID };

    const access = await createPolicyAccessContext(
      endpointAppContextService,
      input,
      ENDPOINT_POLICY_READ_REQUIRED_AUTHZ,
      getStartServices
    );

    expect(getStartServices).toHaveBeenCalledTimes(1);
    expect(getScopedClient).toHaveBeenCalledTimes(1);
    expect(getScopedClient.mock.calls[0][0]).toBe(request);
    expect(access.fleet.getSoClient()).toEqual({ sentinel: 'request-scoped-so-client' });
    expect(access.fleet.getSoClient()).not.toBe(scopedFleet.getSoClient());
  });
});
