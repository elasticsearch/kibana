/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { addBasePath } from '..';
import { registerSnapshotRepositoriesRoute } from './register_snapshot_repositories_route';
import type { RequestMock } from '../../../test/helpers';
import { RouterMock, routeDependencies } from '../../../test/helpers';

describe('[Index management API Routes] Snapshot repositories', () => {
  const router = new RouterMock();

  const getSettings = router.getMockESApiFn('cluster.getSettings');
  const hasPrivileges = router.getMockESApiFn('security.hasPrivileges');

  const mockRequest: RequestMock = {
    method: 'get',
    path: addBasePath('/snapshot_repositories'),
  };

  beforeAll(() => {
    registerSnapshotRepositoriesRoute({
      ...routeDependencies,
      router,
    });
  });

  test('returns the configured default repository and canCreate', async () => {
    getSettings.mockResolvedValue({
      persistent: { repositories: { default_repository: 'found-snapshots' } },
    });
    hasPrivileges.mockResolvedValue({
      cluster: { 'cluster:admin/repository/put': true },
    });

    await expect(router.runRequest(mockRequest)).resolves.toEqual({
      body: {
        hasDefaultRepository: true,
        defaultRepository: 'found-snapshots',
        canCreateRepository: true,
      },
    });
  });

  test('reports no default repository when none is configured as default', async () => {
    getSettings.mockResolvedValue({});
    hasPrivileges.mockResolvedValue({
      cluster: { 'cluster:admin/repository/put': true },
    });

    await expect(router.runRequest(mockRequest)).resolves.toEqual({
      body: {
        hasDefaultRepository: false,
        defaultRepository: undefined,
        canCreateRepository: true,
      },
    });
  });

  test('reports no default repository and no create permission', async () => {
    getSettings.mockResolvedValue({});
    hasPrivileges.mockResolvedValue({
      cluster: { 'cluster:admin/repository/put': false },
    });

    await expect(router.runRequest(mockRequest)).resolves.toEqual({
      body: {
        hasDefaultRepository: false,
        defaultRepository: undefined,
        canCreateRepository: false,
      },
    });
  });

  test('reports canCreateRepository as true without checking privileges when security is disabled', async () => {
    (routeDependencies.config.isSecurityEnabled as jest.Mock).mockReturnValueOnce(false);
    getSettings.mockResolvedValue({});
    hasPrivileges.mockClear();

    await expect(router.runRequest(mockRequest)).resolves.toEqual({
      body: {
        hasDefaultRepository: false,
        defaultRepository: undefined,
        canCreateRepository: true,
      },
    });
    expect(hasPrivileges).not.toHaveBeenCalled();
  });
});
