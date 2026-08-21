/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SavedObjectsErrorHelpers, type StartServicesAccessor } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core/server/mocks';
import {
  AgentStatusKueryHelper,
  buildPolicyIdOrVariantsKuery,
  buildPolicyIdsOrVariantsKuery as idsVariantsKuery,
} from '@kbn/fleet-plugin/common/services';
import { getEndpointAuthzInitialStateMock } from '../../../../../common/endpoint/service/authz/mocks';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import { ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ } from '../../../../../common/endpoint/service/authz';
import type { PolicyAccessContext } from './access_context';
import { createPolicyAccessContext } from './access_context';
import { countEndpoints } from './count_endpoints';

const SPACE_ID = 'space-marketing';
const EXCLUDE_UNENROLLED_AGENTS_KUERY = `not (${AgentStatusKueryHelper.buildKueryForUnenrolledAgents()})`;
const singleAssignmentKuery = (id: string) =>
  `(policy_base_id:"${id}" or (not policy_base_id:* and ${buildPolicyIdOrVariantsKuery(id)}))`;
const multiAssignmentKuery = (ids: string[]) =>
  `(policy_base_id:(${ids.join(' or ')}) or (not policy_base_id:* and ${idsVariantsKuery(ids)}))`;
const enrolledKuery = (kuery: string) => `(${kuery}) and ${EXCLUDE_UNENROLLED_AGENTS_KUERY}`;
const enrolledCall = (kuery: string) => [undefined, enrolledKuery(kuery)];

type FleetAgentStatus = Awaited<
  ReturnType<PolicyAccessContext['fleet']['agent']['getAgentStatusForAgentPolicy']>
>;

const asFleetAgentStatus = (status: Record<string, unknown>): FleetAgentStatus =>
  status as unknown as FleetAgentStatus;

const createCountAccess = async () => {
  const endpointAppContextService = createMockEndpointAppContextService();
  const getHostMetadataList = jest.fn();
  endpointAppContextService.getEndpointAuthz.mockResolvedValue(
    getEndpointAuthzInitialStateMock({
      canReadSecuritySolution: true,
      canReadPolicyManagement: true,
      canReadEndpointList: true,
      canWritePolicyManagement: false,
    })
  );
  jest.mocked(endpointAppContextService.getEndpointMetadataService).mockReturnValue({
    getHostMetadataList,
  } as unknown as ReturnType<typeof endpointAppContextService.getEndpointMetadataService>);
  const access = await createPolicyAccessContext(
    endpointAppContextService,
    { request: httpServerMock.createKibanaRequest(), spaceId: SPACE_ID },
    ENDPOINT_METADATA_LIST_REQUIRED_AUTHZ,
    jest.fn(async () => [
      { savedObjects: { getScopedClient: jest.fn().mockReturnValue({}) } },
    ]) as unknown as StartServicesAccessor
  );
  return {
    access,
    getAgentStatusForAgentPolicy: jest.spyOn(access.fleet.agent, 'getAgentStatusForAgentPolicy'),
  };
};

describe('countEndpoints', () => {
  it('returns Fleet enrolled-agent totals above the listAgents page size', async () => {
    const { access, getAgentStatusForAgentPolicy } = await createCountAccess();
    const status = {
      all: 21,
    };
    getAgentStatusForAgentPolicy.mockResolvedValue(asFleetAgentStatus(status));

    const result = await countEndpoints(access, { agentPolicyIds: ['agent-policy-a'] });

    expect(getAgentStatusForAgentPolicy.mock.calls).toEqual([
      enrolledCall(singleAssignmentKuery('agent-policy-a')),
    ]);
    expect(result).toEqual({
      population: 'enrolled_agents',
      source: 'fleet_status_aggregation',
      status,
    });
  });

  it('collapses multiple agent-policy ids with version-aware fallback kuery', async () => {
    const { access, getAgentStatusForAgentPolicy } = await createCountAccess();
    const status = { all: 26, active: 20, orphaned: 1, uninstalled: 2 };
    getAgentStatusForAgentPolicy.mockResolvedValue(asFleetAgentStatus(status));

    const result = await countEndpoints(access, {
      agentPolicyIds: ['agent-a', 'agent-a', 'agent-b', 'agent-c'],
    });

    expect(getAgentStatusForAgentPolicy.mock.calls).toEqual([
      enrolledCall(multiAssignmentKuery(['agent-a', 'agent-b', 'agent-c'])),
    ]);
    expect(result.status).toEqual(status);
  });

  it('sums numeric own keys only after a rejected multi-id collapse query', async () => {
    const { access, getAgentStatusForAgentPolicy } = await createCountAccess();
    getAgentStatusForAgentPolicy
      .mockRejectedValueOnce(SavedObjectsErrorHelpers.createBadRequestError('collapse rejected'))
      .mockResolvedValueOnce(
        asFleetAgentStatus({ all: 15, active: 10, orphaned: 1, quarantined: 2, label: 'skip' })
      )
      .mockResolvedValueOnce(asFleetAgentStatus({ all: 8, active: 7, uninstalled: 1 }))
      .mockResolvedValueOnce(asFleetAgentStatus({ all: 3, active: 3, events: 0 }));

    const result = await countEndpoints(access, {
      agentPolicyIds: ['agent-a', 'agent-b', 'agent-c'],
    });

    expect(getAgentStatusForAgentPolicy.mock.calls).toEqual(
      [
        multiAssignmentKuery(['agent-a', 'agent-b', 'agent-c']),
        singleAssignmentKuery('agent-a'),
        singleAssignmentKuery('agent-b'),
        singleAssignmentKuery('agent-c'),
      ].map((kuery) => enrolledCall(kuery))
    );
    expect(result).toEqual({
      population: 'enrolled_agents',
      source: 'fleet_status_aggregation',
      status: { all: 26, active: 20, orphaned: 1, quarantined: 2, uninstalled: 1, events: 0 },
    });
  });

  it('does not fall back to per-id aggregation when collapse fails for a non-query reason', async () => {
    const { access, getAgentStatusForAgentPolicy } = await createCountAccess();
    const unavailable = SavedObjectsErrorHelpers.decorateGeneralError(new Error('unavailable'));
    getAgentStatusForAgentPolicy.mockRejectedValue(unavailable);

    await expect(countEndpoints(access, { agentPolicyIds: ['agent-a', 'agent-b'] })).rejects.toBe(
      unavailable
    );
    expect(getAgentStatusForAgentPolicy.mock.calls).toEqual([
      enrolledCall(multiAssignmentKuery(['agent-a', 'agent-b'])),
    ]);
  });

  it('returns a labelled empty enrolled-agent summary for no assignments', async () => {
    const { access, getAgentStatusForAgentPolicy } = await createCountAccess();

    await expect(countEndpoints(access, { agentPolicyIds: [] })).resolves.toEqual({
      population: 'enrolled_agents',
      source: 'no_agent_policy_assignments',
      status: {},
    });
    expect(getAgentStatusForAgentPolicy).not.toHaveBeenCalled();
  });
});
