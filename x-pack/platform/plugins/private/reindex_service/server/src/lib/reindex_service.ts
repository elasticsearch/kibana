/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { firstValueFrom } from 'rxjs';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import { i18n } from '@kbn/i18n';

import type {
  IndicesAlias,
  IndicesIndexSettings,
  IndicesUpdateAliasesRequest,
} from '@elastic/elasticsearch/lib/api/types';
import { esIndicesStateCheck, getReindexWarnings } from '@kbn/upgrade-assistant-pkg-server';
import type { Version } from '@kbn/upgrade-assistant-pkg-common';
import { ReindexStatus } from '@kbn/upgrade-assistant-pkg-common';
import { ReindexStep } from '../../../common';
import type { IndexSettings, IndexWarning, ReindexArgs } from '../../../common';
import type { ReindexSavedObject } from './types';
import type { CreateReindexOpArgs } from './reindex_actions';

import type { ReindexActions } from './reindex_actions';

import { error } from './error';

export interface ReindexService {
  /**
   * Checks whether or not the user has proper privileges required to reindex this index.
   * @param indexName
   */
  hasRequiredPrivileges(indexNames: string[]): Promise<boolean>;

  /**
   * Checks an index's settings and mappings to flag potential issues during reindex.
   * Resolves to null if index does not exist.
   * @param indexName
   */
  detectReindexWarnings(indexName: string): Promise<IndexWarning[] | undefined>;

  /**
   * Creates a new reindex operation for a given index.
   * @param indexName
   * @param opts Additional options when creating a new reindex operation
   */
  createReindexOperation({
    indexName,
    newIndexName,
    opts,
    settings,
  }: {
    indexName: string;
    newIndexName: string;
    opts?: { enqueue?: boolean };
    settings?: IndexSettings;
  }): Promise<ReindexSavedObject>;

  /**
   * Retrieves all reindex operations that have the given status.
   * @param status
   */
  findAllByStatus(status: ReindexStatus): Promise<ReindexSavedObject[]>;

  /**
   * Finds the reindex operation for the given index.
   * Resolves to null if there is no existing reindex operation for this index.
   * @param indexName
   */
  findReindexOperation(indexName: string): Promise<ReindexSavedObject | null>;

  /**
   * Delete reindex operations for completed indices with deprecations.
   * @param indexNames
   */
  cleanupReindexOperations(indexNames: string[]): Promise<void> | null;

  /**
   * Process the reindex operation through one step of the state machine and resolves
   * to the updated reindex operation.
   * @param reindexOp
   */
  processNextStep(reindexOp: ReindexSavedObject): Promise<ReindexSavedObject>;

  /**
   * Pauses the in-progress reindex operation for a given index.
   * @param indexName
   */
  pauseReindexOperation(indexName: string): Promise<ReindexSavedObject>;

  /**
   * Resumes the paused reindex operation for a given index.
   * @param indexName
   * @param opts As with {@link createReindexOperation} we support this setting.
   */
  resumeReindexOperation(
    indexName: string,
    opts?: ReindexArgs['reindexOptions']
  ): Promise<ReindexSavedObject>;

  /**
   * Update the update_at field on the reindex operation
   *
   * @remark
   * Currently also sets a startedAt field on the SavedObject, not really used
   * elsewhere, but is an indication that the object has started being processed.
   *
   * @param indexName
   */
  startQueuedReindexOperation(indexName: string): Promise<ReindexSavedObject>;

  /**
   * Cancel an in-progress reindex operation for a given index. Only allowed when the
   * reindex operation is in the ReindexStep.reindexStarted step. Relies on the ReindexWorker
   * to continue processing the reindex operation to detect that the Reindex Task in ES has been
   * cancelled.
   * @param indexName
   */
  cancelReindexing(indexName: string): Promise<ReindexSavedObject>;

  /**
   * Obtain metadata about the index, including aliases and settings
   * @param indexName
   */
  getIndexInfo(indexName: string): Promise<{
    aliases: Record<string, IndicesAlias>;
    settings?: IndicesIndexSettings;
    isInDataStream: boolean;
    isFollowerIndex: boolean;
  }>;
}

export const reindexServiceFactory = (
  esClient: ElasticsearchClient,
  actions: ReindexActions,
  log: Logger,
  licensing: LicensingPluginStart,
  kibanaVersion: Version,
  isServerless: boolean = false
): ReindexService => {
  // ------ Utility functions
  const cleanupChanges = async (reindexOp: ReindexSavedObject) => {
    // Cancel reindex task if it was started but not completed
    if (reindexOp.attributes.lastCompletedStep === ReindexStep.reindexStarted) {
      await esClient.tasks
        .cancel({
          task_id: reindexOp.attributes.reindexTaskId ?? undefined,
        })
        .catch(() => undefined); // Ignore any exceptions trying to cancel (it may have already completed).
    }

    // Set index back to writable if we ever got past this point.
    if (reindexOp.attributes.lastCompletedStep >= ReindexStep.readonly) {
      await esClient.indices.putSettings({
        index: reindexOp.attributes.indexName,
        settings: { blocks: { write: false } },
      });
    }

    if (
      reindexOp.attributes.lastCompletedStep >= ReindexStep.newIndexCreated &&
      reindexOp.attributes.lastCompletedStep < ReindexStep.aliasCreated
    ) {
      await esClient.indices.delete({
        index: reindexOp.attributes.newIndexName,
      });
    }

    return reindexOp;
  };

  // ------ Functions used to process the state machine

  /**
   * Sets a write-block on the original index. New data cannot be indexed until
   * the reindex is completed; there will be downtime for indexing until the
   * reindex is completed.
   * @param reindexOp
   */
  const setReadonly = async (reindexOp: ReindexSavedObject) => {
    const { indexName, rollupJob } = reindexOp.attributes;

    if (rollupJob) {
      await esClient.rollup.stopJob({ id: rollupJob, wait_for_completion: true });
    }

    const putReadonly = await esClient.indices.putSettings({
      index: indexName,
      body: { blocks: { write: true } },
    });

    if (!putReadonly.acknowledged) {
      throw new Error(`Index could not be set to read-only.`);
    }

    return actions.updateReindexOp(reindexOp, { lastCompletedStep: ReindexStep.readonly });
  };

  /**
   * Creates a new index with the same mappings and settings as the original index.
   * @param reindexOp
   */
  const createNewIndex = async (reindexOp: ReindexSavedObject) => {
    const { indexName, newIndexName, settings: settingsStr } = reindexOp.attributes;

    const flatSettings = await actions.getFlatSettings(indexName);
    if (!flatSettings) {
      throw error.indexNotFound(`Index ${indexName} does not exist.`);
    }

    let newSettings: IndexSettings;

    try {
      newSettings = settingsStr ? JSON.parse(settingsStr) : {};
    } catch (err) {
      throw new Error(`Could not parse index settings: ${err}`);
    }

    const { settings = {} } = flatSettings;

    // Backup the current settings to restore them after the reindex
    // https://github.com/elastic/kibana/issues/201605
    // In serverless mode, index.number_of_replicas setting is not available
    // Filter out undefined values to prevent them from overriding null in settingsToApply
    const indexRefreshInterval = settings['index.refresh_interval'];
    const indexNumberOfReplicas = settings['index.number_of_replicas'];

    const backupSettings = {
      ...(indexRefreshInterval !== undefined && {
        'index.refresh_interval': indexRefreshInterval,
      }),
      ...(!isServerless &&
        indexNumberOfReplicas !== undefined && {
          'index.number_of_replicas': indexNumberOfReplicas,
        }),
    };

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const settings_override = isServerless
      ? {
          ...newSettings,
          // Reindexing optimization (skip number_of_replicas in serverless mode)
          'index.refresh_interval': -1,
        }
      : {
          ...newSettings,
          // Reindexing optimizations
          'index.number_of_replicas': 0,
          'index.refresh_interval': -1,
        };

    let createIndex;
    try {
      createIndex = await esClient.transport.request<{ acknowledged: boolean }>({
        method: 'POST',
        path: `_create_from/${indexName}/${newIndexName}`,
        body: {
          settings_override,
        },
      });
      /**
       * Response is expected to be:
       * {
       *   "acknowledged": true,
       *   "shards_acknowledged": true,
       *   "index": "test-copy"
       * }
       */
    } catch (err) {
      // If for any reason the new index name generated by the `generateNewIndexName` already
      // exists (this could happen if kibana is restarted during reindexing), we can just go
      // ahead with the process without needing to create the index again.
      // See: https://github.com/elastic/kibana/issues/123816
      if (err?.body?.error?.type !== 'resource_already_exists_exception') {
        throw err;
      }
    }

    if (createIndex && !createIndex?.acknowledged) {
      throw error.cannotCreateIndex(`Index could not be created: ${newIndexName}`);
    }

    return actions.updateReindexOp(reindexOp, {
      lastCompletedStep: ReindexStep.newIndexCreated,
      backupSettings,
    });
  };

  /**
   * Begins the reindex process via Elasticsearch's Reindex API.
   * @param reindexOp
   */
  const startReindexing = async (reindexOp: ReindexSavedObject) => {
    const { indexName, reindexOptions } = reindexOp.attributes;

    // Where possible, derive reindex options at the last moment before reindexing
    // to prevent them from becoming stale as they wait in the queue.
    const indicesState = await esIndicesStateCheck(esClient, [indexName]);
    const shouldOpenAndClose = indicesState[indexName] === 'closed';
    if (shouldOpenAndClose) {
      log.debug(`Detected closed index ${indexName}, opening...`);
      await esClient.indices.open({ index: indexName });
    }

    const flatSettings = await actions.getFlatSettings(indexName);
    if (!flatSettings) {
      throw error.indexNotFound(`Index ${indexName} does not exist.`);
    }

    const startReindexResponse = await esClient.reindex({
      refresh: true,
      wait_for_completion: false,
      source: { index: indexName },
      dest: { index: reindexOp.attributes.newIndexName },
      // Speed optimization https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-reindex.html#docs-reindex-automatic-slice
      // It doesn't work on CCS, but remote clusters should be upgraded individually with their own Upgrade Assistant.
      slices: 'auto',
    });

    return actions.updateReindexOp(reindexOp, {
      lastCompletedStep: ReindexStep.reindexStarted,
      reindexTaskId:
        startReindexResponse.task === undefined
          ? startReindexResponse.task
          : String(startReindexResponse.task),
      reindexTaskPercComplete: 0,
      reindexOptions: {
        ...(reindexOptions ?? {}),
        // Indicate to downstream states whether we opened a closed index that should be
        // closed again.
        openAndClose: shouldOpenAndClose,
      },
    });
  };

  /**
   * Polls Elasticsearch's Tasks API to see if the reindex operation has been completed.
   * @param reindexOp
   */
  const updateReindexStatus = async (reindexOp: ReindexSavedObject) => {
    const taskId = reindexOp.attributes.reindexTaskId!;

    // Check reindexing task progress
    const taskResponse = await esClient.tasks.get({
      task_id: taskId,
      wait_for_completion: false,
    });

    if (!taskResponse.completed) {
      // Updated the percent complete
      const perc = taskResponse.task.status!.created / taskResponse.task.status!.total;
      return actions.updateReindexOp(reindexOp, {
        reindexTaskPercComplete: perc,
      });
    } else if (taskResponse.task.status?.canceled === 'by user request') {
      // Set the status to cancelled
      reindexOp = await actions.updateReindexOp(reindexOp, {
        status: ReindexStatus.cancelled,
      });

      // Do any other cleanup work necessary
      reindexOp = await cleanupChanges(reindexOp);
    } else {
      // Check that no failures occurred
      if (taskResponse.response?.failures?.length) {
        // Include the entire task result in the error message. This should be guaranteed
        // to be JSON-serializable since it just came back from Elasticsearch.
        throw error.reindexTaskFailed(`Reindexing failed: ${JSON.stringify(taskResponse)}`);
      }

      // Update the status
      reindexOp = await actions.updateReindexOp(reindexOp, {
        lastCompletedStep: ReindexStep.reindexCompleted,
        reindexTaskPercComplete: 1,
      });
    }

    try {
      // Best effort, delete the task from ES .tasks index...
      await esClient.delete({
        index: '.tasks',
        id: taskId,
      });
    } catch (e) {
      // We explicitly ignore authz related error codes bc we expect this to be
      // very common when deleting from .tasks
      if (e?.statusCode !== 401 && e?.statusCode !== 403) {
        log.warn(e);
      }
    }

    return reindexOp;
  };

  const getIndexInfo = async (indexName: string) => {
    const response = await esClient.indices.get({
      index: indexName,
      features: ['aliases', 'settings'],
    });

    const aliases = response[indexName]?.aliases ?? {};
    const settings = response[indexName]?.settings?.index ?? {};
    const isInDataStream = Boolean(response[indexName]?.data_stream);

    // Check if the index is a follower index
    let isFollowerIndex = false;
    try {
      const ccrResponse = await esClient.ccr.followInfo({ index: indexName });
      isFollowerIndex = ccrResponse.follower_indices?.length > 0;
    } catch (err) {
      // If the API returns a 404, it means the index is not a follower index
      // Any other error should be ignored and we'll default to false
      isFollowerIndex = false;
    }

    return { aliases, settings, isInDataStream, isFollowerIndex };
  };

  const isIndexHidden = async (indexName: string) => {
    const response = await esClient.indices.getSettings({ index: indexName });
    const isHidden = response[indexName]?.settings?.index?.hidden;
    return isHidden === true || isHidden === 'true';
  };

  /**
   * Restores the original index settings in the new index that had other defaults for reindexing performance reasons
   * Also removes any deprecated index settings found in warnings
   * @param reindexOp
   */
  const restoreIndexSettings = async (reindexOp: ReindexSavedObject) => {
    const { newIndexName, backupSettings, indexName } = reindexOp.attributes;

    // Build settings to restore or remove
    // In serverless mode, index.number_of_replicas setting is not available
    // Defaulting to null in case the original setting was empty to remove the setting.
    const settingsToApply: IndicesIndexSettings = isServerless
      ? {
          'index.refresh_interval': null,
          ...backupSettings,
        }
      : {
          'index.number_of_replicas': null,
          'index.refresh_interval': null,
          ...backupSettings,
        };

    // Get the warnings for this index to check for deprecated settings
    const flatSettings = await actions.getFlatSettings(indexName);
    const warnings = flatSettings
      ? getReindexWarnings(flatSettings, kibanaVersion.getMajorVersion())
      : undefined;
    const indexSettingsWarning = warnings?.find(
      (warning) =>
        warning.warningType === 'indexSetting' &&
        (warning.flow === 'reindex' || warning.flow === 'all')
    );

    // If there are deprecated settings, set them to null to remove them
    if (indexSettingsWarning?.meta?.deprecatedSettings) {
      const deprecatedSettings = indexSettingsWarning.meta.deprecatedSettings as string[];
      for (const setting of deprecatedSettings) {
        settingsToApply[setting] = null;
      }
      log.info(
        `Removing deprecated settings ${deprecatedSettings.join(
          ', '
        )} from reindexed index ${newIndexName}`
      );
    }

    const settingsResponse = await esClient.indices.putSettings({
      index: newIndexName,
      settings: settingsToApply,
      // Any static settings that would ordinarily only be updated on closed indices
      // will be updated by automatically closing and reopening the affected indices.
      // @ts-ignore - This is not in the ES types, but it is a valid option
      reopen: true,
    });

    if (!settingsResponse.acknowledged) {
      throw error.cannotCreateIndex(`The original index settings could not be restored.`);
    }

    return actions.updateReindexOp(reindexOp, {
      lastCompletedStep: ReindexStep.indexSettingsRestored,
    });
  };

  /**
   * Creates an alias that points the old index to the new index, deletes the old index.
   * If old index was closed, the new index will also be closed.
   *
   * @note indexing/writing to the new index is effectively enabled after this action!
   * @param reindexOp
   */
  const switchAlias = async (reindexOp: ReindexSavedObject) => {
    const { indexName, newIndexName, reindexOptions } = reindexOp.attributes;

    const existingAliases = (await getIndexInfo(indexName)).aliases;

    const extraAliases = Object.keys(existingAliases).map((aliasName) => ({
      add: { index: newIndexName, alias: aliasName, ...existingAliases[aliasName] },
    }));

    const isHidden = await isIndexHidden(indexName);

    const updateAliasActions: IndicesUpdateAliasesRequest['actions'] = reindexOp.attributes
      .reindexOptions?.deleteOldIndex
      ? [
          { add: { index: newIndexName, alias: indexName, is_hidden: isHidden } },
          { remove_index: { index: indexName } },
          ...extraAliases,
        ]
      : extraAliases;

    if (updateAliasActions.length) {
      const aliasResponse = await esClient.indices.updateAliases({
        actions: updateAliasActions,
      });

      if (!aliasResponse.acknowledged) {
        throw error.cannotCreateIndex(`Index aliases could not be created.`);
      }
    }

    if (reindexOptions?.openAndClose === true) {
      await esClient.indices.close({ index: indexName });
    }

    if (reindexOp.attributes.rollupJob) {
      // start the rollup job. rollupJob is undefined if the rollup job is stopped
      await esClient.rollup.startJob({ id: reindexOp.attributes.rollupJob });
    }

    return actions.updateReindexOp(reindexOp, {
      lastCompletedStep: ReindexStep.aliasCreated,
    });
  };

  // ------ The service itself

  return {
    async hasRequiredPrivileges(names: string[]) {
      /**
       * To avoid a circular dependency on Security we use a work around
       * here to detect whether Security is available and enabled
       * (i.e., via the licensing plugin). This enables Security to use
       * functionality exposed through Upgrade Assistant.
       */
      const license = await firstValueFrom(licensing.license$);

      const securityFeature = license.getFeature('security');

      // If security is disabled or unavailable, return true.
      if (!securityFeature || !(securityFeature.isAvailable && securityFeature.isEnabled)) {
        return true;
      }

      const resp = await esClient.security.hasPrivileges({
        cluster: ['manage'],
        index: [
          {
            names,
            allow_restricted_indices: true,
            privileges: ['all'],
          },
        ],
      });

      return resp.has_all_requested;
    },

    async detectReindexWarnings(indexName: string): Promise<IndexWarning[] | undefined> {
      const flatSettings = await actions.getFlatSettings(indexName);
      if (!flatSettings) {
        return undefined;
      } else {
        return [
          // By default all reindexing operations will replace an index with an alias (with the same name)
          // pointing to a newly created "reindexed" index. This is destructive as delete operations originally
          // done on the index itself will now need to be done to the "reindexed-{indexName}"
          {
            warningType: 'makeIndexReadonly',
            flow: 'readonly',
          },
          {
            warningType: 'replaceIndexWithAlias',
            flow: 'reindex',
          },
          ...getReindexWarnings(flatSettings, kibanaVersion.getMajorVersion()),
        ];
      }
    },

    async createReindexOperation({
      indexName,
      newIndexName,
      opts,
      settings,
    }: {
      indexName: string;
      newIndexName: string;
      opts?: ReindexArgs['reindexOptions'];
      settings?: IndexSettings;
    }) {
      const indexExists = await esClient.indices.exists({ index: indexName });
      if (!indexExists) {
        throw error.indexNotFound(
          i18n.translate('xpack.reindexService.error.indexNotFound', {
            defaultMessage: 'Index {indexName} does not exist in this cluster.',
            values: { indexName },
          })
        );
      }

      const newIndexExists = await esClient.indices.exists({ index: newIndexName });
      if (newIndexExists) {
        throw error.indexAlreadyExists(
          i18n.translate('xpack.reindexService.error.indexAlreadyExists', {
            defaultMessage: 'The index {newIndexName} already exists. Please try again.',
            values: { newIndexName },
          })
        );
      }

      const existingReindexOps = await actions.findReindexOperations(indexName);
      if (existingReindexOps.total !== 0) {
        const existingOp = existingReindexOps.saved_objects[0];
        if (
          existingOp.attributes.status === ReindexStatus.failed ||
          existingOp.attributes.status === ReindexStatus.cancelled ||
          existingOp.attributes.status === ReindexStatus.completed
        ) {
          // Delete the existing one if it failed or was cancelled to give a chance to retry.
          await actions.deleteReindexOp(existingOp);
        } else {
          throw error.reindexAlreadyInProgress(
            `A reindex operation already in-progress for ${indexName}`
          );
        }
      }

      const reindexOptions: CreateReindexOpArgs['reindexOptions'] = {};
      if (opts?.enqueue) {
        reindexOptions.queueSettings = { queuedAt: Date.now() };
      }
      if (opts?.deleteOldIndex) {
        reindexOptions.deleteOldIndex = true;
      }

      return actions.createReindexOp({
        indexName,
        newIndexName,
        reindexOptions,
        settings,
      });
    },

    async findReindexOperation(indexName: string) {
      const findResponse = await actions.findReindexOperations(indexName);

      // Bail early if it does not exist or there is more than one.
      if (findResponse.total === 0) {
        return null;
      } else if (findResponse.total > 1) {
        throw error.multipleReindexJobsFound(
          `More than one reindex operation found for ${indexName}`
        );
      }

      return findResponse.saved_objects[0];
    },

    async cleanupReindexOperations(indexNames: string[]) {
      const performCleanup = async (indexName: string) => {
        const existingReindexOps = await actions.findReindexOperations(indexName);

        if (existingReindexOps && existingReindexOps.total !== 0) {
          const existingOp = existingReindexOps.saved_objects[0];
          if (existingOp.attributes.status === ReindexStatus.completed) {
            // Delete the existing one if its status is completed, but still contains deprecation warnings
            // example scenario: index was upgraded, but then deleted and restored with an old snapshot
            await actions.deleteReindexOp(existingOp);
          }
        }
      };

      await Promise.all(indexNames.map(performCleanup));
    },

    findAllByStatus: actions.findAllByStatus,

    async processNextStep(reindexOp: ReindexSavedObject) {
      return actions.runWhileLocked(reindexOp, async (lockedReindexOp) => {
        try {
          switch (lockedReindexOp.attributes.lastCompletedStep) {
            case ReindexStep.created:
              lockedReindexOp = await setReadonly(lockedReindexOp);
              break;
            case ReindexStep.readonly:
              lockedReindexOp = await createNewIndex(lockedReindexOp);
              break;
            case ReindexStep.newIndexCreated:
              lockedReindexOp = await startReindexing(lockedReindexOp);
              break;
            case ReindexStep.reindexStarted:
              lockedReindexOp = await updateReindexStatus(lockedReindexOp);
              break;
            case ReindexStep.reindexCompleted:
              lockedReindexOp = await restoreIndexSettings(lockedReindexOp);
              break;
            case ReindexStep.indexSettingsRestored:
              lockedReindexOp = await switchAlias(lockedReindexOp);
              break;
            case ReindexStep.aliasCreated:
              lockedReindexOp = await actions.updateReindexOp(lockedReindexOp, {
                status: ReindexStatus.completed,
              });
              break;
            default:
              break;
          }
        } catch (e) {
          log.error(`Reindexing step failed: ${e instanceof Error ? e.stack : e.toString()}`);

          // Trap the exception and add the message to the object so the UI can display it.
          lockedReindexOp = await actions.updateReindexOp(lockedReindexOp, {
            status: ReindexStatus.failed,
            errorMessage: e.toString(),
          });

          // Cleanup any changes, ignoring any errors.
          lockedReindexOp = await cleanupChanges(lockedReindexOp).catch((err) => lockedReindexOp);
        }

        return lockedReindexOp;
      });
    },

    async pauseReindexOperation(indexName: string) {
      const reindexOp = await this.findReindexOperation(indexName);

      if (!reindexOp) {
        throw new Error(`No reindex operation found for index ${indexName}`);
      }

      return actions.runWhileLocked(reindexOp, async (op) => {
        if (op.attributes.status === ReindexStatus.paused) {
          // Another node already paused the operation, don't do anything
          return reindexOp;
        } else if (op.attributes.status !== ReindexStatus.inProgress) {
          throw new Error(`Reindex operation must be inProgress in order to be paused.`);
        }

        return actions.updateReindexOp(op, { status: ReindexStatus.paused });
      });
    },

    async resumeReindexOperation(indexName, opts) {
      const reindexOp = await this.findReindexOperation(indexName);

      if (!reindexOp) {
        throw new Error(`No reindex operation found for index ${indexName}`);
      }

      return actions.runWhileLocked(reindexOp, async (op) => {
        if (op.attributes.status === ReindexStatus.inProgress) {
          // Another node already resumed the operation, don't do anything
          return reindexOp;
        } else if (op.attributes.status !== ReindexStatus.paused) {
          throw new Error(`Reindex operation must be paused in order to be resumed.`);
        }
        const { queueSettings: _previousQueueSettings, ...previousReindexOptions } =
          op.attributes.reindexOptions ?? {};
        const reindexOptions: ReindexSavedObject['attributes']['reindexOptions'] = {
          ...previousReindexOptions,
          ...(opts?.enqueue ? { queueSettings: { queuedAt: Date.now() } } : {}),
          ...(opts?.deleteOldIndex ? { deleteOldIndex: true } : {}),
        };

        return actions.updateReindexOp(op, {
          status: ReindexStatus.inProgress,
          reindexOptions: Object.keys(reindexOptions).length ? reindexOptions : undefined,
        });
      });
    },

    async startQueuedReindexOperation(indexName: string) {
      const reindexOp = await this.findReindexOperation(indexName);

      if (!reindexOp) {
        throw error.indexNotFound(`No reindex operation found for index ${indexName}`);
      }

      if (!reindexOp.attributes.reindexOptions?.queueSettings) {
        throw error.reindexIsNotInQueue(`Reindex operation ${indexName} is not in the queue.`);
      }

      return actions.runWhileLocked(reindexOp, async (lockedReindexOp) => {
        const { reindexOptions } = lockedReindexOp.attributes;
        reindexOptions!.queueSettings!.startedAt = Date.now();
        return actions.updateReindexOp(lockedReindexOp, {
          reindexOptions,
        });
      });
    },

    async cancelReindexing(indexName: string) {
      const reindexOp = await this.findReindexOperation(indexName);

      if (!reindexOp) {
        throw error.indexNotFound(`No reindex operation found for index ${indexName}`);
      } else if (reindexOp.attributes.status !== ReindexStatus.inProgress) {
        throw error.reindexCannotBeCancelled(`Reindex operation is not in progress`);
      } else if (reindexOp.attributes.lastCompletedStep !== ReindexStep.reindexStarted) {
        throw error.reindexCannotBeCancelled(
          `Reindex operation is not currently waiting for reindex task to complete`
        );
      }

      const resp = await esClient.tasks.cancel({
        task_id: reindexOp.attributes.reindexTaskId!,
      });

      if (resp.node_failures && resp.node_failures.length > 0) {
        throw error.reindexCannotBeCancelled(`Could not cancel reindex.`);
      }

      return reindexOp;
    },

    getIndexInfo,
  };
};
