/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SavedObjectsErrorHelpers, type StartServicesAccessor } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core/server/mocks';
import { licenseMock } from '@kbn/licensing-plugin/common/licensing.mock';
import { FleetPackagePolicyGenerator } from '../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import { getEndpointAuthzInitialStateMock } from '../../../../../common/endpoint/service/authz/mocks';
import type { PolicyConfig } from '../../../../../common/endpoint/types';
import { ProtectionModes } from '../../../../../common/endpoint/types';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import { ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ } from '../../../../../common/endpoint/service/authz';
import type { PolicyAccessContext } from './access_context';
import { createPolicyAccessContext } from './access_context';
import { assessChange } from './assess_change';
import type { EndpointCountResult } from './count_endpoints';
import * as countEndpointsModule from './count_endpoints';

const SPACE_ID = 'space-marketing';
const generator = new FleetPackagePolicyGenerator();

const MIXED_STATUS_ABOVE_PAGE: Readonly<Record<string, number>> = {
  all: 27,
  active: 22,
  online: 14,
  offline: 6,
  updating: 3,
  error: 2,
  inactive: 1,
  unenrolled: 2,
  events: 0,
  other: 1,
  orphaned: 1,
  uninstalled: 1,
};

type FleetAgentStatus = Awaited<
  ReturnType<PolicyAccessContext['fleet']['agent']['getAgentStatusForAgentPolicy']>
>;

const asFleetAgentStatus = (status: Record<string, unknown>): FleetAgentStatus =>
  status as unknown as FleetAgentStatus;

const createEndpointPolicy = (
  overrides: Parameters<FleetPackagePolicyGenerator['generateEndpointPackagePolicy']>[0] = {}
) =>
  generator.generateEndpointPackagePolicy({
    version: 'WzEsMV0=',
    ...overrides,
  });

const rawParams = (idOrName = 'policy-id-1'): unknown => ({
  idOrName,
  changes: [{ op: 'set_field', path: 'windows.malware.mode', value: ProtectionModes.detect }],
});

const requireStoredPolicy = (policy: ReturnType<typeof createEndpointPolicy>): PolicyConfig => {
  const storedPolicy = policy.inputs[0]?.config?.policy?.value;
  if (storedPolicy == null) {
    throw new Error('expected generated endpoint package policy to include config.policy');
  }
  return storedPolicy;
};

const Gold = licenseMock.createLicense({ license: { type: 'gold', mode: 'gold' } });
const Enterprise = licenseMock.createLicense({ license: { type: 'enterprise' } });

const createCountAccess = async () => {
  const endpointAppContextService = createMockEndpointAppContextService();
  const request = httpServerMock.createKibanaRequest();
  const getHostMetadataList = jest.fn().mockResolvedValue({
    data: Array.from({ length: 10 }, (_, index) => ({ id: `host-${index}` })),
    total: 11,
  });

  endpointAppContextService.getEndpointAuthz.mockResolvedValue(
    getEndpointAuthzInitialStateMock({
      canReadPolicyManagement: true,
      canReadEndpointList: true,
      canWritePolicyManagement: false,
    })
  );
  jest.mocked(endpointAppContextService.getEndpointMetadataService).mockReturnValue({
    getHostMetadataList,
  } as unknown as ReturnType<typeof endpointAppContextService.getEndpointMetadataService>);

  const getStartServices = jest.fn(async () => [
    { savedObjects: { getScopedClient: jest.fn().mockReturnValue({}) } },
  ]) as unknown as StartServicesAccessor;
  const access = await createPolicyAccessContext(
    endpointAppContextService,
    { request, spaceId: SPACE_ID },
    ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ,
    getStartServices
  );
  const licenseService = endpointAppContextService.getLicenseService();
  licenseService.getLicenseType = jest.fn(() => 'enterprise');
  licenseService.getLicenseInformation = jest.fn(() => Enterprise);
  licenseService.isPlatinumPlus = jest.fn(() => true);
  licenseService.isEnterprise = jest.fn(() => true);
  const getById = jest.spyOn(access.fleet.packagePolicy, 'get');
  const listByName = jest.spyOn(access.fleet.packagePolicy, 'list');
  const ensureInCurrentSpace = jest.spyOn(access.fleet, 'ensureInCurrentSpace');
  const getAgentStatusForAgentPolicy = jest.spyOn(
    access.fleet.agent,
    'getAgentStatusForAgentPolicy'
  );

  ensureInCurrentSpace.mockResolvedValue(undefined);

  return {
    access,
    endpointAppContextService,
    getById,
    listByName,
    getAgentStatusForAgentPolicy,
  };
};

describe('assessChange', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('counts the resolved policy id after a name lookup and preserves mixed statuses above 20', async () => {
    const { access, endpointAppContextService, getById, listByName, getAgentStatusForAgentPolicy } =
      await createCountAccess();
    const policy = createEndpointPolicy({
      id: 'named-id',
      name: 'Exact Name',
      policy_ids: ['agent-policy-a'],
    });
    getById
      .mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createGenericNotFoundError('fleet-package-policies', 'Exact Name')
      )
      .mockResolvedValue(policy);
    listByName.mockResolvedValue({
      items: [policy],
      total: 1,
      page: 1,
      perPage: 11,
    });
    getAgentStatusForAgentPolicy.mockResolvedValue(asFleetAgentStatus(MIXED_STATUS_ABOVE_PAGE));
    const countSpy = jest.spyOn(countEndpointsModule, 'countEndpoints');

    const result = await assessChange(access, endpointAppContextService, rawParams('Exact Name'));

    expect(countSpy).toHaveBeenCalledTimes(1);
    expect(countSpy).toHaveBeenCalledWith(access, { agentPolicyIds: ['agent-policy-a'] });
    expect(getById).toHaveBeenCalledTimes(1);
    expect(result.assessment.policy.snapshot.identity).toEqual(
      expect.objectContaining({
        id: 'named-id',
        name: 'Exact Name',
        revision: policy.revision,
        version: 'WzEsMV0=',
      })
    );
  });

  it('does not count when preparation refuses the request', async () => {
    const { access, endpointAppContextService, getById, getAgentStatusForAgentPolicy } =
      await createCountAccess();
    getById.mockResolvedValue(
      createEndpointPolicy({
        id: 'policy-id-1',
        policy_ids: ['agent-policy-a'],
      })
    );
    const countSpy = jest.spyOn(countEndpointsModule, 'countEndpoints');

    await expect(
      assessChange(access, endpointAppContextService, {
        idOrName: 'policy-id-1',
        changes: [{ op: 'set_field', path: 'windows.popup.device_control.enabled', value: true }],
      })
    ).rejects.toMatchObject({
      name: 'PolicyChangePreparationError',
      code: 'unsupported_operation',
    });
    expect(countSpy).not.toHaveBeenCalled();
    expect(getAgentStatusForAgentPolicy).not.toHaveBeenCalled();
  });

  it('passes a complete enrolled-agent count map through without adapting it', async () => {
    const { access, endpointAppContextService, getById } = await createCountAccess();
    getById.mockResolvedValue(
      createEndpointPolicy({
        id: 'policy-id-1',
        policy_ids: ['agent-policy-a'],
      })
    );
    const blastRadius: EndpointCountResult = {
      population: 'enrolled_agents',
      source: 'fleet_status_aggregation',
      status: MIXED_STATUS_ABOVE_PAGE,
    };
    jest.spyOn(countEndpointsModule, 'countEndpoints').mockResolvedValue(blastRadius);

    const result = await assessChange(access, endpointAppContextService, rawParams());

    expect(result.enrollment).toBe(blastRadius);
  });

  it('reads serverless from the endpoint app context for eligibility', async () => {
    const { access, endpointAppContextService, getById, getAgentStatusForAgentPolicy } =
      await createCountAccess();
    const isServerlessSpy = jest
      .spyOn(endpointAppContextService, 'isServerless')
      .mockReturnValue(true);
    endpointAppContextService.getLicenseService().getLicenseInformation = jest.fn(() => Gold);
    const policy = createEndpointPolicy({
      id: 'policy-id-1',
      policy_ids: ['agent-policy-a'],
    });
    requireStoredPolicy(policy).windows.ransomware.mode = ProtectionModes.off;
    getById.mockResolvedValue(policy);
    getAgentStatusForAgentPolicy.mockResolvedValue(asFleetAgentStatus(MIXED_STATUS_ABOVE_PAGE));

    const result = await assessChange(access, endpointAppContextService, {
      idOrName: 'policy-id-1',
      changes: [
        { op: 'set_protection_level', protection: 'ransomware', mode: ProtectionModes.prevent },
      ],
    });

    expect(isServerlessSpy).toHaveBeenCalled();
    expect(
      result.assessment.changes.find((change) => change.path === 'windows.ransomware.mode')
        ?.eligibility
    ).toEqual({ eligible: true });
  });
});
