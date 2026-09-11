/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { errors } from '@elastic/elasticsearch';
import { schema } from '@kbn/config-schema';
import type { SnapshotSnapshotState } from '@elastic/elasticsearch/lib/api/types';
import type { SnapshotDetailsEs } from '../../../common/types';
import { deserializeSnapshotDetails } from '../../../common/lib';
import type { RouteDependencies } from '../../types';
import { getManagedRepositoryName } from '../../lib';
import { addBasePath } from '../helpers';
import { snapshotListSchema } from './validate_schemas';
import { getSnapshotSearchWildcard } from '../../lib/get_snapshot_search_wildcard';

const sortFieldToESParams = {
  snapshot: 'name',
  repository: 'repository',
  indices: 'index_count',
  startTimeInMillis: 'start_time',
  durationInMillis: 'duration',
  'shards.total': 'shard_count',
  'shards.failed': 'failed_shard_count',
};

const isSearchingForNonExistentRepository = (
  repositories: string[],
  value: string,
  match?: string,
  operator?: string
): boolean => {
  // only check if searching for an exact match (repository=test)
  if (match === 'must' && operator === 'exact') {
    return !(repositories || []).includes(value);
  }
  // otherwise we will use a wildcard, so allow the request
  return false;
};

// Deleting many or large snapshots can outlast Kibana's default socket timeout (`server.socketTimeout`, 120s);
// give this route the same generous budget other long-running routes use.
const SNAPSHOT_DELETE_SOCKET_TIMEOUT_MS = 30 * 60 * 1000;

// ES rejects requests whose first line exceeds `http.max_initial_line_length` (4kb by default), so the
// encoded repository name plus the comma-separated snapshot names in a DELETE path are kept well below it.
const MAX_DELETE_PATH_LENGTH = 3000;

const getEncodedLength = (value: string): number => {
  try {
    return encodeURIComponent(value).length;
  } catch (e) {
    // a value that cannot be encoded (e.g. a lone surrogate) gets a request of its own, so only that one fails
    return Infinity;
  }
};

// ES fails a multi-snapshot delete before deleting anything when one of the names does not exist
const isSnapshotMissingError = (e: unknown): boolean =>
  e instanceof errors.ResponseError && e.body?.error?.type === 'snapshot_missing_exception';

const chunkSnapshotNames = (repository: string, snapshotNames: string[]): string[][] => {
  const maxSnapshotNamesLength = MAX_DELETE_PATH_LENGTH - getEncodedLength(repository);
  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const snapshotName of snapshotNames) {
    // encoded name plus the encoded comma separator (`%2C`)
    const encodedLength = getEncodedLength(snapshotName) + 3;

    if (currentChunk.length > 0 && currentLength + encodedLength > maxSnapshotNamesLength) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLength = 0;
    }

    currentChunk.push(snapshotName);
    currentLength += encodedLength;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
};

export function registerSnapshotsRoutes({
  router,
  license,
  lib: { wrapEsError, handleEsError },
}: RouteDependencies) {
  // GET all snapshots
  router.get(
    {
      path: addBasePath('snapshots'),
      security: {
        authz: {
          enabled: false,
          reason: 'Relies on es client for authorization',
        },
      },
      validate: { query: snapshotListSchema },
    },
    license.guardApiRoute(async (ctx, req, res) => {
      const { client: clusterClient } = (await ctx.core).elasticsearch;
      const sortField =
        sortFieldToESParams[(req.query as TypeOf<typeof snapshotListSchema>).sortField];
      const sortDirection = (req.query as TypeOf<typeof snapshotListSchema>).sortDirection;
      const pageIndex = (req.query as TypeOf<typeof snapshotListSchema>).pageIndex;
      const pageSize = (req.query as TypeOf<typeof snapshotListSchema>).pageSize;
      const searchField = (req.query as TypeOf<typeof snapshotListSchema>).searchField;
      const searchValue = (req.query as TypeOf<typeof snapshotListSchema>).searchValue;
      const searchMatch = (req.query as TypeOf<typeof snapshotListSchema>).searchMatch;
      const searchOperator = (req.query as TypeOf<typeof snapshotListSchema>).searchOperator;

      const managedRepository = await getManagedRepositoryName(clusterClient.asCurrentUser);

      let policies: string[] = [];

      // Attempt to retrieve policies
      // This could fail if user doesn't have access to read SLM policies
      try {
        const policiesByName = await clusterClient.asCurrentUser.slm.getLifecycle();
        policies = Object.keys(policiesByName);
      } catch (e) {
        // Silently swallow error as policy names aren't required in UI
      }

      let repositories: string[] = [];

      try {
        const repositoriesByName = await clusterClient.asCurrentUser.snapshot.getRepository({
          name: '_all',
        });
        repositories = Object.keys(repositoriesByName);

        if (repositories.length === 0) {
          return res.ok({
            body: { snapshots: [], repositories: [], policies },
          });
        }
      } catch (e) {
        return handleEsError({ error: e, response: res });
      }

      // if the search is for a repository name with exact match (repository=test)
      // and that repository doesn't exist, ES request throws an error
      // that is why we return an empty snapshots array instead of sending an ES request
      if (
        searchField === 'repository' &&
        isSearchingForNonExistentRepository(repositories, searchValue!, searchMatch, searchOperator)
      ) {
        return res.ok({
          body: {
            snapshots: [],
            policies,
            repositories,
            errors: [],
            total: 0,
          },
        });
      }
      // Fetch the last successful snapshot from the managed repository (if it exists)
      // This is used to mark it as non-deletable in the UI
      let lastSuccessfulManagedSnapshot: SnapshotDetailsEs | undefined;
      if (managedRepository) {
        try {
          const lastSuccessfulResponse = await clusterClient.asCurrentUser.snapshot.get({
            repository: managedRepository,
            snapshot: '_all',
            state: 'SUCCESS',
            sort: 'start_time',
            order: 'desc',
            size: 1,
            offset: 0,
            ignore_unavailable: true,
          });
          lastSuccessfulManagedSnapshot = lastSuccessfulResponse.snapshots?.[0] as
            | SnapshotDetailsEs
            | undefined;
        } catch (e) {
          // Silently swallow errors - if we can't fetch this, we just won't mark any snapshot as protected
        }
      }

      try {
        // If any of these repositories 504 they will cost the request significant time.
        const fetchedSnapshots = await clusterClient.asCurrentUser.snapshot.get({
          repository:
            searchField === 'repository'
              ? getSnapshotSearchWildcard({
                  field: searchField,
                  value: searchValue!,
                  match: searchMatch,
                  operator: searchOperator,
                })
              : '_all',
          ignore_unavailable: true, // Allow request to succeed even if some snapshots are unavailable.
          snapshot:
            searchField === 'snapshot'
              ? getSnapshotSearchWildcard({
                  field: searchField,
                  value: searchValue!,
                  match: searchMatch,
                  operator: searchOperator,
                })
              : '_all',
          slm_policy_filter:
            searchField === 'policyName'
              ? getSnapshotSearchWildcard({
                  field: searchField,
                  value: searchValue!,
                  match: searchMatch,
                  operator: searchOperator,
                })
              : '*,_none',
          ...(searchField === 'state' && searchValue
            ? { state: searchValue as SnapshotSnapshotState }
            : {}),
          order: sortDirection,
          // @ts-expect-error sortField: string is not compatible with SnapshotSnapshotSort type
          sort: sortField,
          size: pageSize,
          offset: pageIndex * pageSize,
        });

        // Decorate each snapshot with the repository with which it's associated.
        const snapshots = fetchedSnapshots?.snapshots?.map((snapshot) => {
          const snapshotDetails = deserializeSnapshotDetails(
            snapshot as SnapshotDetailsEs,
            managedRepository
          );

          // Mark the last successful snapshot in a managed repository as non-deletable
          if (
            lastSuccessfulManagedSnapshot &&
            snapshot.snapshot === lastSuccessfulManagedSnapshot.snapshot &&
            snapshot.repository === managedRepository
          ) {
            snapshotDetails.isLastSuccessfulSnapshot = true;
          }

          return snapshotDetails;
        });

        return res.ok({
          body: {
            snapshots: snapshots || [],
            policies,
            repositories,
            // @ts-expect-error @elastic/elasticsearch https://github.com/elastic/elasticsearch-specification/issues/845
            errors: fetchedSnapshots?.failures,
            total: fetchedSnapshots?.total,
          },
        });
      } catch (e) {
        return handleEsError({ error: e, response: res });
      }
    })
  );

  const getOneParamsSchema = schema.object({
    repository: schema.string({ maxLength: 1000 }),
    snapshot: schema.string({ maxLength: 1000 }),
  });

  // GET one snapshot
  router.get(
    {
      path: addBasePath('snapshots/{repository}/{snapshot}'),
      security: {
        authz: {
          enabled: false,
          reason: 'Relies on es client for authorization',
        },
      },
      validate: { params: getOneParamsSchema },
    },
    license.guardApiRoute(async (ctx, req, res) => {
      const { client: clusterClient } = (await ctx.core).elasticsearch;
      const { repository, snapshot } = req.params as TypeOf<typeof getOneParamsSchema>;
      const managedRepository = await getManagedRepositoryName(clusterClient.asCurrentUser);

      try {
        const response = await clusterClient.asCurrentUser.snapshot.get({
          repository,
          snapshot: '_all',
          ignore_unavailable: true,
        });

        const { snapshots: snapshotsList } = response;

        if (!snapshotsList || snapshotsList.length === 0) {
          return res.notFound({ body: 'Snapshot not found' });
        }

        const selectedSnapshot = snapshotsList.find(
          ({ snapshot: snapshotName }) => snapshot === snapshotName
        ) as SnapshotDetailsEs;

        if (!selectedSnapshot) {
          // If snapshot doesn't exist, manually throw 404 here
          return res.notFound({ body: 'Snapshot not found' });
        }

        const successfulSnapshots = snapshotsList
          .filter(({ state }) => state === 'SUCCESS')
          .sort((a, b) => {
            return +new Date(b.end_time!) - +new Date(a.end_time!);
          }) as SnapshotDetailsEs[];

        return res.ok({
          body: deserializeSnapshotDetails(
            selectedSnapshot,
            managedRepository,
            successfulSnapshots
          ),
        });
      } catch (e) {
        return handleEsError({ error: e, response: res });
      }
    })
  );

  const deleteSchema = schema.arrayOf(
    schema.object({
      repository: schema.string({ maxLength: 1000 }),
      snapshot: schema.string({ maxLength: 1000 }),
    }),
    { maxSize: 1000 }
  );

  // DELETE one or multiple snapshots
  router.post(
    {
      path: addBasePath('snapshots/bulk_delete'),
      options: { timeout: { idleSocket: SNAPSHOT_DELETE_SOCKET_TIMEOUT_MS } },
      security: {
        authz: {
          enabled: false,
          reason: 'Relies on es client for authorization',
        },
      },
      validate: { body: deleteSchema },
    },
    license.guardApiRoute(async (ctx, req, res) => {
      const { client: clusterClient } = (await ctx.core).elasticsearch;

      const response: {
        itemsDeleted: Array<{ snapshot: string; repository: string }>;
        errors: any[];
      } = {
        itemsDeleted: [],
        errors: [],
      };

      const snapshots = req.body;

      // Group snapshots by repository so that each repository is handled with as few ES requests as possible
      const snapshotsByRepository = new Map<string, string[]>();
      for (const { snapshot, repository } of snapshots) {
        const snapshotNames = snapshotsByRepository.get(repository) ?? [];
        snapshotNames.push(snapshot);
        snapshotsByRepository.set(repository, snapshotNames);
      }

      const deleteBatches = [...snapshotsByRepository].flatMap(([repository, snapshotNames]) =>
        chunkSnapshotNames(repository, snapshotNames).map((chunk) => ({
          repository,
          snapshotNames: chunk,
        }))
      );

      type SnapshotId = (typeof snapshots)[number];

      const deleteSnapshots = async (repository: string, ids: SnapshotId[]): Promise<void> => {
        await clusterClient.asCurrentUser.snapshot.delete(
          { repository, snapshot: ids.map(({ snapshot }) => snapshot).join(',') },
          // Keep waiting for the deletion result instead of reporting a client timeout as a failure.
          { requestTimeout: 0 }
        );
        response.itemsDeleted.push(...ids);
      };

      const recordErrors = (ids: SnapshotId[], e: unknown) => {
        const error = wrapEsError(e);
        response.errors.push(...ids.map((id) => ({ id, error })));
      };

      const deleteBatch = async (repository: string, snapshotNames: string[]): Promise<void> => {
        const ids = snapshotNames.map((snapshot) => ({ snapshot, repository }));

        try {
          await deleteSnapshots(repository, ids);
        } catch (e) {
          if (ids.length === 1 || !isSnapshotMissingError(e)) {
            recordErrors(ids, e);
            return;
          }

          // A stale name (e.g. removed by SLM retention meanwhile) must not block the other snapshots in the batch:
          // retry them one by one so only the missing snapshot is reported as an error.
          for (const id of ids) {
            await deleteSnapshots(repository, [id]).catch((retryError) =>
              recordErrors([id], retryError)
            );
          }
        }
      };

      try {
        // We intentionally perform deletion requests sequentially (blocking) instead of in parallel (non-blocking):
        // ES runs at most one deletion per repository at a time and queues additional ones.
        for (const { repository, snapshotNames } of deleteBatches) {
          await deleteBatch(repository, snapshotNames);
        }

        return res.ok({ body: response });
      } catch (e) {
        return handleEsError({ error: e, response: res });
      }
    })
  );
}
