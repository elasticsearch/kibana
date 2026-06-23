/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';

import { bulkIndexWithOccRetry, toOccHit } from './bulk_occ_index';
import { paginateWithSearchAfter } from './paginate_with_search_after';
import { updateWorkflowYamlFields } from '../../../common/lib/yaml';
import type { WorkflowProperties, WorkflowStorage } from '../../storage/workflow_storage';
import { unscheduleWorkflowTasks } from '../../task_defs/unschedule_workflow_tasks';
import type { WorkflowTaskScheduler } from '../../tasks/workflow_task_scheduler';

const mutateWorkflowToDisabled = (source: WorkflowProperties): WorkflowProperties => {
  const updatedYaml = updateWorkflowYamlFields(source.yaml, { enabled: false }, false);
  return {
    ...source,
    enabled: false,
    yaml: updatedYaml,
  };
};

/**
 * Disables all enabled workflows. When `spaceId` is set, scopes the operation
 * to that space (user-initiated opt-out); otherwise operates across all spaces
 * for system availability (license / config). Sets `enabled: false`, patches
 * YAML accordingly, and unschedules any scheduled tasks.
 */
export const disableAllWorkflows = async (params: {
  storage: WorkflowStorage;
  taskScheduler: WorkflowTaskScheduler | null;
  logger: Logger;
  spaceId?: string;
  versioningEnabled?: boolean;
}): Promise<{
  total: number;
  disabled: number;
  failures: Array<{ id: string; error: string }>;
  disabledWorkflows: Array<{ id: string; document: WorkflowProperties }>;
}> => {
  const { storage, taskScheduler, logger, spaceId, versioningEnabled = false } = params;
  const client = storage.getClient();
  const pageSize = 1000;
  const failures: Array<{ id: string; error: string }> = [];
  const disabledIds: string[] = [];
  const disabledWorkflows: Array<{ id: string; document: WorkflowProperties }> = [];

  const query = {
    bool: {
      must: [{ term: { enabled: true } }, ...(spaceId ? [{ term: { spaceId } }] : [])],
      must_not: [{ exists: { field: 'deleted_at' } }],
    },
  };
  const sort = [{ updated_at: { order: 'desc' as const } }, '_shard_doc'];

  const { totalProcessed } = await paginateWithSearchAfter<WorkflowProperties>(
    {
      search: (searchAfter) =>
        client.search({
          query,
          size: pageSize,
          sort,
          _source: true,
          seq_no_primary_term: true,
          track_total_hits: false,
          ...(searchAfter ? { search_after: searchAfter } : {}),
        }),
      pageSize,
      logger,
      operationName: 'disableAllWorkflows',
    },
    async (hits) => {
      try {
        const occHits = hits.map((hit) => toOccHit(hit));
        const {
          successIds,
          successfulDocuments,
          failures: bulkFailures,
        } = await bulkIndexWithOccRetry({
          client,
          hits: occHits,
          mutate: mutateWorkflowToDisabled,
          logger,
          versioningEnabled,
        });

        failures.push(...bulkFailures);

        if (successIds.length > 0) {
          disabledWorkflows.push(...successfulDocuments);
          disabledIds.push(...successIds);
          await unscheduleWorkflowTasks(successIds, taskScheduler);
        }
      } catch (error) {
        hits.forEach((hit) => {
          failures.push({
            id: hit._id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }
  );

  logger.info(
    `Disabled ${disabledIds.length} workflows${
      spaceId ? ` in space ${spaceId}` : ' across all spaces'
    } (${failures.length} failures)`
  );

  return {
    total: totalProcessed,
    disabled: disabledIds.length,
    failures,
    disabledWorkflows,
  };
};
