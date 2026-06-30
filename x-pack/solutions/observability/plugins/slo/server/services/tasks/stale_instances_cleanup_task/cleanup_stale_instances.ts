/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, Logger, SavedObjectsClient } from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core-saved-objects-server';
import {
  DEFAULT_STALE_SLO_THRESHOLD_HOURS,
  SUMMARY_DESTINATION_INDEX_PATTERN,
} from '../../../../common/constants';
import type { StoredSLOSettings } from '../../../domain/models';
import { sloSettingsObjectId, SO_SLO_SETTINGS_TYPE } from '../../../saved_objects/slo_settings';
import type { QueryContainer, SpaceSloSettings, TaskState } from './types';

interface Dependencies {
  esClient: ElasticsearchClient;
  soClient: SavedObjectsClient;
  logger: Logger;
  abortController: AbortController;
}

const SPACES_PER_BATCH = 100;
const MAX_BATCHES_PER_RUN = 10;
const MAX_DOCS_PER_DELETE = 1_000_000;
const REQUESTS_PER_SECOND = 300;
const MAX_TASK_DURATION_NANOS = 24 * 60 * 60 * 1_000_000_000; // 24 hours

/**
 * At most we will delete MAX_DOCS_PER_DELETE documents in the delete by query (DBQ), using REQUESTS_PER_SECOND deletion per seconds.
 * Given that, we can estimate the maximum duration of the DBQ: 1M/300 = ~3333 seconds = ~55 minutes.
 * The task is scheduled to run every 4hours, so we have enough buffer to let the task complete before the next run.
 * However, in case the DBQ takes longer than expected, we check to see if the previous DBQ is still running.
 * If it is, we skip the current run to avoid overlapping delete tasks. We cancel previous DBQ if it has been running for more than MAX_TASK_DURATION_NANOS.
 */
export async function cleanupStaleInstances(
  previousState: TaskState,
  dependencies: Dependencies
): Promise<{ nextState: TaskState }> {
  const { logger } = dependencies;
  let { searchAfter, deleteTaskId } = previousState;

  try {
    if (deleteTaskId) {
      const isRunning = await isTaskRunning(deleteTaskId, dependencies);
      if (isRunning) {
        logger.debug(`Previous delete task ${deleteTaskId} still running, skipping this run`);
        return { nextState: { searchAfter, deleteTaskId } };
      }
      logger.debug(`Previous delete task ${deleteTaskId} completed`);
      deleteTaskId = undefined;
    }

    let batchesProcessed = 0;

    while (batchesProcessed < MAX_BATCHES_PER_RUN) {
      const { spaceIds, nextSearchAfter } = await getNextSpaceBatch(searchAfter, dependencies);

      if (spaceIds.length === 0) {
        logger.debug('No more spaces to process, resetting cursor for next full pass');
        return { nextState: {} };
      }

      logger.debug(`Processing batch ${batchesProcessed + 1}: ${spaceIds.length} spaces`);

      const enabledSettings = await getEnabledSpaceSettings(spaceIds, dependencies);

      if (enabledSettings.length === 0) {
        logger.debug('All spaces in batch have cleanup disabled, moving to next batch');
        searchAfter = nextSearchAfter;
        batchesProcessed++;

        if (spaceIds.length < SPACES_PER_BATCH) {
          logger.debug('Reached end of spaces, resetting cursor');
          return { nextState: {} };
        }
        continue;
      }

      const query = buildDeleteQuery(enabledSettings);
      const hasStaleDocuments = await hasDocumentsToDelete(query, dependencies);

      if (!hasStaleDocuments) {
        logger.debug('No stale documents in batch, moving to next batch');
        searchAfter = nextSearchAfter;
        batchesProcessed++;

        if (spaceIds.length < SPACES_PER_BATCH) {
          logger.debug('Reached end of spaces with no stale documents, resetting cursor');
          return { nextState: {} };
        }
        continue;
      }

      deleteTaskId = await executeDeleteByQuery(query, dependencies);
      const isLastBatch = spaceIds.length < SPACES_PER_BATCH;

      logger.debug(
        `Started stale instances deletion for ${enabledSettings.length} spaces. ` +
          `TaskId: ${deleteTaskId}, cursor: ${isLastBatch ? 'reset' : nextSearchAfter}`
      );

      return {
        nextState: {
          searchAfter: isLastBatch ? undefined : nextSearchAfter,
          deleteTaskId,
        },
      };
    }

    logger.debug(`Processed ${batchesProcessed} batches without stale documents, pausing`);
    return {
      nextState: {
        searchAfter,
      },
    };
  } catch (error) {
    if (error instanceof errors.RequestAbortedError) {
      logger.debug('Task aborted, saving progress for next run');
      return {
        nextState: {
          searchAfter,
          deleteTaskId,
        },
      };
    }

    throw error;
  }
}

async function isTaskRunning(taskId: string, dependencies: Dependencies): Promise<boolean> {
  const { esClient, logger, abortController } = dependencies;
  try {
    const response = await esClient.tasks.get(
      { task_id: taskId },
      { signal: abortController.signal }
    );

    if (response.completed) {
      return false;
    }

    const runningDurationInNanos = response.task?.running_time_in_nanos;
    if (runningDurationInNanos > MAX_TASK_DURATION_NANOS) {
      logger.debug(
        `Task ${taskId} has been running for ${runningDurationInNanos}ns, exceeding the maximum of ${MAX_TASK_DURATION_NANOS}ns. Cancelling it.`
      );

      try {
        await esClient.tasks.cancel({ task_id: taskId }, { signal: abortController.signal });
      } catch (cancelError) {
        logger.debug(`Failed to cancel task ${taskId}: ${cancelError}`);
      }
      return false;
    }

    return true;
  } catch (error) {
    if (error instanceof errors.RequestAbortedError) {
      throw error;
    }

    if (error?.meta?.statusCode === 404) {
      logger.debug(`Task ${taskId} not found, assuming it has completed`);
      return false;
    }

    logger.debug(`Failed to check task status for ${taskId}: ${error.message}`);
    return false;
  }
}

async function getNextSpaceBatch(
  searchAfter: string | undefined,
  dependencies: Dependencies
): Promise<{ spaceIds: string[]; nextSearchAfter?: string }> {
  const { esClient, abortController } = dependencies;
  const response = await esClient.search(
    {
      index: SUMMARY_DESTINATION_INDEX_PATTERN,
      size: 0,
      aggs: {
        spaces: {
          composite: {
            size: SPACES_PER_BATCH,
            sources: [{ spaceId: { terms: { field: 'spaceId' } } }],
            ...(searchAfter && { after: { spaceId: searchAfter } }),
          },
        },
      },
    },
    { signal: abortController.signal }
  );

  const agg = response.aggregations?.spaces as {
    buckets: Array<{ key: { spaceId: string } }>;
    after_key?: { spaceId: string };
  };

  return {
    spaceIds: agg?.buckets?.map((b) => b.key.spaceId) ?? [],
    nextSearchAfter: agg?.after_key?.spaceId,
  };
}

function buildDeleteQuery(settings: SpaceSloSettings[]): QueryContainer {
  const byThreshold = settings.reduce((acc, setting) => {
    const spaces = acc[setting.staleThresholdInHours] || [];
    spaces.push(setting.spaceId);
    acc[setting.staleThresholdInHours] = spaces;
    return acc;
  }, {} as Record<number, string[]>);

  const shouldClauses = Object.entries(byThreshold).map(([thresholdHours, spaceIds]) => {
    return {
      bool: {
        filter: [
          { terms: { spaceId: spaceIds } },
          { range: { summaryUpdatedAt: { lt: `now-${thresholdHours}h` } } },
        ],
      },
    };
  });

  return {
    bool: {
      should: shouldClauses,
      minimum_should_match: 1,
    },
  };
}

async function hasDocumentsToDelete(
  query: QueryContainer,
  dependencies: Dependencies
): Promise<boolean> {
  const { esClient, abortController } = dependencies;
  const response = await esClient.count(
    {
      index: SUMMARY_DESTINATION_INDEX_PATTERN,
      terminate_after: 1,
      query: query as QueryDslQueryContainer,
    },
    { signal: abortController.signal }
  );

  return response.count > 0;
}

async function executeDeleteByQuery(
  query: QueryContainer,
  dependencies: Dependencies
): Promise<string | undefined> {
  const { esClient, logger, abortController } = dependencies;
  const response = await esClient.deleteByQuery(
    {
      index: SUMMARY_DESTINATION_INDEX_PATTERN,
      wait_for_completion: false,
      conflicts: 'proceed',
      slices: 'auto',
      max_docs: MAX_DOCS_PER_DELETE,
      requests_per_second: REQUESTS_PER_SECOND,
      query: query as QueryDslQueryContainer,
    },
    { signal: abortController.signal }
  );

  const taskId = 'task' in response ? response.task : undefined;
  if (taskId) {
    logger.debug(`Started deleteByQuery task: ${taskId}`);
  }

  return taskId;
}

async function getEnabledSpaceSettings(
  spaceIds: string[],
  dependencies: Dependencies
): Promise<SpaceSloSettings[]> {
  const { soClient, logger } = dependencies;

  const settingsObjects = spaceIds.map((id) => ({
    type: SO_SLO_SETTINGS_TYPE,
    id: sloSettingsObjectId(id),
    spaceId: id,
  }));

  let response;
  try {
    response = await soClient.bulkGet<StoredSLOSettings>(
      settingsObjects.map((obj) => ({
        type: obj.type,
        id: obj.id,
      }))
    );
  } catch (error) {
    logger.debug(`Failed to fetch space settings, using none: ${error}`);
    return [];
  }

  const enabledSettings: SpaceSloSettings[] = [];

  for (const result of response.saved_objects) {
    const spaceId = settingsObjects.find((obj) => obj.id === result.id)?.spaceId ?? 'default';
    if (isSavedObjectErrorResult(result)) {
      logger.debug(`Skipping space '${spaceId}': no settings found`);
      continue;
    }

    const settings = result.attributes;
    if (settings.staleInstancesCleanupEnabled !== true) {
      logger.debug(`Skipping space '${spaceId}': stale instances cleanup disabled`);
      continue;
    }

    enabledSettings.push({
      spaceId,
      staleThresholdInHours:
        typeof settings.staleThresholdInHours === 'number'
          ? settings.staleThresholdInHours
          : DEFAULT_STALE_SLO_THRESHOLD_HOURS,
    });
  }

  return enabledSettings;
}
