/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RequestMock } from '../../../test/helpers';
import { routeDependencies, RouterMock } from '../../../test/helpers';
import { addBasePath } from '..';
import { registerIndicesRoutes } from '.';
import { createTestIndexState } from '../../../test/helpers/indices_fixtures';

describe('[Index management API Routes] GET indices_get', () => {
  const router = new RouterMock();
  const getIndices = router.getMockESApiFn('indices.get');
  const mockRequest: RequestMock = { method: 'get', path: addBasePath('/indices_get') };

  beforeAll(() => {
    registerIndicesRoutes({
      ...routeDependencies,
      config: { ...routeDependencies.config, isSizeAndDocCountEnabled: false },
      router,
    });
  });

  test('lookup indices expose their configured lifecycle policies', async () => {
    getIndices.mockResolvedValue({
      lookup_index: createTestIndexState({
        settings: {
          index: {
            number_of_shards: 1,
            number_of_replicas: 1,
            mode: 'lookup',
            lifecycle: { name: 'stale-policy' },
          },
        },
      }),
      another_lookup_index: createTestIndexState({
        settings: {
          index: {
            number_of_shards: 1,
            number_of_replicas: 1,
            mode: 'lookup',
            lifecycle: { name: 'another-policy' },
          },
        },
      }),
    });

    const response = await router.runRequest(mockRequest);

    expect(response.body.lookup_index).toMatchObject({
      name: 'lookup_index',
      mode: 'lookup',
      ilmPolicyName: 'stale-policy',
    });
    expect(response.body.another_lookup_index).toMatchObject({
      name: 'another_lookup_index',
      mode: 'lookup',
      ilmPolicyName: 'another-policy',
    });
    expect(getIndices).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filter_path: expect.arrayContaining([
          '*.settings.index.mode',
          '*.settings.index.lifecycle.name',
        ]),
      })
    );
  });

  test('index without a lifecycle setting has no ilmPolicyName', async () => {
    getIndices.mockResolvedValue({ regular_index: createTestIndexState() });

    const response = await router.runRequest(mockRequest);

    expect(response.body.regular_index.ilmPolicyName).toBeUndefined();
  });
});
