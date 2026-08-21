/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { SECURITY_EXTENSION_ID, SPACES_EXTENSION_ID } from '@kbn/core-saved-objects-server';
import type { StartServicesAccessor } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core/server/mocks';
import {
  PolicyReadonlySoClientMethodNotAllowedError,
  createRequestScopedReadonlySoClient,
} from './create_request_scoped_readonly_so_client';

const BLOCKED_METHODS = ['create', 'createPointInTimeFinder'] as const;

const createDeps = () => {
  const request = httpServerMock.createKibanaRequest();
  const scopedClient = savedObjectsClientMock.create();
  const getScopedClient = jest.fn().mockReturnValue(scopedClient);
  const getStartServices = jest.fn(async () => [
    { savedObjects: { getScopedClient } },
  ]) as unknown as StartServicesAccessor;

  return { request, scopedClient, getScopedClient, getStartServices };
};

describe('createRequestScopedReadonlySoClient', () => {
  it('passes the identical request and Security-only exclusion to Core', async () => {
    const { request, getScopedClient, getStartServices } = createDeps();

    await createRequestScopedReadonlySoClient({ getStartServices, request });

    expect(getStartServices).toHaveBeenCalledTimes(1);
    expect(getScopedClient).toHaveBeenCalledTimes(1);
    expect(getScopedClient.mock.calls[0][0]).toBe(request);
    expect(getScopedClient.mock.calls[0][1]).toEqual({
      excludedExtensions: [SECURITY_EXTENSION_ID],
    });
    expect(getScopedClient.mock.calls[0][1]?.excludedExtensions).not.toContain(SPACES_EXTENSION_ID);
    expect(getScopedClient.mock.calls[0][1]).not.toHaveProperty('includedHiddenTypes');
  });

  it.each(BLOCKED_METHODS)('throws the local error when accessing %s', async (methodName) => {
    const { request, getStartServices } = createDeps();
    const client = await createRequestScopedReadonlySoClient({ getStartServices, request });

    expect(() => client[methodName]).toThrow(PolicyReadonlySoClientMethodNotAllowedError);
    expect(() => client[methodName]).toThrow(
      `Method [${methodName}] not allowed on readonly SO client`
    );
  });

  it('keeps namespace-scoped clients readonly recursively', async () => {
    const { request, scopedClient, getStartServices } = createDeps();
    const namespacedClient = savedObjectsClientMock.create();
    scopedClient.asScopedToNamespace.mockReturnValue(namespacedClient);

    const client = await createRequestScopedReadonlySoClient({ getStartServices, request });
    const scoped = client.asScopedToNamespace('space-b');

    expect(scopedClient.asScopedToNamespace).toHaveBeenCalledWith('space-b');
    expect(() => scoped.create).toThrow(PolicyReadonlySoClientMethodNotAllowedError);
    expect(() => scoped.asScopedToNamespace('space-c').delete).toThrow(
      PolicyReadonlySoClientMethodNotAllowedError
    );
  });

  it('delegates get and find to the Core client unchanged', async () => {
    const { request, scopedClient, getStartServices } = createDeps();
    const savedObject = {
      id: 'policy-1',
      type: 'fleet-package-policies',
      attributes: {},
      references: [],
    };
    const findResponse = {
      saved_objects: [{ ...savedObject, score: 1 }],
      total: 1,
      per_page: 20,
      page: 1,
    };
    scopedClient.get.mockResolvedValue(savedObject);
    scopedClient.find.mockResolvedValue(findResponse);

    const client = await createRequestScopedReadonlySoClient({ getStartServices, request });
    const getOptions = { namespace: 'space-a' };
    const findOptions = { type: 'fleet-package-policies' };

    await expect(client.get('fleet-package-policies', 'policy-1', getOptions)).resolves.toBe(
      savedObject
    );
    await expect(client.find(findOptions)).resolves.toBe(findResponse);
    expect(scopedClient.get).toHaveBeenCalledWith('fleet-package-policies', 'policy-1', getOptions);
    expect(scopedClient.find).toHaveBeenCalledWith(findOptions);
  });
});
