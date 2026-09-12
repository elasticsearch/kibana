/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StartServicesAccessor } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core/server/mocks';
import { FleetPackagePolicyGenerator } from '../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import { getEndpointAuthzInitialStateMock } from '../../../../../common/endpoint/service/authz/mocks';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import { EndpointAuthorizationError } from '../../../../endpoint/errors';
import type { ListPoliciesDto } from './list_endpoint_policies';
import { createEndpointPolicyManagementService } from './endpoint_policy_management_service';
import { listEndpointPolicies } from './list_endpoint_policies';
import { countEndpoints } from './count_endpoints';

jest.mock('./list_endpoint_policies', () => ({
  listEndpointPolicies: jest.fn(),
}));

jest.mock('./count_endpoints', () => ({
  countEndpoints: jest.fn(),
}));

const SPACE_ID = 'space-marketing';
const POLICY_ID = 'policy-1';
const mockedlistEndpointPolicies = jest.mocked(listEndpointPolicies);
const mockedCountEndpoints = jest.mocked(countEndpoints);

const generator = new FleetPackagePolicyGenerator();

const createEndpointPolicy = () =>
  generator.generateEndpointPackagePolicy({
    version: 'WzEsMV0=',
    id: POLICY_ID,
    name: 'Endpoint Policy',
    revision: 3,
  });

type Grants = Readonly<{
  canReadSecuritySolution: boolean;
  canReadPolicyManagement: boolean;
}>;

const createServiceDeps = (grants: Grants) => {
  const endpointAppContextService = createMockEndpointAppContextService();
  const request = httpServerMock.createKibanaRequest();
  const scopedFleet = endpointAppContextService.getInternalFleetServices();

  endpointAppContextService.getInternalFleetServices.mockReset();
  endpointAppContextService.getInternalFleetServices.mockImplementation(() => scopedFleet);
  endpointAppContextService.getEndpointAuthz.mockImplementation(async () =>
    getEndpointAuthzInitialStateMock({
      canReadEndpointList: false,
      canWritePolicyManagement: false,
      ...grants,
    })
  );

  const getStartServices = jest.fn(async () => [
    { savedObjects: { getScopedClient: jest.fn().mockReturnValue({}) } },
  ]) as unknown as StartServicesAccessor;

  const getById = jest.spyOn(scopedFleet.packagePolicy, 'get');
  getById.mockResolvedValue(createEndpointPolicy());

  const service = createEndpointPolicyManagementService({
    endpointAppContextService,
    getStartServices,
    request,
    spaceId: SPACE_ID,
  });

  return {
    service,
    endpointAppContextService,
    getStartServices,
    getById,
  };
};

const createListItem = (id: string) => ({
  id,
  name: 'Endpoint Policy',
  description: 'visible description',
  revision: 3,
  version: 'WzEsMV0=',
  normalizedHash: 'list-hash',
  posture: {
    windowsProtectionModes: {
      malware: 'prevent',
      ransomware: 'prevent',
      memoryThreat: 'prevent',
      behavior: 'prevent',
    },
    macProtectionModes: { malware: 'prevent', behavior: 'prevent' },
    linuxProtectionModes: { malware: 'prevent', behavior: 'prevent' },
    globalTelemetryEnabled: false,
  },
});

const createListDto = (): ListPoliciesDto => ({
  population: 'endpoint_package_policies',
  page: 1,
  per_page: 20,
  items: [createListItem(POLICY_ID)],
  value_total: 1,
  has_more: false,
  invalid_policy_count: 0,
});

describe('createEndpointPolicyManagementService', () => {
  afterEach(() => {
    mockedlistEndpointPolicies.mockReset();
    mockedCountEndpoints.mockReset();
  });

  describe('authorization matrix', () => {
    const assessPolicyChange = (service: ReturnType<typeof createServiceDeps>['service']) =>
      service.assessPolicyChange({
        idOrName: POLICY_ID,
        changes: [{ op: 'set_field', path: 'windows.malware.mode', value: 'detect' }],
      });

    it.each([
      {
        name: 'getPolicy requires policy-read',
        grants: { canReadSecuritySolution: true, canReadPolicyManagement: false },
        call: (service: ReturnType<typeof createServiceDeps>['service']) =>
          service.getPolicy({ idOrName: POLICY_ID }),
      },
      {
        name: 'listPolicies usage requires policy-read before the page',
        grants: { canReadSecuritySolution: true, canReadPolicyManagement: false },
        call: (service: ReturnType<typeof createServiceDeps>['service']) =>
          service.listPolicies({ page: 1, perPage: 20, includeEndpointUsage: true }),
      },
      {
        name: 'assessPolicyChange requires policy-read',
        grants: { canReadSecuritySolution: true, canReadPolicyManagement: false },
        call: assessPolicyChange,
      },
      {
        name: 'assessPolicyChange requires metadata-list',
        grants: { canReadSecuritySolution: false, canReadPolicyManagement: true },
        call: assessPolicyChange,
      },
      {
        name: 'getPolicyRolloutStatus requires metadata-list',
        grants: { canReadSecuritySolution: false, canReadPolicyManagement: true },
        call: (service: ReturnType<typeof createServiceDeps>['service']) =>
          service.getPolicyRolloutStatus({ idOrName: POLICY_ID }),
      },
    ])('$name and refuses before any protected read', async ({ grants, call }) => {
      const deps = createServiceDeps(grants);

      await expect(call(deps.service)).rejects.toBeInstanceOf(EndpointAuthorizationError);
      expect(deps.endpointAppContextService.getInternalFleetServices).not.toHaveBeenCalled();
      expect(deps.getStartServices).not.toHaveBeenCalled();
      expect(deps.getById).not.toHaveBeenCalled();
    });
  });

  describe('listPolicies usage', () => {
    it('returns the already-read page with usage_unavailable and no enrollment I/O when metadata-list is denied', async () => {
      const deps = createServiceDeps({
        canReadSecuritySolution: false,
        canReadPolicyManagement: true,
      });
      mockedlistEndpointPolicies.mockResolvedValue({
        dto: createListDto(),
        assignmentsById: new Map(),
      });

      const result = await deps.service.listPolicies({
        page: 1,
        perPage: 20,
        includeEndpointUsage: true,
      });

      expect(deps.endpointAppContextService.getEndpointAuthz).toHaveBeenCalledTimes(2);
      expect(result).toEqual(
        expect.objectContaining({
          population: 'endpoint_package_policies',
          page: 1,
          per_page: 20,
          value_total: 1,
          usage_unavailable: 'requires_endpoint_list_read',
        })
      );
      expect(result.items[0]).toEqual({
        ...createListItem(POLICY_ID),
        usage: { classification: 'undetermined', reason: 'requires_endpoint_list_read' },
      });
      expect(mockedCountEndpoints).not.toHaveBeenCalled();
    });
  });
});
