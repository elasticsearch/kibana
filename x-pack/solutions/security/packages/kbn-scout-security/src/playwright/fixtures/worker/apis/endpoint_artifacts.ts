/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SECURITY_SOLUTION_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import type { EsClient, KbnClient, ScoutLogger, ScoutParallelWorkerFixtures } from '@kbn/scout';
import { measurePerformanceAsync } from '@kbn/scout';
import { INTERNAL_API_HEADERS, PUBLIC_API_HEADERS } from '../../../constants/api_headers';

const EXCEPTION_LIST_URL = '/api/exception_lists';
const EXCEPTION_LIST_ITEM_URL = '/api/exception_lists/items';
const ENDPOINT_EXCEPTIONS_PER_POLICY_OPT_IN_ROUTE =
  '/internal/api/endpoint/endpoint_exceptions_per_policy_opt_in';

export interface CreateEndpointArtifactListInput {
  listId: string;
  type: string;
  name?: string;
}

export interface CreateEndpointArtifactItemInput {
  name: string;
  listId: string;
  entries: object[];
  osTypes: string[];
  policyId?: string;
}

export interface EndpointArtifactsApiService {
  createList: (input: CreateEndpointArtifactListInput) => Promise<void>;
  createItem: (input: CreateEndpointArtifactItemInput) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  deleteAll: (listIds: string[]) => Promise<void>;
  optInEndpointExceptionsPerPolicy: () => Promise<void>;
}

export const getEndpointArtifactsApiService = ({
  kbnClient,
  esClient,
  log,
  scoutSpace,
}: {
  kbnClient: KbnClient;
  esClient: EsClient;
  log: ScoutLogger;
  scoutSpace?: ScoutParallelWorkerFixtures['scoutSpace'];
}): EndpointArtifactsApiService => {
  const basePath = scoutSpace?.id ? `/s/${scoutSpace.id}` : '';

  /**
   * HTTP DELETE goes through the Saved Objects client so Kibana stops
   * serving the list (ES-only wipe leaves the SO layer stale → 409).
   * Then ES deleteByQuery + refresh removes leftover list_id copies and
   * items the API would miss. Match FTR endpoint_artifacts.deleteList.
   */
  const deleteList = async (listId: string) => {
    await kbnClient.request({
      method: 'DELETE',
      path: `${basePath}${EXCEPTION_LIST_URL}`,
      query: { list_id: listId, namespace_type: 'agnostic' },
      headers: PUBLIC_API_HEADERS,
      ignoreErrors: [404],
      retries: 0,
    });
    await esClient.deleteByQuery({
      index: SECURITY_SOLUTION_SAVED_OBJECT_INDEX,
      conflicts: 'proceed',
      refresh: true,
      ignore_unavailable: true,
      query: {
        bool: {
          filter: [{ term: { 'exception-list-agnostic.list_id': listId } }],
        },
      },
    });
  };

  return {
    createList: async ({ listId, type, name }) => {
      await measurePerformanceAsync(log, 'security.endpointArtifacts.createList', async () => {
        // Wipe items first. Opening an artifact tab/list page also
        // ensure-creates the list, so the following POST may 409 —
        // same as FTR ensureListExists.
        await deleteList(listId);
        await kbnClient.request({
          method: 'POST',
          path: `${basePath}${EXCEPTION_LIST_URL}`,
          headers: PUBLIC_API_HEADERS,
          ignoreErrors: [409],
          retries: 0,
          body: {
            name: name ?? listId,
            description: 'Scout endpoint artifact list',
            list_id: listId,
            type,
            namespace_type: 'agnostic',
          },
        });
      });
    },

    createItem: async ({ name, listId, entries, osTypes, policyId }) => {
      await measurePerformanceAsync(log, 'security.endpointArtifacts.createItem', async () => {
        await kbnClient.request({
          method: 'POST',
          path: `${basePath}${EXCEPTION_LIST_ITEM_URL}`,
          headers: PUBLIC_API_HEADERS,
          retries: 0,
          body: {
            name,
            description: '',
            type: 'simple',
            namespace_type: 'agnostic',
            list_id: listId,
            entries,
            os_types: osTypes,
            ...(policyId ? { tags: [`policy:${policyId}`] } : {}),
          },
        });
      });
    },

    deleteList,

    deleteAll: async (listIds) => {
      await measurePerformanceAsync(log, 'security.endpointArtifacts.deleteAll', async () => {
        for (const listId of listIds) {
          await deleteList(listId);
        }
      });
    },

    optInEndpointExceptionsPerPolicy: async () => {
      await measurePerformanceAsync(
        log,
        'security.endpointArtifacts.optInEndpointExceptionsPerPolicy',
        async () => {
          await kbnClient.request({
            method: 'POST',
            path: `${basePath}${ENDPOINT_EXCEPTIONS_PER_POLICY_OPT_IN_ROUTE}`,
            headers: INTERNAL_API_HEADERS,
            retries: 0,
          });
        }
      );
    },
  };
};
