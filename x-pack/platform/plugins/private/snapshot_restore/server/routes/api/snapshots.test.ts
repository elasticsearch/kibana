/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import { addBasePath } from '../helpers';
import { registerSnapshotsRoutes } from './snapshots';
import type { RequestMock } from '../../test/helpers';
import { RouterMock, routeDependencies } from '../../test/helpers';

const defaultSnapshot = {
  repository: undefined,
  snapshot: undefined,
  uuid: undefined,
  versionId: undefined,
  version: undefined,
  indices: [],
  dataStreams: [],
  includeGlobalState: undefined,
  featureStates: [],
  state: undefined,
  startTime: undefined,
  startTimeInMillis: undefined,
  endTime: undefined,
  endTimeInMillis: undefined,
  durationInMillis: undefined,
  indexFailures: [],
  shards: undefined,
};

describe('[Snapshot and Restore API Routes] Snapshots', () => {
  const router = new RouterMock();

  /**
   * ES APIs used by these endpoints
   */
  const getClusterSettingsFn = router.getMockApiFn('cluster.getSettings');
  const getLifecycleFn = router.getMockApiFn('slm.getLifecycle');
  const getSnapshotFn = router.getMockApiFn('snapshot.get');
  const deleteSnapshotFn = router.getMockApiFn('snapshot.delete');
  const getRepoFn = router.getMockApiFn('snapshot.getRepository');

  beforeAll(() => {
    registerSnapshotsRoutes({
      ...routeDependencies,
      router,
    });
  });

  describe('getAllHandler()', () => {
    const mockRequest: RequestMock = {
      method: 'get',
      path: addBasePath('snapshots'),
      query: {
        sortField: 'startTimeInMillis',
        sortDirection: 'desc',
      },
    };

    const mockSnapshotGetManagedRepositoryEsResponse = {
      defaults: {
        'cluster.metadata.managed_repository': 'myManagedRepository',
      },
    };

    test('combines snapshots and their repositories returned from ES', async () => {
      const mockGetPolicyEsResponse = {
        fooPolicy: {},
      };

      const mockGetSnapshotsResponse = {
        snapshots: [
          { snapshot: 'snapshot1', repository: 'fooRepository' },
          { snapshot: 'snapshot2', repository: 'barRepository' },
        ],
      };

      const mockGetRepositoryEsResponse = {
        fooRepository: {},
        barRepository: {},
        // Test that there may be a repository that does not yet have any snapshots associated to it
        bazRepository: {},
      };

      getClusterSettingsFn.mockResolvedValue(mockSnapshotGetManagedRepositoryEsResponse);
      getLifecycleFn.mockResolvedValue(mockGetPolicyEsResponse);
      getRepoFn.mockResolvedValue(mockGetRepositoryEsResponse);
      getSnapshotFn.mockResolvedValue(mockGetSnapshotsResponse);

      const expectedResponse = {
        repositories: ['fooRepository', 'barRepository', 'bazRepository'],
        policies: ['fooPolicy'],
        snapshots: [
          {
            ...defaultSnapshot,
            repository: 'fooRepository',
            snapshot: 'snapshot1',
            managedRepository:
              mockSnapshotGetManagedRepositoryEsResponse.defaults[
                'cluster.metadata.managed_repository'
              ],
          },
          {
            ...defaultSnapshot,
            repository: 'barRepository',
            snapshot: 'snapshot2',
            managedRepository:
              mockSnapshotGetManagedRepositoryEsResponse.defaults[
                'cluster.metadata.managed_repository'
              ],
          },
        ],
      };

      const response = await router.runRequest(mockRequest);
      expect(response).toEqual({ body: expectedResponse });
    });

    test('returns an error object if ES request contains repository failures', async () => {
      const mockGetPolicyEsResponse = {
        fooPolicy: {},
      };

      const mockGetSnapshotsResponse = {
        snapshots: [{ snapshot: 'snapshot1', repository: 'fooRepository' }],
        failures: {
          bar: {
            type: 'repository_exception',
            reason:
              "[barRepository] Could not read repository data because the contents of the repository do not match its expected state. This is likely the result of either concurrently modifying the contents of the repository by a process other than this cluster or an issue with the repository's underlying storage. The repository has been disabled to prevent corrupting its contents. To re-enable it and continue using it please remove the repository from the cluster and add it again to make the cluster recover the known state of the repository from its physical contents.",
          },
        },
      };

      const mockGetRepositoryEsResponse = {
        fooRepository: {},
      };

      getClusterSettingsFn.mockResolvedValue(mockSnapshotGetManagedRepositoryEsResponse);
      getLifecycleFn.mockResolvedValue(mockGetPolicyEsResponse);
      getRepoFn.mockResolvedValue(mockGetRepositoryEsResponse);
      getSnapshotFn.mockResolvedValue(mockGetSnapshotsResponse);

      const expectedResponse = {
        repositories: ['fooRepository'],
        policies: ['fooPolicy'],
        snapshots: [
          {
            ...defaultSnapshot,
            repository: 'fooRepository',
            snapshot: 'snapshot1',
            managedRepository:
              mockSnapshotGetManagedRepositoryEsResponse.defaults[
                'cluster.metadata.managed_repository'
              ],
          },
        ],
        errors: {
          bar: {
            type: 'repository_exception',
            reason:
              "[barRepository] Could not read repository data because the contents of the repository do not match its expected state. This is likely the result of either concurrently modifying the contents of the repository by a process other than this cluster or an issue with the repository's underlying storage. The repository has been disabled to prevent corrupting its contents. To re-enable it and continue using it please remove the repository from the cluster and add it again to make the cluster recover the known state of the repository from its physical contents.",
          },
        },
      };

      const response = await router.runRequest(mockRequest);
      expect(response).toEqual({ body: expectedResponse });
    });

    test('returns empty arrays if no repositories returned from ES', async () => {
      getClusterSettingsFn.mockResolvedValue(mockSnapshotGetManagedRepositoryEsResponse);
      getLifecycleFn.mockResolvedValue({});
      getRepoFn.mockResolvedValue({});

      const expectedResponse = {
        snapshots: [],
        repositories: [],
        policies: [],
      };

      const response = await router.runRequest(mockRequest);
      expect(response).toEqual({ body: expectedResponse });
    });

    test('returns an empty snapshot array if no snapshots returned from ES', async () => {
      const mockGetRepositoryEsResponse = {
        fooRepository: {},
      };

      getClusterSettingsFn.mockResolvedValue({
        body: mockSnapshotGetManagedRepositoryEsResponse,
      });
      getLifecycleFn.mockResolvedValue({});
      getRepoFn.mockResolvedValue(mockGetRepositoryEsResponse);
      getSnapshotFn.mockResolvedValue({});

      const expectedResponse = {
        snapshots: [],
        repositories: ['fooRepository'],
        policies: [],
      };

      const response = await router.runRequest(mockRequest);
      expect(response).toEqual({ body: expectedResponse });
    });

    test('throws if ES error', async () => {
      getClusterSettingsFn.mockRejectedValue(new Error());
      getLifecycleFn.mockRejectedValue(new Error());
      getRepoFn.mockRejectedValue(new Error());
      getSnapshotFn.mockRejectedValue(new Error());

      await expect(router.runRequest(mockRequest)).rejects.toThrow();
    });

    describe('last successful managed snapshot protection', () => {
      test('marks the most recent successful snapshot in managed repository as non-deletable', async () => {
        const managedRepository = 'myManagedRepository';
        const mockManagedRepoSettings = {
          defaults: {
            'cluster.metadata.managed_repository': managedRepository,
          },
        };

        // Mock the main snapshots request
        const mockGetSnapshotsResponse = {
          snapshots: [
            {
              snapshot: 'snapshot1',
              repository: managedRepository,
              state: 'SUCCESS',
              start_time_in_millis: 1000,
            },
            {
              snapshot: 'snapshot2',
              repository: managedRepository,
              state: 'SUCCESS',
              start_time_in_millis: 2000,
            },
            {
              snapshot: 'snapshot3',
              repository: managedRepository,
              state: 'FAILED',
              start_time_in_millis: 3000,
            },
          ],
        };

        // Mock the request to get the last successful snapshot from managed repo
        const mockGetLastSuccessfulSnapshotResponse = {
          snapshots: [
            {
              snapshot: 'snapshot2',
              repository: managedRepository,
              state: 'SUCCESS',
              start_time_in_millis: 2000,
            },
          ],
        };

        const mockGetRepositoryEsResponse = {
          [managedRepository]: {},
        };

        getClusterSettingsFn.mockResolvedValue(mockManagedRepoSettings);
        getLifecycleFn.mockResolvedValue({});
        getRepoFn.mockResolvedValue(mockGetRepositoryEsResponse);
        // First call is for the last successful snapshot, second is for the main list
        getSnapshotFn.mockResolvedValueOnce(mockGetLastSuccessfulSnapshotResponse);
        getSnapshotFn.mockResolvedValueOnce(mockGetSnapshotsResponse);

        const response = await router.runRequest(mockRequest);

        // snapshot2 should be marked as non-deletable
        expect(response.body.snapshots).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              snapshot: 'snapshot2',
              isLastSuccessfulSnapshot: true,
            }),
          ])
        );

        // Other snapshots should not have the flag
        const snapshot1 = response.body.snapshots.find((s: any) => s.snapshot === 'snapshot1');
        expect(snapshot1).toBeDefined();
        expect(snapshot1.isLastSuccessfulSnapshot).toBeUndefined();
      });

      test('does not mark snapshots in non-managed repositories', async () => {
        const managedRepository = 'myManagedRepository';
        const regularRepository = 'regularRepository';
        const mockManagedRepoSettings2 = {
          defaults: {
            'cluster.metadata.managed_repository': managedRepository,
          },
        };

        // Mock the main snapshots request with snapshots from both repos
        const mockGetSnapshotsResponse = {
          snapshots: [
            {
              snapshot: 'managed_snapshot',
              repository: managedRepository,
              state: 'SUCCESS',
              start_time_in_millis: 1000,
            },
            {
              snapshot: 'regular_snapshot',
              repository: regularRepository,
              state: 'SUCCESS',
              start_time_in_millis: 2000,
            },
          ],
        };

        // Mock the request to get the last successful snapshot from managed repo
        const mockGetLastSuccessfulSnapshotResponse = {
          snapshots: [
            {
              snapshot: 'managed_snapshot',
              repository: managedRepository,
              state: 'SUCCESS',
              start_time_in_millis: 1000,
            },
          ],
        };

        const mockGetRepositoryEsResponse = {
          [managedRepository]: {},
          [regularRepository]: {},
        };

        getClusterSettingsFn.mockResolvedValue(mockManagedRepoSettings2);
        getLifecycleFn.mockResolvedValue({});
        getRepoFn.mockResolvedValue(mockGetRepositoryEsResponse);
        getSnapshotFn.mockResolvedValueOnce(mockGetLastSuccessfulSnapshotResponse);
        getSnapshotFn.mockResolvedValueOnce(mockGetSnapshotsResponse);

        const response = await router.runRequest(mockRequest);

        // Only the managed repository snapshot should be marked
        expect(response.body.snapshots).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              snapshot: 'managed_snapshot',
              isLastSuccessfulSnapshot: true,
            }),
          ])
        );

        const regularSnapshot = response.body.snapshots.find(
          (s: any) => s.snapshot === 'regular_snapshot'
        );
        expect(regularSnapshot).toBeDefined();
        expect(regularSnapshot.isLastSuccessfulSnapshot).toBeUndefined();
      });

      test('handles case when managed repository has no successful snapshots', async () => {
        const managedRepository = 'myManagedRepository';
        const mockManagedRepoSettings3 = {
          defaults: {
            'cluster.metadata.managed_repository': managedRepository,
          },
        };

        const mockGetSnapshotsResponse = {
          snapshots: [
            {
              snapshot: 'snapshot1',
              repository: managedRepository,
              state: 'FAILED',
              start_time_in_millis: 1000,
            },
          ],
        };

        // No successful snapshots in managed repo
        const mockGetLastSuccessfulSnapshotResponse = {
          snapshots: [],
        };

        const mockGetRepositoryEsResponse = {
          [managedRepository]: {},
        };

        getClusterSettingsFn.mockResolvedValue(mockManagedRepoSettings3);
        getLifecycleFn.mockResolvedValue({});
        getRepoFn.mockResolvedValue(mockGetRepositoryEsResponse);
        getSnapshotFn.mockResolvedValueOnce(mockGetLastSuccessfulSnapshotResponse);
        getSnapshotFn.mockResolvedValueOnce(mockGetSnapshotsResponse);

        const response = await router.runRequest(mockRequest);

        // No snapshots should be marked
        const snapshot1 = response.body.snapshots.find((s: any) => s.snapshot === 'snapshot1');
        expect(snapshot1).toBeDefined();
        expect(snapshot1.isLastSuccessfulSnapshot).toBeUndefined();
      });

      test('handles case when there is no managed repository', async () => {
        const mockManagedRepoSettings4 = {
          defaults: {},
        };

        const mockGetSnapshotsResponse = {
          snapshots: [
            {
              snapshot: 'snapshot1',
              repository: 'regularRepository',
              state: 'SUCCESS',
              start_time_in_millis: 1000,
            },
          ],
        };

        const mockGetRepositoryEsResponse = {
          regularRepository: {},
        };

        getClusterSettingsFn.mockResolvedValue(mockManagedRepoSettings4);
        getLifecycleFn.mockResolvedValue({});
        getRepoFn.mockResolvedValue(mockGetRepositoryEsResponse);
        getSnapshotFn.mockResolvedValueOnce(mockGetSnapshotsResponse);

        const response = await router.runRequest(mockRequest);

        // No snapshots should be marked
        const snapshot1 = response.body.snapshots.find((s: any) => s.snapshot === 'snapshot1');
        expect(snapshot1).toBeDefined();
        expect(snapshot1.isLastSuccessfulSnapshot).toBeUndefined();
      });

      test('continues to work if fetching last successful snapshot fails', async () => {
        const managedRepository = 'myManagedRepository';
        const mockManagedRepoSettings5 = {
          defaults: {
            'cluster.metadata.managed_repository': managedRepository,
          },
        };

        const mockGetSnapshotsResponse = {
          snapshots: [
            {
              snapshot: 'snapshot1',
              repository: managedRepository,
              state: 'SUCCESS',
              start_time_in_millis: 1000,
            },
          ],
        };

        const mockGetRepositoryEsResponse = {
          [managedRepository]: {},
        };

        getClusterSettingsFn.mockResolvedValue(mockManagedRepoSettings5);
        getLifecycleFn.mockResolvedValue({});
        getRepoFn.mockResolvedValue(mockGetRepositoryEsResponse);
        // First call fails, second succeeds
        getSnapshotFn.mockRejectedValueOnce(new Error('ES Error'));
        getSnapshotFn.mockResolvedValueOnce(mockGetSnapshotsResponse);

        const response = await router.runRequest(mockRequest);

        // Should still return snapshots, just without the protection flag
        expect(response.body.snapshots).toHaveLength(1);
        expect(response.body.snapshots[0].snapshot).toBe('snapshot1');
        expect(response.body.snapshots[0].isLastSuccessfulSnapshot).toBeUndefined();
      });
    });
  });

  describe('getOneHandler()', () => {
    const repository = 'fooRepository';
    const snapshot = 'snapshot1';

    const mockRequest: RequestMock = {
      method: 'get',
      path: addBasePath('snapshots/{repository}/{snapshot}'),
      params: {
        repository,
        snapshot,
      },
    };

    const mockSnapshotGetManagedRepositoryEsResponse = {
      defaults: {
        'cluster.metadata.managed_repository': 'myManagedRepository',
      },
    };

    test('returns snapshot object with repository name if returned from ES', async () => {
      const mockGetSnapshotEsResponse = {
        snapshots: [{ snapshot, repository }],
      };

      getClusterSettingsFn.mockResolvedValue(mockSnapshotGetManagedRepositoryEsResponse);
      getSnapshotFn.mockResolvedValue(mockGetSnapshotEsResponse);

      const expectedResponse = {
        ...defaultSnapshot,
        snapshot,
        repository,
        managedRepository:
          mockSnapshotGetManagedRepositoryEsResponse.defaults[
            'cluster.metadata.managed_repository'
          ],
      };

      const response = await router.runRequest(mockRequest);
      expect(response).toEqual({ body: expectedResponse });
    });

    test('throws if ES error', async () => {
      const mockSnapshotGetEsResponse = {
        responses: [
          {
            repository,
            error: {
              root_cause: [
                {
                  type: 'snapshot_missing_exception',
                  reason: `[${repository}:${snapshot}] is missing`,
                },
              ],
              type: 'snapshot_missing_exception',
              reason: `[${repository}:${snapshot}] is missing`,
            },
          },
        ],
      };

      getClusterSettingsFn.mockResolvedValue(mockSnapshotGetManagedRepositoryEsResponse);
      getSnapshotFn.mockResolvedValue(mockSnapshotGetEsResponse);

      await expect(router.runRequest(mockRequest)).resolves.toEqual({
        body: 'Snapshot not found',
        status: 404,
      });
    });
  });

  describe('deleteHandler()', () => {
    const mockRequest: RequestMock = {
      method: 'post',
      path: addBasePath('snapshots/bulk_delete'),
      body: [
        {
          repository: 'fooRepository',
          snapshot: 'snapshot-1',
        },
        {
          repository: 'barRepository',
          snapshot: 'snapshot-2',
        },
      ],
    };

    beforeEach(() => {
      deleteSnapshotFn.mockReset();
    });

    it('registers the route with a 30 minute idle socket timeout', () => {
      const localRouter = new RouterMock();
      const post = jest.spyOn(localRouter, 'post');

      registerSnapshotsRoutes({ ...routeDependencies, router: localRouter });

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          path: addBasePath('snapshots/bulk_delete'),
          options: { timeout: { idleSocket: 30 * 60 * 1000 } },
        }),
        expect.any(Function)
      );
    });

    it('should return successful ES responses', async () => {
      const mockEsResponse = { acknowledged: true };

      deleteSnapshotFn.mockResolvedValueOnce(mockEsResponse);
      deleteSnapshotFn.mockResolvedValueOnce(mockEsResponse);

      const expectedResponse = {
        itemsDeleted: [
          { snapshot: 'snapshot-1', repository: 'fooRepository' },
          { snapshot: 'snapshot-2', repository: 'barRepository' },
        ],
        errors: [],
      };

      await expect(router.runRequest(mockRequest)).resolves.toEqual({ body: expectedResponse });
    });

    it('should return error ES responses', async () => {
      const mockEsError = new Error('Test error') as any;
      mockEsError.response = '{}';
      mockEsError.statusCode = 500;

      deleteSnapshotFn.mockRejectedValueOnce(mockEsError);
      deleteSnapshotFn.mockRejectedValueOnce(mockEsError);

      const expectedResponse = {
        itemsDeleted: [],
        errors: [
          {
            id: { snapshot: 'snapshot-1', repository: 'fooRepository' },
            error: { cause: mockEsError.message, statusCode: 500 },
          },
          {
            id: { snapshot: 'snapshot-2', repository: 'barRepository' },
            error: { cause: mockEsError.message, statusCode: 500 },
          },
        ],
      };

      await expect(router.runRequest(mockRequest)).resolves.toEqual({ body: expectedResponse });
    });

    it('should return combination of ES successes and errors', async () => {
      const mockEsError = new Error('Test error') as any;
      mockEsError.response = '{}';
      mockEsError.statusCode = 500;
      const mockEsResponse = { acknowledged: true };

      deleteSnapshotFn.mockRejectedValueOnce(mockEsError);
      deleteSnapshotFn.mockResolvedValueOnce(mockEsResponse);

      const expectedResponse = {
        itemsDeleted: [{ snapshot: 'snapshot-2', repository: 'barRepository' }],
        errors: [
          {
            id: { snapshot: 'snapshot-1', repository: 'fooRepository' },
            error: { cause: mockEsError.message, statusCode: 500 },
          },
        ],
      };

      await expect(router.runRequest(mockRequest)).resolves.toEqual({ body: expectedResponse });
    });

    it('issues one ES delete call per repository', async () => {
      const mockEsResponse = { acknowledged: true };

      deleteSnapshotFn.mockResolvedValueOnce(mockEsResponse);
      deleteSnapshotFn.mockResolvedValueOnce(mockEsResponse);

      const expectedResponse = {
        itemsDeleted: [
          { snapshot: 'snapshot-1', repository: 'fooRepository' },
          { snapshot: 'snapshot-3', repository: 'fooRepository' },
          { snapshot: 'snapshot-2', repository: 'barRepository' },
        ],
        errors: [],
      };

      await expect(
        router.runRequest({
          ...mockRequest,
          body: [
            { repository: 'fooRepository', snapshot: 'snapshot-1' },
            { repository: 'barRepository', snapshot: 'snapshot-2' },
            { repository: 'fooRepository', snapshot: 'snapshot-3' },
          ],
        })
      ).resolves.toEqual({ body: expectedResponse });

      expect(deleteSnapshotFn).toHaveBeenCalledTimes(2);
      expect(deleteSnapshotFn).toHaveBeenNthCalledWith(
        1,
        { repository: 'fooRepository', snapshot: 'snapshot-1,snapshot-3' },
        { requestTimeout: 0 }
      );
      expect(deleteSnapshotFn).toHaveBeenNthCalledWith(
        2,
        { repository: 'barRepository', snapshot: 'snapshot-2' },
        { requestTimeout: 0 }
      );
    });

    describe('WHEN a repository deletion is pending', () => {
      it('SHOULD wait before starting the next deletion and returning the result', async () => {
        let completeFirstDelete = () => {};
        let notifyFirstDeleteStarted = () => {};
        const firstDeleteStarted = new Promise<void>((resolve) => {
          notifyFirstDeleteStarted = resolve;
        });
        const firstDelete = new Promise<void>((resolve) => {
          completeFirstDelete = resolve;
        });
        deleteSnapshotFn.mockImplementationOnce(() => {
          notifyFirstDeleteStarted();
          return firstDelete;
        });
        deleteSnapshotFn.mockResolvedValueOnce({ acknowledged: true });
        const onResponse = jest.fn();

        const response = router.runRequest(mockRequest).then(onResponse);
        await firstDeleteStarted;

        expect(deleteSnapshotFn).toHaveBeenCalledTimes(1);
        expect(onResponse).not.toHaveBeenCalled();

        completeFirstDelete();
        await response;

        expect(deleteSnapshotFn).toHaveBeenCalledTimes(2);
        expect(onResponse).toHaveBeenCalledWith({
          body: { itemsDeleted: mockRequest.body, errors: [] },
        });
      });
    });

    const createEsResponseError = (type: string, reason: string) =>
      new errors.ResponseError({
        statusCode: 404,
        body: { error: { type, root_cause: [{ type, reason }] } },
        headers: {},
        meta: {
          context: null,
          name: 'elasticsearch-js',
          request: {
            params: { method: 'DELETE', path: '/_snapshot/fooRepository/snapshot-1,snapshot-3' },
            options: {},
            id: 1,
          },
          connection: null,
          attempts: 0,
          aborted: false,
        },
        warnings: [],
      });

    it('reports a failed repository group as one error per snapshot', async () => {
      const mockEsError = createEsResponseError(
        'repository_missing_exception',
        '[fooRepository] missing'
      );
      const mockEsResponse = { acknowledged: true };

      deleteSnapshotFn.mockRejectedValueOnce(mockEsError);
      deleteSnapshotFn.mockResolvedValueOnce(mockEsResponse);

      const expectedResponse = {
        itemsDeleted: [{ snapshot: 'snapshot-2', repository: 'barRepository' }],
        errors: [
          {
            id: { snapshot: 'snapshot-1', repository: 'fooRepository' },
            error: { statusCode: 404, cause: ['[fooRepository] missing'] },
          },
          {
            id: { snapshot: 'snapshot-3', repository: 'fooRepository' },
            error: { statusCode: 404, cause: ['[fooRepository] missing'] },
          },
        ],
      };

      await expect(
        router.runRequest({
          ...mockRequest,
          body: [
            { repository: 'fooRepository', snapshot: 'snapshot-1' },
            { repository: 'fooRepository', snapshot: 'snapshot-3' },
            { repository: 'barRepository', snapshot: 'snapshot-2' },
          ],
        })
      ).resolves.toEqual({ body: expectedResponse });

      expect(deleteSnapshotFn).toHaveBeenCalledTimes(2);
    });

    describe('WHEN a snapshot in a repository group is missing', () => {
      const missingError = createEsResponseError(
        'snapshot_missing_exception',
        '[fooRepository:snapshot-3] is missing'
      );

      it('SHOULD retry the group one snapshot at a time and report only the missing one', async () => {
        deleteSnapshotFn.mockRejectedValueOnce(missingError); // snapshot-1,snapshot-3
        deleteSnapshotFn.mockResolvedValueOnce({ acknowledged: true }); // snapshot-1
        deleteSnapshotFn.mockRejectedValueOnce(missingError); // snapshot-3
        deleteSnapshotFn.mockResolvedValueOnce({ acknowledged: true }); // barRepository

        await expect(
          router.runRequest({
            ...mockRequest,
            body: [
              { repository: 'fooRepository', snapshot: 'snapshot-1' },
              { repository: 'fooRepository', snapshot: 'snapshot-3' },
              { repository: 'barRepository', snapshot: 'snapshot-2' },
            ],
          })
        ).resolves.toEqual({
          body: {
            itemsDeleted: [
              { snapshot: 'snapshot-1', repository: 'fooRepository' },
              { snapshot: 'snapshot-2', repository: 'barRepository' },
            ],
            errors: [
              {
                id: { snapshot: 'snapshot-3', repository: 'fooRepository' },
                error: { statusCode: 404, cause: ['[fooRepository:snapshot-3] is missing'] },
              },
            ],
          },
        });

        expect(
          deleteSnapshotFn.mock.calls.map(
            ([{ repository, snapshot }]) => `${repository}/${snapshot}`
          )
        ).toEqual([
          'fooRepository/snapshot-1,snapshot-3',
          'fooRepository/snapshot-1',
          'fooRepository/snapshot-3',
          'barRepository/snapshot-2',
        ]);
      });

      it('SHOULD NOT retry a group with a single snapshot', async () => {
        deleteSnapshotFn.mockRejectedValue(missingError);

        await expect(
          router.runRequest({
            ...mockRequest,
            body: [{ repository: 'fooRepository', snapshot: 'snapshot-3' }],
          })
        ).resolves.toEqual({
          body: {
            itemsDeleted: [],
            errors: [
              {
                id: { snapshot: 'snapshot-3', repository: 'fooRepository' },
                error: { statusCode: 404, cause: ['[fooRepository:snapshot-3] is missing'] },
              },
            ],
          },
        });

        expect(deleteSnapshotFn).toHaveBeenCalledTimes(1);
      });
    });

    it('reports a timed out repository group without failing the whole request', async () => {
      const mockEsError = new errors.TimeoutError('Request timed out');
      const mockEsResponse = { acknowledged: true };

      deleteSnapshotFn.mockRejectedValueOnce(mockEsError);
      deleteSnapshotFn.mockResolvedValueOnce(mockEsResponse);

      const expectedResponse = {
        itemsDeleted: [{ snapshot: 'snapshot-2', repository: 'barRepository' }],
        errors: [
          {
            id: { snapshot: 'snapshot-1', repository: 'fooRepository' },
            error: { statusCode: undefined, cause: 'Request timed out' },
          },
        ],
      };

      await expect(router.runRequest(mockRequest)).resolves.toEqual({ body: expectedResponse });
    });

    it('splits a repository group into several ES calls when the names exceed the request line budget', async () => {
      // 100 names of 63 characters: 100 * (63 + 3 bytes for the encoded comma) is far above the 3000 byte budget
      const snapshotNames = Array.from(
        { length: 100 },
        (_, index) => `snapshot-${String(index).padStart(3, '0')}-${'x'.repeat(50)}`
      );
      deleteSnapshotFn.mockResolvedValue({ acknowledged: true });

      const { body } = await router.runRequest({
        ...mockRequest,
        body: snapshotNames.map((snapshot) => ({ repository: 'fooRepository', snapshot })),
      });

      const calledNamesPerRequest = deleteSnapshotFn.mock.calls.map(([{ snapshot }]) =>
        snapshot.split(',')
      );
      expect(calledNamesPerRequest.map((names) => names.length)).toEqual([45, 45, 10]);
      expect(calledNamesPerRequest.flat()).toEqual(snapshotNames);
      for (const [{ snapshot }] of deleteSnapshotFn.mock.calls) {
        expect(encodeURIComponent(snapshot).length).toBeLessThanOrEqual(3000);
      }
      expect(body).toEqual({
        itemsDeleted: snapshotNames.map((snapshot) => ({ snapshot, repository: 'fooRepository' })),
        errors: [],
      });
    });

    it('splits by encoded length of repository and names rather than by count', async () => {
      // a 1000 character repository leaves room for a single 1000 character name per request
      const repository = 'r'.repeat(1000);
      const snapshotNames = Array.from(
        { length: 3 },
        (_, index) => `long-snapshot-${index}-${'y'.repeat(984)}`
      );
      deleteSnapshotFn.mockResolvedValue({ acknowledged: true });

      const { body } = await router.runRequest({
        ...mockRequest,
        body: snapshotNames.map((snapshot) => ({ repository, snapshot })),
      });

      expect(deleteSnapshotFn.mock.calls.map(([{ snapshot }]) => snapshot)).toEqual(snapshotNames);
      expect(body).toEqual({
        itemsDeleted: snapshotNames.map((snapshot) => ({ snapshot, repository })),
        errors: [],
      });
    });

    it('keeps a snapshot name that cannot be URL-encoded in its own request', async () => {
      const loneSurrogate = '\uD800';
      deleteSnapshotFn.mockResolvedValue({ acknowledged: true });

      const { body } = await router.runRequest({
        ...mockRequest,
        body: [
          { repository: 'fooRepository', snapshot: loneSurrogate },
          { repository: 'fooRepository', snapshot: 'snapshot-1' },
        ],
      });

      expect(deleteSnapshotFn.mock.calls.map(([{ snapshot }]) => snapshot)).toEqual([
        loneSurrogate,
        'snapshot-1',
      ]);
      expect(body).toEqual({
        itemsDeleted: [
          { snapshot: loneSurrogate, repository: 'fooRepository' },
          { snapshot: 'snapshot-1', repository: 'fooRepository' },
        ],
        errors: [],
      });
    });

    it('sends one request per snapshot when the repository name cannot be URL-encoded', async () => {
      const repository = '\uD800';
      deleteSnapshotFn.mockResolvedValue({ acknowledged: true });

      const { body } = await router.runRequest({
        ...mockRequest,
        body: [
          { repository, snapshot: 'snapshot-1' },
          { repository, snapshot: 'snapshot-2' },
        ],
      });

      expect(deleteSnapshotFn.mock.calls.map(([params]) => params)).toEqual([
        { repository, snapshot: 'snapshot-1' },
        { repository, snapshot: 'snapshot-2' },
      ]);
      expect(body).toEqual({
        itemsDeleted: [
          { snapshot: 'snapshot-1', repository },
          { snapshot: 'snapshot-2', repository },
        ],
        errors: [],
      });
    });
  });
});
