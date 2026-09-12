/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StartServicesAccessor } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core/server/mocks';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import { FleetPackagePolicyGenerator } from '../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import { getEndpointAuthzInitialStateMock } from '../../../../../common/endpoint/service/authz/mocks';
import { ProtectionModes } from '../../../../../common/endpoint/types';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import * as normalizedEndpointPolicyModule from '../domain/normalized_endpoint_policy';
import { hashPolicyConfig } from '../domain/hash_policy_config';
import { normalize } from '../domain/normalize_policy_config';
import { ENDPOINT_POLICY_READ_REQUIRED_AUTHZ } from '../../../../../common/endpoint/service/authz';
import { createPolicyAccessContext } from './access_context';
import { listEndpointPolicies } from './list_endpoint_policies';

const SPACE_ID = 'space-marketing';
const generator = new FleetPackagePolicyGenerator();

const createEndpointPolicy = (
  overrides: Parameters<FleetPackagePolicyGenerator['generateEndpointPackagePolicy']>[0] = {}
) =>
  generator.generateEndpointPackagePolicy({
    version: 'WzEsMV0=',
    ...overrides,
  });

const createReadAccess = async () => {
  const endpointAppContextService = createMockEndpointAppContextService();
  const request = httpServerMock.createKibanaRequest();

  endpointAppContextService.getEndpointAuthz.mockResolvedValue(
    getEndpointAuthzInitialStateMock({
      canReadPolicyManagement: true,
      canReadEndpointList: false,
      canWritePolicyManagement: false,
    })
  );

  const getStartServices = jest.fn(async () => [
    { savedObjects: { getScopedClient: jest.fn().mockReturnValue({}) } },
  ]) as unknown as StartServicesAccessor;
  const access = await createPolicyAccessContext(
    endpointAppContextService,
    { request, spaceId: SPACE_ID },
    ENDPOINT_POLICY_READ_REQUIRED_AUTHZ,
    getStartServices
  );
  const soClient = access.fleet.getSoClient();
  const listPolicies = jest.spyOn(access.fleet.packagePolicy, 'list');

  return {
    access,
    soClient,
    listPolicies,
  };
};

const createPage = (items: PackagePolicy[], total: number, page: number, perPage: number) => ({
  items,
  total,
  page,
  perPage,
});

describe('listEndpointPolicies', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns has_more false when Fleet total equals the requested page', async () => {
    const { access, soClient, listPolicies } = await createReadAccess();
    const items = Array.from({ length: 20 }, (_, index) =>
      createEndpointPolicy({ id: `policy-${index}`, name: `Policy ${index}` })
    );
    listPolicies.mockResolvedValue(createPage(items, 20, 1, 20));

    const result = await listEndpointPolicies(access, { page: 1, perPage: 20 });

    expect(listPolicies).toHaveBeenCalledTimes(1);
    expect(listPolicies).toHaveBeenCalledWith(soClient, {
      kuery: access.fleet.endpointPolicyKuery,
      page: 1,
      perPage: 20,
      spaceId: SPACE_ID,
    });
    expect(result.dto).toEqual(
      expect.objectContaining({
        population: 'endpoint_package_policies',
        page: 1,
        per_page: 20,
        value_total: 20,
        has_more: false,
        invalid_policy_count: 0,
      })
    );
    expect(result.dto.items).toHaveLength(20);
  });

  it('returns has_more true and 20 rows when Fleet total is 21', async () => {
    const { access, listPolicies } = await createReadAccess();
    const items = Array.from({ length: 20 }, (_, index) =>
      createEndpointPolicy({ id: `policy-${index}`, name: `Policy ${index}` })
    );
    listPolicies.mockResolvedValue(createPage(items, 21, 1, 20));

    const result = await listEndpointPolicies(access, { page: 1, perPage: 20 });

    expect(result.dto.has_more).toBe(true);
    expect(result.dto.value_total).toBe(21);
    expect(result.dto.items).toHaveLength(20);
  });

  it('clamps perPage to 50 and forwards that bound to Fleet', async () => {
    const { access, soClient, listPolicies } = await createReadAccess();
    const items = Array.from({ length: 50 }, (_, index) =>
      createEndpointPolicy({ id: `policy-${index}`, name: `Policy ${index}` })
    );
    listPolicies.mockResolvedValue(createPage(items, 50, 1, 50));

    const result = await listEndpointPolicies(access, { page: 1, perPage: 100 });

    expect(listPolicies).toHaveBeenCalledWith(
      soClient,
      expect.objectContaining({
        perPage: 50,
      })
    );
    expect(result.dto.per_page).toBe(50);
    expect(result.dto.items).toHaveLength(50);
  });

  it('skips mixed malformed rows and keeps page-local invalid_policy_count', async () => {
    const { access, listPolicies } = await createReadAccess();
    const valid = createEndpointPolicy({ id: 'valid-id', name: 'Valid Policy' });
    const missingInputs = generator.generate({
      id: 'input-less',
      name: 'Input Less',
      version: 'WzEsMV0=',
      inputs: [],
    });
    const missingVersion = createEndpointPolicy({ id: 'missing-version', name: 'Missing Version' });
    delete missingVersion.version;
    listPolicies.mockResolvedValue(createPage([valid, missingInputs, missingVersion], 3, 1, 20));

    const result = await listEndpointPolicies(access, { page: 1, perPage: 20 });

    expect(result.dto.items.map((item) => item.id)).toEqual(['valid-id']);
    expect(result.dto.invalid_policy_count).toBe(2);
  });

  it('propagates unexpected conversion failures instead of counting them invalid', async () => {
    const { access, listPolicies } = await createReadAccess();
    const boom = new RangeError('unexpected conversion failure');
    const spy = jest
      .spyOn(normalizedEndpointPolicyModule, 'normalizeEndpointPolicy')
      .mockImplementation(() => {
        throw boom;
      });
    listPolicies.mockResolvedValue(
      createPage([createEndpointPolicy({ id: 'broken-id', name: 'Broken Policy' })], 1, 1, 20)
    );

    await expect(listEndpointPolicies(access, { page: 1, perPage: 20 })).rejects.toBe(boom);
    expect(spy).toHaveBeenCalled();
  });

  it('returns only whitelisted identity, hash, and compact posture', async () => {
    const { access, listPolicies } = await createReadAccess();
    const policy = createEndpointPolicy({
      id: 'policy-id-2',
      name: 'Whitelist Policy',
      description: 'visible description',
      spaceIds: ['other-space'],
      created_by: 'creator',
      created_at: '2020-01-01T00:00:00.000Z',
      agents: 424242,
      policy_ids: ['agent-policy-secret'],
    });
    Object.assign(policy.inputs[0], { compiled_input: { secret: 'compiled-secret' } });
    listPolicies.mockResolvedValue(createPage([policy], 1, 1, 20));

    const result = await listEndpointPolicies(access, { page: 1, perPage: 20 });
    const [item] = result.dto.items;

    expect(item).toBeDefined();
    expect(Object.keys(item ?? {}).sort()).toEqual(
      [
        'description',
        'id',
        'name',
        'normalizedHash',
        'packageVersion',
        'posture',
        'revision',
        'updatedAt',
        'version',
      ].sort()
    );
    expect(item).toEqual({
      id: 'policy-id-2',
      name: 'Whitelist Policy',
      description: 'visible description',
      revision: policy.revision,
      version: 'WzEsMV0=',
      updatedAt: policy.updated_at,
      packageVersion: policy.package?.version,
      normalizedHash: hashPolicyConfig(normalize(policy.inputs[0].config.policy.value)),
      posture: {
        windowsProtectionModes: {
          malware: ProtectionModes.prevent,
          ransomware: ProtectionModes.prevent,
          memoryThreat: ProtectionModes.prevent,
          behavior: ProtectionModes.prevent,
        },
        macProtectionModes: {
          malware: ProtectionModes.prevent,
          behavior: ProtectionModes.prevent,
        },
        linuxProtectionModes: {
          malware: ProtectionModes.prevent,
          behavior: ProtectionModes.prevent,
        },
        globalTelemetryEnabled: false,
      },
    });
    expect(result.assignmentsById.get('policy-id-2')).toEqual(['agent-policy-secret']);
    expect(result.dto).not.toHaveProperty('inputs');
    expect(result.dto).not.toHaveProperty('normalizedConfig');
    expect(JSON.stringify(result.dto)).not.toContain('compiled-secret');
    expect(JSON.stringify(result.dto)).not.toContain('other-space');
    expect(JSON.stringify(result.dto)).not.toContain('creator');
    expect(JSON.stringify(result.dto)).not.toContain('agent-policy-secret');
    expect(JSON.stringify(result.dto)).not.toContain('424242');
    expect(JSON.stringify(result.dto)).not.toContain('windows.events');
    expect(item).not.toHaveProperty('inputs');
    expect(item).not.toHaveProperty('config');
    expect(item).not.toHaveProperty('normalizedConfig');
    expect(item).not.toHaveProperty('policy_ids');
    expect(item).not.toHaveProperty('agents');
  });

  it('caps long name and description at 512 and flags only the cut fields', async () => {
    const { access, listPolicies } = await createReadAccess();
    const longName = 'N'.repeat(600);
    const longDescription = 'D'.repeat(600);
    const policy = createEndpointPolicy({
      id: 'long-strings',
      name: longName,
      description: longDescription,
    });
    listPolicies.mockResolvedValue(createPage([policy], 1, 1, 20));

    const result = await listEndpointPolicies(access, { page: 1, perPage: 20 });
    const [item] = result.dto.items;

    expect(item?.name).toBe('N'.repeat(512));
    expect(item?.description).toBe('D'.repeat(512));
    expect(item?.name_string_truncated).toBe(true);
    expect(item?.description_string_truncated).toBe(true);
  });
});
