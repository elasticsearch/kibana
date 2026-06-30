/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IScopedClusterClient } from '@kbn/core/server';
import type { RouteDependencies } from '../../../types';
import { addBasePath } from '..';

const CREATE_SNAPSHOT_REPOSITORY_CLUSTER_PRIVILEGE = 'cluster:admin/repository/put';

const DEFAULT_REPOSITORY_PATH = 'persistent.repositories.default_repository';

const normalizeRepositoryName = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const getCanCreateRepository = async (
  client: IScopedClusterClient,
  isSecurityEnabled: boolean
): Promise<boolean> => {
  if (!isSecurityEnabled) {
    return true;
  }

  const privileges = await client.asCurrentUser.security.hasPrivileges({
    cluster: [CREATE_SNAPSHOT_REPOSITORY_CLUSTER_PRIVILEGE],
  });

  return privileges.cluster?.[CREATE_SNAPSHOT_REPOSITORY_CLUSTER_PRIVILEGE] === true;
};

export function registerSnapshotRepositoriesRoute({
  router,
  config,
  lib: { handleEsError },
}: RouteDependencies) {
  router.get(
    {
      path: addBasePath('/snapshot_repositories'),
      security: {
        authz: {
          enabled: false,
          reason: 'Relies on es client for authorization',
        },
      },
      validate: {},
    },
    async (context, request, response) => {
      const { client } = (await context.core).elasticsearch;

      try {
        const { persistent } = await client.asCurrentUser.cluster.getSettings({
          filter_path: DEFAULT_REPOSITORY_PATH,
        });

        const defaultRepository = normalizeRepositoryName(
          persistent?.repositories?.default_repository
        );

        const canCreateRepository = await getCanCreateRepository(
          client,
          config.isSecurityEnabled()
        );

        return response.ok({
          body: {
            hasDefaultRepository: defaultRepository !== undefined,
            defaultRepository,
            canCreateRepository,
          },
        });
      } catch (error) {
        return handleEsError({ error, response });
      }
    }
  );
}
