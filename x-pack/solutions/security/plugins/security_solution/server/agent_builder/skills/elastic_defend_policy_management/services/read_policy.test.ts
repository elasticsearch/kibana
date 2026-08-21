/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SavedObjectsErrorHelpers, type StartServicesAccessor } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core/server/mocks';
import { escapeKuery, escapeQuotes } from '@kbn/es-query';
import { PACKAGE_POLICY_SAVED_OBJECT_TYPE, type PackagePolicy } from '@kbn/fleet-plugin/common';
import {
  FleetUnauthorizedError,
  PackagePolicyNotFoundError,
} from '@kbn/fleet-plugin/server/errors';
import { FleetPackagePolicyGenerator } from '../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import { getEndpointAuthzInitialStateMock } from '../../../../../common/endpoint/service/authz/mocks';
import { NotFoundError } from '../../../../endpoint/errors';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';
import { hashPolicyConfig } from '../domain/hash_policy_config';
import { normalize } from '../domain/normalize_policy_config';
import { ENDPOINT_POLICY_READ_REQUIRED_AUTHZ } from '../../../../../common/endpoint/service/authz';
import { createPolicyAccessContext } from './access_context';
import {
  InvalidEndpointPolicyError,
  PolicyAmbiguousNameError,
  PolicyNotFoundError,
} from './policy_errors';
import { getEndpointPolicy } from './read_policy';

jest.mock('../domain/normalize_policy_config', () => {
  const actual = jest.requireActual(
    '../domain/normalize_policy_config'
  ) as typeof import('../domain/normalize_policy_config');
  return {
    ...actual,
    normalize: jest.fn(actual.normalize),
  };
});

const SPACE_ID = 'space-marketing';
const generator = new FleetPackagePolicyGenerator();

const createEndpointPolicy = (
  overrides: Parameters<FleetPackagePolicyGenerator['generateEndpointPackagePolicy']>[0] = {}
) =>
  generator.generateEndpointPackagePolicy({
    version: 'WzEsMV0=',
    ...overrides,
  });

const createCurrentSpaceEndpointRow = (id: string, storedPolicyValue: unknown): PackagePolicy => {
  const policy = createEndpointPolicy({ id, name: 'Current Space Policy' });
  const row: PackagePolicy = policy;
  const policyEntry = row.inputs[0]?.config?.policy;
  if (policyEntry == null) {
    throw new Error('expected generated endpoint package policy to include config.policy');
  }
  policyEntry.value = storedPolicyValue;
  return row;
};

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
  const getById = jest.spyOn(access.fleet.packagePolicy, 'get');
  const listByName = jest.spyOn(access.fleet.packagePolicy, 'list');
  const ensureInCurrentSpace = jest.spyOn(access.fleet, 'ensureInCurrentSpace');
  ensureInCurrentSpace.mockResolvedValue(undefined);

  return { access, soClient, getById, listByName, ensureInCurrentSpace };
};

const expectedNameKuery = (name: string): string =>
  `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name: "endpoint" AND ${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.name:"${escapeQuotes(
    name
  )}"`;

const unquotedEscaperNameKuery = (name: string): string =>
  `${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.package.name: "endpoint" AND ${PACKAGE_POLICY_SAVED_OBJECT_TYPE}.name:"${escapeKuery(
    name
  )}"`;

describe('getEndpointPolicy', () => {
  it('resolves a trimmed saved-object id and does not search by name', async () => {
    const { access, soClient, getById, listByName, ensureInCurrentSpace } =
      await createReadAccess();
    const policy = createEndpointPolicy({ id: 'policy-id-1', name: 'Endpoint Policy' });
    getById.mockResolvedValue(policy);

    const result = await getEndpointPolicy(access, { idOrName: '  policy-id-1  ' });

    expect(getById).toHaveBeenCalledWith(soClient, 'policy-id-1', {
      spaceId: SPACE_ID,
    });
    expect(listByName).not.toHaveBeenCalled();
    expect(ensureInCurrentSpace).toHaveBeenCalledWith({
      integrationPolicyIds: ['policy-id-1'],
    });
    expect(result.policy.id).toBe('policy-id-1');
  });

  it('fails closed on a non-endpoint id without name fallback', async () => {
    const { access, getById, listByName, ensureInCurrentSpace } = await createReadAccess();
    getById.mockResolvedValue(
      generator.generate({
        id: 'system-policy',
        name: 'System',
        version: 'WzEsMV0=',
        package: { name: 'system', title: 'System', version: '1.0.0' },
      })
    );

    await expect(getEndpointPolicy(access, { idOrName: 'system-policy' })).rejects.toBeInstanceOf(
      PolicyNotFoundError
    );
    expect(listByName).not.toHaveBeenCalled();
    expect(ensureInCurrentSpace).not.toHaveBeenCalled();
  });

  it.each([
    [
      'saved-object 404',
      SavedObjectsErrorHelpers.createGenericNotFoundError('fleet-package-policies', 'missing'),
    ],
    ['null miss', null],
  ])('falls through to exact name lookup after %s', async (_label, miss) => {
    const { access, soClient, getById, listByName } = await createReadAccess();
    const named = createEndpointPolicy({ id: 'named-id', name: 'Exact Name' });

    if (miss === null) {
      getById.mockResolvedValue(null);
    } else {
      getById.mockRejectedValue(miss);
    }
    listByName.mockResolvedValue({
      items: [named],
      total: 1,
      page: 1,
      perPage: 11,
    });

    const result = await getEndpointPolicy(access, { idOrName: 'Exact Name' });

    expect(result.policy.id).toBe('named-id');
    expect(listByName).toHaveBeenCalledWith(soClient, {
      kuery: expectedNameKuery('Exact Name'),
      page: 1,
      perPage: 11,
      spaceId: SPACE_ID,
    });
  });

  it.each([['authorization', new FleetUnauthorizedError('forbidden')]])(
    'rethrows %s from id lookup without name fallback',
    async (_label, error) => {
      const { access, getById, listByName } = await createReadAccess();
      getById.mockRejectedValue(error);

      await expect(getEndpointPolicy(access, { idOrName: 'policy-1' })).rejects.toBe(error);
      expect(listByName).not.toHaveBeenCalled();
    }
  );

  it('resolves the named policy rather than a sibling that embeds that name when the unquoted escaper would change the literal', async () => {
    const { access, soClient, getById, listByName } = await createReadAccess();
    const requestedName = 'Windows (Default)';
    const correct = createEndpointPolicy({ id: 'correct-id', name: requestedName });
    const sibling = createEndpointPolicy({
      id: 'sibling-id',
      name: 'Windows (Default) copy',
    });
    getById.mockRejectedValue(SavedObjectsErrorHelpers.createGenericNotFoundError());

    const quotedKuery = expectedNameKuery(requestedName);
    const oldEscaperKuery = unquotedEscaperNameKuery(requestedName);
    expect(quotedKuery).toBe(
      'fleet-package-policies.package.name: "endpoint" AND fleet-package-policies.name:"Windows (Default)"'
    );
    expect(oldEscaperKuery).toBe(
      'fleet-package-policies.package.name: "endpoint" AND fleet-package-policies.name:"Windows \\(Default\\)"'
    );

    listByName.mockImplementation(async (_soClient, options) => {
      if (options.kuery === oldEscaperKuery) {
        return { items: [sibling], total: 1, page: 1, perPage: 11 };
      }
      if (options.kuery === quotedKuery) {
        return { items: [correct], total: 1, page: 1, perPage: 11 };
      }
      return { items: [], total: 0, page: 1, perPage: 11 };
    });

    const result = await getEndpointPolicy(access, { idOrName: requestedName });

    expect(result.policy).toEqual(
      expect.objectContaining({ id: 'correct-id', name: requestedName })
    );
    expect(listByName).toHaveBeenCalledWith(soClient, {
      kuery: quotedKuery,
      page: 1,
      perPage: 11,
      spaceId: SPACE_ID,
    });
  });

  it('returns not found when the exact name matches nothing', async () => {
    const { access, getById, listByName, ensureInCurrentSpace } = await createReadAccess();
    getById.mockRejectedValue(SavedObjectsErrorHelpers.createGenericNotFoundError());
    listByName.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      perPage: 11,
    });

    await expect(getEndpointPolicy(access, { idOrName: 'Missing' })).rejects.toMatchObject({
      name: 'PolicyNotFoundError',
      message: 'Endpoint policy not found',
    });
    expect(ensureInCurrentSpace).not.toHaveBeenCalled();
  });

  it('bounds fat ambiguous name rows and reports truncation', async () => {
    const { access, getById, listByName, ensureInCurrentSpace } = await createReadAccess();
    const fatItems = Array.from({ length: 11 }, (_, index) =>
      createEndpointPolicy({
        id: `dup-${index}`,
        name: 'Shared Name',
        description: 'should not leak',
        revision: index + 1,
      })
    );
    getById.mockRejectedValue(SavedObjectsErrorHelpers.createGenericNotFoundError());
    listByName.mockResolvedValue({
      items: fatItems,
      total: 15,
      page: 1,
      perPage: 11,
    });

    try {
      await getEndpointPolicy(access, { idOrName: 'Shared Name' });
      throw new Error('expected PolicyAmbiguousNameError');
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyAmbiguousNameError);
      if (!(error instanceof PolicyAmbiguousNameError)) {
        throw error;
      }
      expect(error.candidates).toHaveLength(10);
      expect(error.candidatesTotal).toBe(15);
      expect(error.candidatesTruncated).toBe(true);
      expect(error.candidates[0]).toEqual({ id: 'dup-0', name: 'Shared Name' });
      expect(Object.keys(error.candidates[0])).toEqual(['id', 'name']);
      expect(error.candidates[0]).not.toBe(fatItems[0]);
    }
    expect(ensureInCurrentSpace).not.toHaveBeenCalled();
  });

  it('treats foreign-space membership 404 as the same not-found as a miss', async () => {
    const { access, getById, listByName, ensureInCurrentSpace } = await createReadAccess();
    const policy = createEndpointPolicy({ id: 'foreign-id', name: 'Foreign' });
    getById.mockResolvedValue(policy);
    ensureInCurrentSpace.mockRejectedValue(new NotFoundError('hidden'));

    const foreign = await getEndpointPolicy(access, { idOrName: 'foreign-id' }).catch(
      (caught: unknown) => caught
    );
    expect(foreign).toBeInstanceOf(PolicyNotFoundError);
    if (!(foreign instanceof PolicyNotFoundError)) {
      throw new Error('expected PolicyNotFoundError');
    }
    expect(foreign.message).toBe('Endpoint policy not found');
    expect(listByName).not.toHaveBeenCalled();
  });

  it('normalizes a membership package-policy 404 after name resolution', async () => {
    const { access, getById, listByName, ensureInCurrentSpace } = await createReadAccess();
    const named = createEndpointPolicy({ id: 'named-id', name: 'Exact Name' });
    getById.mockResolvedValue(null);
    listByName.mockResolvedValue({
      items: [named],
      total: 1,
      page: 1,
      perPage: 11,
    });
    ensureInCurrentSpace.mockRejectedValue(new PackagePolicyNotFoundError('named-id'));

    await expect(getEndpointPolicy(access, { idOrName: 'Exact Name' })).rejects.toBeInstanceOf(
      PolicyNotFoundError
    );
  });

  it('rejects a selected policy missing endpoint config', async () => {
    const { access, getById, ensureInCurrentSpace } = await createReadAccess();
    getById.mockResolvedValue(
      generator.generate({
        id: 'broken-config',
        name: 'Broken Config',
        version: 'WzEsMV0=',
        inputs: [],
      })
    );

    await expect(getEndpointPolicy(access, { idOrName: 'broken-config' })).rejects.toMatchObject({
      name: 'InvalidEndpointPolicyError',
    });
    expect(ensureInCurrentSpace).toHaveBeenCalledWith({
      integrationPolicyIds: ['broken-config'],
    });
  });

  it('rejects a selected policy missing saved-object version', async () => {
    const { access, getById } = await createReadAccess();
    const policy = createEndpointPolicy({ id: 'broken-version', name: 'Broken Version' });
    delete policy.version;
    getById.mockResolvedValue(policy);

    await expect(getEndpointPolicy(access, { idOrName: 'broken-version' })).rejects.toBeInstanceOf(
      InvalidEndpointPolicyError
    );
  });

  it.each([['an empty object', {}]])(
    'rejects a current-space endpoint policy whose stored value is %s',
    async (_label, storedPolicyValue) => {
      const { access, getById, ensureInCurrentSpace } = await createReadAccess();
      const policy = createCurrentSpaceEndpointRow('malformed-policy', storedPolicyValue);
      getById.mockResolvedValue(policy);

      await expect(
        getEndpointPolicy(access, { idOrName: 'malformed-policy' })
      ).rejects.toMatchObject({
        name: 'InvalidEndpointPolicyError',
      });
      expect(ensureInCurrentSpace).toHaveBeenCalledWith({
        integrationPolicyIds: ['malformed-policy'],
      });
    }
  );

  it('rethrows a non-TypeError thrown by normalize unchanged', async () => {
    const programmerError = new Error('programmer');
    const mockedNormalize = jest.mocked(normalize);
    mockedNormalize.mockImplementationOnce(() => {
      throw programmerError;
    });

    try {
      const { access, getById } = await createReadAccess();
      const policy = createEndpointPolicy({ id: 'valid-policy', name: 'Valid Policy' });
      getById.mockResolvedValue(policy);

      await expect(getEndpointPolicy(access, { idOrName: 'valid-policy' })).rejects.toBe(
        programmerError
      );
    } finally {
      mockedNormalize.mockReset();
      mockedNormalize.mockImplementation(
        jest.requireActual<typeof import('../domain/normalize_policy_config')>(
          '../domain/normalize_policy_config'
        ).normalize
      );
    }
  });

  it('returns only the approved identity, normalized config, and hash fields', async () => {
    const { access, getById } = await createReadAccess();
    const policy = createEndpointPolicy({
      id: 'policy-id-2',
      name: 'Whitelist Policy',
      description: 'visible description',
      spaceIds: ['other-space'],
      created_by: 'creator',
      created_at: '2020-01-01T00:00:00.000Z',
      agents: 99,
    });
    Object.assign(policy.inputs[0], { compiled_input: { secret: 'nope' } });
    getById.mockResolvedValue(policy);

    const result = await getEndpointPolicy(access, { idOrName: 'policy-id-2' });

    expect(Object.keys(result)).toEqual([
      'policy',
      'storedConfig',
      'normalizedConfig',
      'normalizedHash',
    ]);
    expect(Object.keys(result.policy).sort()).toEqual(
      [
        'description',
        'id',
        'name',
        'packageVersion',
        'revision',
        'updatedAt',
        'updatedBy',
        'version',
      ].sort()
    );
    expect(result.policy).toEqual({
      id: 'policy-id-2',
      name: 'Whitelist Policy',
      description: 'visible description',
      revision: policy.revision,
      version: 'WzEsMV0=',
      updatedAt: policy.updated_at,
      updatedBy: policy.updated_by,
      packageVersion: policy.package?.version,
    });
    expect(result).not.toHaveProperty('inputs');
    expect(result).not.toHaveProperty('spaceIds');
    expect(result).not.toHaveProperty('created_by');
    expect(result).not.toHaveProperty('created_at');
    expect(result).not.toHaveProperty('agents');
    expect(result).not.toHaveProperty('compiled_input');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('other-space');
    expect(JSON.stringify(result)).not.toContain('creator');
    expect(result.normalizedHash).toBe(
      hashPolicyConfig(normalize(policy.inputs[0].config.policy.value))
    );
  });

  it('exposes the stored pre-normalize config beside the stripped normalized view', async () => {
    const { access, getById } = await createReadAccess();
    const policy = createEndpointPolicy({ id: 'policy-id-3', name: 'Stored Config Policy' });
    const storedPolicy = policy.inputs[0]?.config?.policy?.value;
    if (
      storedPolicy == null ||
      storedPolicy.windows.popup.device_control == null ||
      storedPolicy.mac.popup.device_control == null
    ) {
      throw new Error('expected generated policy to include device-control popup objects');
    }
    storedPolicy.windows.popup.device_control.message = 'keep-windows';
    storedPolicy.mac.popup.device_control.message = 'keep-mac';
    getById.mockResolvedValue(policy);

    const result = await getEndpointPolicy(access, { idOrName: 'policy-id-3' });

    expect(result.storedConfig).toBe(storedPolicy);
    expect(result.storedConfig.windows.popup.device_control?.message).toBe('keep-windows');
    expect(result.storedConfig.mac.popup.device_control?.message).toBe('keep-mac');
    expect(result.normalizedConfig).not.toBe(result.storedConfig);
    expect(result.normalizedConfig).toEqual(normalize(storedPolicy));
  });
});
