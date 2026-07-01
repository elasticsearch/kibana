/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * This module contains helpers for managing the task manager storage layer.
 */
import murmurhash from 'murmurhash';
import { v4 } from 'uuid';
import { Subject } from 'rxjs';
import { omit, defaults, get } from 'lodash';
import type { SavedObjectError } from '@kbn/core-saved-objects-common';

import type { estypes } from '@elastic/elasticsearch';
import type {
  SavedObjectsBulkDeleteResponse,
  Logger,
  SavedObjectsServiceStart,
  SavedObjectsClientContract,
  SecurityServiceStart,
  KibanaRequest,
  SavedObject,
  ISavedObjectsSerializer,
  SavedObjectsRawDoc,
  ISavedObjectsRepository,
  ElasticsearchClient,
  SavedObjectsBulkCreateObject,
  SavedObjectsBulkUpdateObject,
} from '@kbn/core/server';

import {
  isSavedObjectErrorResult,
  SECURITY_EXTENSION_ID,
  SPACES_EXTENSION_ID,
} from '@kbn/core/server';

import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-shared';

import { decodeRequestVersion, encodeVersion } from '@kbn/core-saved-objects-base-server-internal';
import { nodeBuilder } from '@kbn/es-query';
import type { ExecutionContextStart } from '@kbn/core/server';

import type { RequestTimeoutsConfig } from './config';
import type { Result } from './lib/result_type';
import { asOk, asErr, unwrap } from './lib/result_type';
import type { ExecutionContextRunner } from './lib/execution_context';
import { getExecutionContextRunner } from './lib/execution_context';

import type {
  ConcreteTaskInstance,
  ConcreteTaskInstanceVersion,
  TaskInstance,
  TaskLifecycle,
  SerializedConcreteTaskInstance,
  PartialConcreteTaskInstance,
  PartialSerializedConcreteTaskInstance,
  ApiKeyOptions,
} from './task';
import { TaskStatus, TaskLifecycleResult } from './task';

import type { TaskTypeDictionary } from './task_type_dictionary';
import type { AdHocTaskCounter } from './lib/adhoc_task_counter';
import { TaskValidator } from './task_validator';
import { claimSort } from './queries/mark_available_tasks_as_claimed';
import { MAX_PARTITIONS } from './lib/task_partitioner';
import type { ErrorOutput } from './lib/bulk_operation_buffer';
import { BulkUpdateError, MsearchError } from './lib/errors';
import { TASK_SO_NAME, INVALIDATE_API_KEY_SO_NAME } from './saved_objects';
import type { ApiKeyStrategy, ApiKeySOFields, InvalidationTarget } from './api_key_strategy';
import { getFirstRunAt } from './lib/get_first_run_at';
import { isInterval } from './lib/intervals';

export interface StoreOpts {
  esClient: ElasticsearchClient;
  index: string;
  taskManagerId: string;
  definitions: TaskTypeDictionary;
  savedObjectsRepository: ISavedObjectsRepository;
  savedObjectsService: SavedObjectsServiceStart;
  serializer: ISavedObjectsSerializer;
  adHocTaskCounter: AdHocTaskCounter;
  allowReadingInvalidState: boolean;
  logger: Logger;
  requestTimeouts: RequestTimeoutsConfig;
  security: SecurityServiceStart;
  canEncryptSavedObjects?: boolean;
  esoClient?: EncryptedSavedObjectsClient;
  getIsSecurityEnabled: () => boolean;
  executionContext: ExecutionContextStart;
  apiKeyStrategy: ApiKeyStrategy;
}

export interface SearchOpts {
  search_after?: Array<number | string>;
  size?: number;
  sort?: estypes.Sort;
  query?: estypes.QueryDslQueryContainer;
  seq_no_primary_term?: boolean;
}

export interface AggregationOpts {
  aggs: Record<string, estypes.AggregationsAggregationContainer>;
  query?: estypes.QueryDslQueryContainer;
  runtime_mappings?: estypes.MappingRuntimeFields;
  size?: number;
}

export interface UpdateByQuerySearchOpts extends SearchOpts {
  script?: estypes.Script;
}

export interface UpdateByQueryOpts extends SearchOpts {
  max_docs?: number;
}

export interface FetchResult {
  docs: ConcreteTaskInstance[];
  versionMap: Map<string, ConcreteTaskInstanceVersion>;
}

export interface BulkUpdateOpts {
  validate: boolean;
  mergeAttributes?: boolean;
  options?: ApiKeyOptions;
}

export type BulkUpdateResult = Result<ConcreteTaskInstance, ErrorOutput>;

export type PartialBulkUpdateResult = Result<PartialConcreteTaskInstance, ErrorOutput>;

export type BulkGetResult = Array<
  Result<ConcreteTaskInstance, { type: string; id: string; error: SavedObjectError }>
>;

export interface UpdateByQueryResult {
  updated: number;
  version_conflicts: number;
  total: number;
}

/**
 * Wraps an elasticsearch connection and provides a task manager-specific
 * interface into the index.
 */
export class TaskStore {
  public readonly index: string;
  public readonly taskManagerId: string;
  public readonly errors$ = new Subject<Error>();
  public readonly taskValidator: TaskValidator;

  private esClient: ElasticsearchClient;
  private esoClient?: EncryptedSavedObjectsClient;
  private definitions: TaskTypeDictionary;
  private savedObjectsRepository: ISavedObjectsRepository;
  private savedObjectsService: SavedObjectsServiceStart;
  private _invalidationSoClient?: SavedObjectsClientContract;
  private serializer: ISavedObjectsSerializer;
  private adHocTaskCounter: AdHocTaskCounter;
  private requestTimeouts: RequestTimeoutsConfig;
  private security: SecurityServiceStart;
  private canEncryptSavedObjects?: boolean;
  private getIsSecurityEnabled: () => boolean;
  private logger: Logger;
  private executionContextRunner: ExecutionContextRunner;
  private apiKeyStrategy: ApiKeyStrategy;

  private get invalidationSoClient(): SavedObjectsClientContract {
    if (!this._invalidationSoClient) {
      this._invalidationSoClient = this.savedObjectsService.getUnsafeInternalClient({
        includedHiddenTypes: [INVALIDATE_API_KEY_SO_NAME],
      });
    }
    return this._invalidationSoClient;
  }

  /**
   * Constructs a new TaskStore.
   * @param {StoreOpts} opts
   * @prop {esClient} esClient - An elasticsearch client
   * @prop {string} index - The name of the task manager index
   * @prop {TaskDefinition} definition - The definition of the task being run
   * @prop {serializer} - The saved object serializer
   * @prop {savedObjectsRepository} - An instance to the saved objects repository
   */
  constructor(opts: StoreOpts) {
    this.esClient = opts.esClient;
    this.esoClient = opts.esoClient;
    this.index = opts.index;
    this.taskManagerId = opts.taskManagerId;
    this.definitions = opts.definitions;
    this.serializer = opts.serializer;
    this.savedObjectsRepository = opts.savedObjectsRepository;
    this.savedObjectsService = opts.savedObjectsService;
    this.adHocTaskCounter = opts.adHocTaskCounter;
    this.taskValidator = new TaskValidator({
      logger: opts.logger,
      definitions: opts.definitions,
      allowReadingInvalidState: opts.allowReadingInvalidState,
    });
    this.requestTimeouts = opts.requestTimeouts;
    this.security = opts.security;
    this.canEncryptSavedObjects = opts.canEncryptSavedObjects;
    this.getIsSecurityEnabled = opts.getIsSecurityEnabled;
    this.logger = opts.logger;
    this.apiKeyStrategy = opts.apiKeyStrategy;
    this.executionContextRunner = getExecutionContextRunner(opts.executionContext, {
      name: 'taskStore',
      // individual executions can be specialized with an `id` property ...
    });
  }

  public registerEncryptedSavedObjectsClient(client: EncryptedSavedObjectsClient) {
    this.esoClient = client;
  }

  public getEncryptedSavedObjectsClient(): EncryptedSavedObjectsClient | undefined {
    return this.esoClient;
  }

  private canEncryptSo() {
    return !!(this.esoClient && this.canEncryptSavedObjects);
  }

  private validateCanEncryptSavedObjects(request?: KibanaRequest) {
    if (!request) {
      return;
    }
    if (!this.canEncryptSo()) {
      throw Error(
        'Unable to schedule task(s) with API keys because the Encrypted Saved Objects plugin has not been registered or is missing encryption key.'
      );
    }
  }

  private getSoClientForCreate(options: ApiKeyOptions) {
    if (options.request && this.getIsSecurityEnabled()) {
      return this.savedObjectsService.getScopedClient(options.request, {
        includedHiddenTypes: [TASK_SO_NAME],
        excludedExtensions: [SECURITY_EXTENSION_ID, SPACES_EXTENSION_ID],
      });
    }
    return this.savedObjectsRepository;
  }

  private async regenerateApiKeyFromRequest(docs: ConcreteTaskInstance[], options?: ApiKeyOptions) {
    const hasEncryptedFields = docs.some(docHasEncryptedApiKey);
    const invalidationTargets: Array<{
      taskId: string;
      targets: InvalidationTarget[];
    }> = [];
    let apiKeySOFieldsMap: Map<string, ApiKeySOFields> | null = null;

    // If a task with an API key is updated with a request
    if (hasEncryptedFields && options?.request && options?.regenerateApiKey) {
      const docsWithApiKeys: ConcreteTaskInstance[] = [];

      docs.forEach((taskInstance) => {
        if (docHasEncryptedApiKey(taskInstance)) {
          docsWithApiKeys.push(taskInstance);
          const targets = this.apiKeyStrategy.getApiKeyIdsForInvalidation(taskInstance);
          if (targets.length > 0) {
            invalidationTargets.push({ taskId: taskInstance.id, targets });
          }
        }
      });

      // and create new API keys using the new request
      if (docsWithApiKeys.length) {
        apiKeySOFieldsMap = await this.grantApiKeysFromRequest(docsWithApiKeys, options);
      }
    }

    return { apiKeySOFieldsMap, invalidationTargets };
  }

  private getSoClientForUpdate(docs: ConcreteTaskInstance[], options?: ApiKeyOptions) {
    const hasEncryptedFields = docs.some(docHasEncryptedApiKey);

    // If a task with an API key is updated without a request, throw an error.
    if (hasEncryptedFields && !options?.request) {
      throw new Error(
        'Request is not defined but some of the tasks have API key or user scope. Cannot get the encrypted saved objects repository to bulk update tasks.'
      );
    }

    if (options?.request && !hasEncryptedFields) {
      this.logger.debug(
        'Request is defined but none of the tasks have API key or user scope. Using regular saved objects repository to bulk update tasks.'
      );
    }

    // Return scoped client if request is defined AND at least one document has encrypted fields
    if (options?.request && this.getIsSecurityEnabled() && hasEncryptedFields) {
      return this.savedObjectsService.getScopedClient(options.request, {
        includedHiddenTypes: [TASK_SO_NAME],
        excludedExtensions: [SECURITY_EXTENSION_ID, SPACES_EXTENSION_ID],
      });
    }

    return this.savedObjectsRepository;
  }

  private async grantApiKeysFromRequest(
    taskInstances: TaskInstance[],
    options?: ApiKeyOptions
  ): Promise<Map<string, ApiKeySOFields> | null> {
    const request = options?.request;
    if (!this.getIsSecurityEnabled() || !request) {
      return null;
    }

    try {
      return await this.apiKeyStrategy.grantApiKeys(taskInstances, request, this.security, {
        ...(options?.onEsKey === true ? { onEsKey: true } : {}),
        ...(options?.cloneApiKey === true ? { cloneApiKey: true } : {}),
      });
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }
  }

  private async bulkGetDecryptedTaskApiKeys(
    taskIds: string[]
  ): Promise<Map<string, { apiKey?: string; uiamApiKey?: string }>> {
    if (!this.canEncryptSo() || !taskIds.length) {
      return new Map();
    }

    const result = await this.getDecryptedApiKeys(taskIds);

    // the search doesn't wait for refresh, so may miss a newly created key
    const idsOfMissingKeys = taskIds.filter((id) => result.get(id) === undefined);

    if (idsOfMissingKeys.length === 0) return result;

    // do a refresh, and get the remaining keys
    this.logger.warn('Refreshing index to get recently created API keys for tasks');

    // refresh; if that fails, return what we currently have
    try {
      await this.esClient.indices.refresh({ index: this.index });
    } catch (e) {
      this.logger.error(`Error refreshing index ${this.index}: ${e.message}`);
      return result;
    }

    // get the missing keys, a log an error if they continue to be missing
    const missingResult = await this.getDecryptedApiKeys(idsOfMissingKeys);

    for (const id of idsOfMissingKeys) {
      const foundKey = missingResult.get(id);
      if (foundKey === undefined) {
        this.logger.error(`Unable to obtain API key for task ${id} after retry`);
      } else {
        result.set(id, foundKey);
      }
    }

    return result;
  }

  private async getDecryptedApiKeys(taskIds: string[]) {
    const kueryNode = nodeBuilder.or(
      taskIds.map((id) => {
        return nodeBuilder.is(`${TASK_SO_NAME}.id`, `${TASK_SO_NAME}:${id}`);
      })
    );

    const result = new Map<string, { apiKey?: string; uiamApiKey?: string }>();
    const finder =
      await this.esoClient!.createPointInTimeFinderDecryptedAsInternalUser<SerializedConcreteTaskInstance>(
        {
          type: TASK_SO_NAME,
          filter: kueryNode,
        }
      );

    for await (const response of finder.find()) {
      response.saved_objects.forEach((savedObject) => {
        result.set(savedObject.id, {
          apiKey: savedObject.attributes.apiKey,
          uiamApiKey: savedObject.attributes.uiamApiKey,
        });
      });
    }

    await finder.close();
    return result;
  }

  private async bulkGetAndMergeTasksWithDecryptedApiKey(tasks: ConcreteTaskInstance[]) {
    const ids: string[] = [];

    tasks.forEach((task) => {
      if (task.apiKey || task.uiamApiKey) {
        ids.push(task.id);
      }
    });

    if (!ids.length) {
      return tasks;
    }

    const decryptedKeysMap = await this.bulkGetDecryptedTaskApiKeys(ids);

    const tasksWithDecryptedApiKeys = tasks.map((task) => {
      const decrypted = decryptedKeysMap.get(task.id);
      if (!decrypted) {
        return task;
      }
      return {
        ...task,
        ...(decrypted.apiKey ? { apiKey: decrypted.apiKey } : {}),
        ...(decrypted.uiamApiKey ? { uiamApiKey: decrypted.uiamApiKey } : {}),
      };
    });

    return tasksWithDecryptedApiKeys;
  }

  /**
   * Convert ConcreteTaskInstance Ids to match their SavedObject format as serialized
   * in Elasticsearch
   * @param tasks - The task being scheduled.
   */
  public convertToSavedObjectIds(
    taskIds: Array<ConcreteTaskInstance['id']>
  ): Array<ConcreteTaskInstance['id']> {
    return taskIds.map((id) => this.serializer.generateRawId(undefined, 'task', id));
  }

  /**
   * Schedules a task.
   *
   * @param task - The task being scheduled.
   */
  public async schedule(
    taskInstance: TaskInstance,
    options?: ApiKeyOptions
  ): Promise<ConcreteTaskInstance> {
    return this.executionContextRunner.run(() => this._schedule(taskInstance, options), {
      id: 'schedule',
    });
  }
  private async _schedule(
    taskInstance: TaskInstance,
    options?: ApiKeyOptions
  ): Promise<ConcreteTaskInstance> {
    try {
      this.validateCanEncryptSavedObjects(options?.request);
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }
    this.definitions.ensureHas(taskInstance.taskType);

    const apiKeySOFieldsMap =
      (await this.grantApiKeysFromRequest([taskInstance], options)) || new Map();
    const apiKeySOFields = apiKeySOFieldsMap.get(taskInstance.id) || {};

    const soClient = this.getSoClientForCreate(options || {});

    let savedObject;
    try {
      const id = taskInstance.id || v4();
      const validatedTaskInstance =
        this.taskValidator.getValidatedTaskInstanceForUpdating(taskInstance);

      savedObject = await soClient.create<SerializedConcreteTaskInstance>(
        'task',
        {
          ...taskInstanceToAttributes(validatedTaskInstance, id),
          ...apiKeySOFields,
          runAt: getFirstRunAt({ taskInstance: validatedTaskInstance, logger: this.logger }),
        },
        { id, refresh: false }
      );
      if (
        get(taskInstance, 'schedule.interval', null) == null &&
        get(taskInstance, 'schedule.rrule', null) == null
      ) {
        this.adHocTaskCounter.increment();
      }
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }

    const result = savedObjectToConcreteTaskInstance(savedObject);

    if (options?.request && !this.getIsSecurityEnabled()) {
      this.logger.info(
        `Trying to schedule task ${result.id} with user scope but security is disabled. Task will run without user scope.`
      );
    }

    return this.taskValidator.getValidatedTaskInstanceFromReading(result);
  }

  /**
   * Bulk schedules a task.
   *
   * @param tasks - The tasks being scheduled.
   */
  public async bulkSchedule(
    taskInstances: TaskInstance[],
    options?: ApiKeyOptions
  ): Promise<ConcreteTaskInstance[]> {
    return this.executionContextRunner.run(() => this._bulkSchedule(taskInstances, options), {
      id: 'bulk-schedule',
    });
  }

  private async _bulkSchedule(
    taskInstances: TaskInstance[],
    options?: ApiKeyOptions
  ): Promise<ConcreteTaskInstance[]> {
    try {
      this.validateCanEncryptSavedObjects(options?.request);
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }
    const apiKeySOFieldsMap =
      (await this.grantApiKeysFromRequest(taskInstances, options)) || new Map();

    const soClient = this.getSoClientForCreate(options || {});

    const objects = taskInstances.reduce(
      (acc: Array<SavedObjectsBulkCreateObject<SerializedConcreteTaskInstance>>, taskInstance) => {
        const apiKeySOFields = apiKeySOFieldsMap.get(taskInstance.id) || {};
        const id = taskInstance.id || v4();
        this.definitions.ensureHas(taskInstance.taskType);

        try {
          const validatedTaskInstance =
            this.taskValidator.getValidatedTaskInstanceForUpdating(taskInstance);

          return [
            ...acc,
            {
              type: 'task',
              attributes: {
                ...taskInstanceToAttributes(validatedTaskInstance, id),
                ...apiKeySOFields,
                runAt: getFirstRunAt({ taskInstance: validatedTaskInstance, logger: this.logger }),
              },
              id,
            },
          ];
        } catch (e) {
          this.logger.error(
            `[TaskStore] An error occured. Task ${taskInstance.id} will not be updated. Error: ${e.message}`
          );
          return acc;
        }
      },
      []
    );

    let savedObjects;
    try {
      savedObjects = await soClient.bulkCreate<SerializedConcreteTaskInstance>(objects, {
        refresh: false,
        overwrite: true,
      });
      this.adHocTaskCounter.increment(
        taskInstances.filter((task) => {
          return get(task, 'schedule.interval', null) == null;
        }).length
      );
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }

    if (options?.request && !this.getIsSecurityEnabled()) {
      this.logger.info(
        `Trying to bulk schedule tasks ${JSON.stringify(
          savedObjects.saved_objects.map((so) => so.id)
        )} with user scope but security is disabled. Tasks will run without user scope.`
      );
    }

    return savedObjects.saved_objects.map((so) => {
      if (isSavedObjectErrorResult(so)) {
        throw so.error;
      }
      const taskInstance = savedObjectToConcreteTaskInstance(so);
      return this.taskValidator.getValidatedTaskInstanceFromReading(taskInstance);
    });
  }

  /**
   * Fetches a list of scheduled tasks with default sorting.
   *
   * @param opts - The query options used to filter tasks
   * @param limitResponse - Whether to exclude the task state and params from the source for a smaller respose payload
   */
  public async fetch(
    { sort = [{ 'task.runAt': 'asc' }], ...opts }: SearchOpts = {},
    limitResponse: boolean = false
  ): Promise<FetchResult> {
    return this.search({ ...opts, sort }, limitResponse);
  }

  /**
   * Updates the specified doc in the index, returning the doc
   * with its version up to date.
   *
   * @param {TaskDoc} doc
   * @returns {Promise<TaskDoc>}
   */
  public async update(
    doc: ConcreteTaskInstance,
    options: { validate: boolean }
  ): Promise<ConcreteTaskInstance> {
    return this.executionContextRunner.run(() => this._update(doc, options), {
      id: 'update',
    });
  }

  private async _update(
    doc: ConcreteTaskInstance,
    options: { validate: boolean }
  ): Promise<ConcreteTaskInstance> {
    let updatedSavedObject;
    let attributes;
    try {
      const taskInstance = this.taskValidator.getValidatedTaskInstanceForUpdating(doc, {
        validate: options.validate,
      });
      attributes = taskInstanceToAttributes(taskInstance, doc.id);
      updatedSavedObject = await this.savedObjectsRepository.update<SerializedConcreteTaskInstance>(
        'task',
        doc.id,
        attributes,
        {
          refresh: false,
          version: doc.version,
        }
      );
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }

    const result = savedObjectToConcreteTaskInstance(
      // The SavedObjects update api forces a Partial on the `attributes` on the response,
      // but actually returns the whole object that is passed to it, so as we know we're
      // passing in the whole object, this is safe to do.
      // This is far from ideal, but unless we change the SavedObjectsClient this is the best we can do
      { ...updatedSavedObject, attributes: defaults(updatedSavedObject.attributes, attributes) }
    );
    return this.taskValidator.getValidatedTaskInstanceFromReading(result, {
      validate: options.validate,
    });
  }

  /**
   * Updates the specified docs in the index, returning the docs
   * with their versions up to date.
   *
   * @param {Array<TaskDoc>} docs
   * @returns {Promise<Array<TaskDoc>>}
   */
  public async bulkUpdate(
    docs: ConcreteTaskInstance[],
    options: BulkUpdateOpts
  ): Promise<BulkUpdateResult[]> {
    return this.executionContextRunner.run(() => this._bulkUpdate(docs, options), {
      id: 'bulk-update',
    });
  }

  private async _bulkUpdate(
    docs: ConcreteTaskInstance[],
    { validate, mergeAttributes = true, options }: BulkUpdateOpts
  ): Promise<BulkUpdateResult[]> {
    const soClientToUpdate = this.getSoClientForUpdate(docs, options);
    const regenerateResult = await this.regenerateApiKeyFromRequest(docs, options);
    const apiKeySOFieldsMap = regenerateResult.apiKeySOFieldsMap || new Map();
    const { invalidationTargets } = regenerateResult;

    const newDocs = docs.reduce(
      (acc: Map<string, SavedObjectsBulkUpdateObject<SerializedConcreteTaskInstance>>, doc) => {
        try {
          const taskInstance = this.taskValidator.getValidatedTaskInstanceForUpdating(doc, {
            validate,
          });
          const updatedFields = apiKeySOFieldsMap.get(taskInstance.id);
          const apiKey = updatedFields?.apiKey || doc?.apiKey;
          const uiamApiKey = updatedFields?.uiamApiKey || doc?.uiamApiKey;
          const userScope = updatedFields?.userScope || doc?.userScope;

          acc.set(doc.id, {
            type: 'task',
            id: doc.id,
            version: doc.version,
            attributes: {
              ...taskInstanceToAttributes(taskInstance, doc.id),
              ...(apiKey ? { apiKey } : {}),
              ...(uiamApiKey ? { uiamApiKey } : {}),
              ...(userScope ? { userScope } : {}),
            },
            mergeAttributes,
          });
        } catch (e) {
          this.logger.error(
            `[TaskStore] An error occured. Task ${doc.id} will not be updated. Error: ${e.message}`
          );
        }
        return acc;
      },
      new Map()
    );

    let updatedSavedObjects: Awaited<
      ReturnType<typeof soClientToUpdate.bulkUpdate<SerializedConcreteTaskInstance>>
    >['saved_objects'];
    try {
      ({ saved_objects: updatedSavedObjects } =
        await soClientToUpdate.bulkUpdate<SerializedConcreteTaskInstance>(
          Array.from(newDocs.values()),
          {
            refresh: false,
          }
        ));
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }

    const allInvalidationTargets: InvalidationTarget[] = [];
    const updates = updatedSavedObjects.map((updatedSavedObject) => {
      if (isSavedObjectErrorResult(updatedSavedObject)) {
        return asErr({
          type: 'task',
          id: updatedSavedObject.id,
          error: updatedSavedObject.error,
        });
      }

      const taskInstance = savedObjectToConcreteTaskInstance({
        ...updatedSavedObject,
        attributes: defaults(
          updatedSavedObject.attributes,
          newDocs.get(updatedSavedObject.id)?.attributes as SerializedConcreteTaskInstance
        ),
      });
      const result = this.taskValidator.getValidatedTaskInstanceFromReading(taskInstance, {
        validate,
      });
      const entry = invalidationTargets.find((t) => t.taskId === updatedSavedObject.id);
      if (entry) {
        allInvalidationTargets.push(...entry.targets);
      }
      return asOk(result);
    });

    if (allInvalidationTargets.length) {
      await this.apiKeyStrategy.markForInvalidation(
        allInvalidationTargets,
        this.logger,
        this.invalidationSoClient
      );
    }

    return updates;
  }

  public async bulkPartialUpdate(
    docs: PartialConcreteTaskInstance[]
  ): Promise<PartialBulkUpdateResult[]> {
    return this.executionContextRunner.run(() => this._bulkPartialUpdate(docs), {
      id: 'bulk-partial-update',
    });
  }

  private async _bulkPartialUpdate(
    docs: PartialConcreteTaskInstance[]
  ): Promise<PartialBulkUpdateResult[]> {
    if (docs.length === 0) {
      return [];
    }

    const bulkBody = [];
    for (const doc of docs) {
      if (doc.schedule?.interval && !isInterval(doc.schedule.interval)) {
        this.logger.error(
          `[TaskStore] Invalid interval "${doc.schedule.interval}". Task ${doc.id} will not be updated.`
        );
        continue;
      }
      bulkBody.push({
        update: {
          _id: `task:${doc.id}`,
          ...(doc.version ? decodeRequestVersion(doc.version) : {}),
        },
      });
      bulkBody.push({
        doc: {
          task: partialTaskInstanceToAttributes(doc),
        },
      });
    }

    let result: estypes.BulkResponse;
    try {
      result = await this.esClient.bulk({ index: this.index, refresh: false, body: bulkBody });
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }

    return result.items.map((item) => {
      const malformedResponseType = 'malformed response';

      if (!item.update || !item.update._id) {
        const err = new BulkUpdateError({
          message: malformedResponseType,
          type: malformedResponseType,
          statusCode: 500,
        });
        this.errors$.next(err);
        return asErr({
          type: 'task',
          id: 'unknown',
          error: { type: malformedResponseType },
        });
      }

      const docId = item.update._id.startsWith('task:')
        ? item.update._id.slice(5)
        : item.update._id;

      if (item.update?.error) {
        const err = new BulkUpdateError({
          message: item.update.error.reason ?? undefined, // reason can be null, and we want to keep `message` as string | undefined
          type: item.update.error.type,
          statusCode: item.update.status,
        });
        this.errors$.next(err);
        return asErr({
          type: 'task',
          id: docId,
          status: item.update.status,
          error: item.update.error,
        });
      }

      const doc = docs.find((d) => d.id === docId);

      return asOk({
        ...doc,
        id: docId,
        version: encodeVersion(item.update._seq_no, item.update._primary_term),
      });
    });
  }

  /**
   * Removes the specified task from the index.
   *
   * @param {string} id
   * @returns {Promise<void>}
   */
  public async remove(id: string): Promise<void> {
    return this.executionContextRunner.run(() => this._remove(id), {
      id: 'remove',
    });
  }

  private async _remove(id: string): Promise<void> {
    const taskInstance = await this._get(id);

    if ((taskInstance.apiKey || taskInstance.uiamApiKey) && taskInstance.userScope) {
      const targets = this.apiKeyStrategy.getApiKeyIdsForInvalidation(taskInstance);
      if (targets.length > 0) {
        await this.apiKeyStrategy.markForInvalidation(
          targets,
          this.logger,
          this.invalidationSoClient
        );
      }
    }

    try {
      await this.savedObjectsRepository.delete('task', id, { refresh: false });
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }
  }

  /**
   * Bulk removes the specified tasks from the index.
   *
   * @param {SavedObjectsBulkDeleteObject[]} savedObjectsToDelete
   * @returns {Promise<SavedObjectsBulkDeleteResponse>}
   */
  public async bulkRemove(taskIds: string[]): Promise<SavedObjectsBulkDeleteResponse> {
    return this.executionContextRunner.run(() => this._bulkRemove(taskIds), {
      id: 'bulk-remove',
    });
  }

  private async _bulkRemove(taskIds: string[]): Promise<SavedObjectsBulkDeleteResponse> {
    const taskInstances = await this._bulkGet(taskIds);
    const allInvalidationTargets: InvalidationTarget[] = [];

    taskInstances.forEach((taskInstance) => {
      const unwrappedTaskInstance = unwrap(taskInstance) as ConcreteTaskInstance;
      if (docHasEncryptedApiKey(unwrappedTaskInstance)) {
        const targets = this.apiKeyStrategy.getApiKeyIdsForInvalidation(unwrappedTaskInstance);
        allInvalidationTargets.push(...targets);
      }
    });

    if (allInvalidationTargets.length) {
      await this.apiKeyStrategy.markForInvalidation(
        allInvalidationTargets,
        this.logger,
        this.invalidationSoClient
      );
    }

    try {
      const savedObjectsToDelete = taskIds.map((taskId) => ({ id: taskId, type: 'task' }));
      return await this.savedObjectsRepository.bulkDelete(savedObjectsToDelete, { refresh: false });
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }
  }

  /**
   * Gets a task by id
   *
   * @param {string} id
   * @returns {Promise<ConcreteTaskInstance>}
   */
  public async get(id: string): Promise<ConcreteTaskInstance> {
    return this.executionContextRunner.run(() => this._get(id), {
      id: 'get',
    });
  }

  private async _get(id: string): Promise<ConcreteTaskInstance> {
    let result;
    try {
      result = await this.savedObjectsRepository.get<SerializedConcreteTaskInstance>('task', id);
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }
    const taskInstance = savedObjectToConcreteTaskInstance(result);
    const tasksWithDecryptedApiKeys = await this.bulkGetAndMergeTasksWithDecryptedApiKey([
      taskInstance,
    ]);
    return tasksWithDecryptedApiKeys[0];
  }

  /**
   * Gets tasks by ids
   *
   * @param {Array<string>} ids
   * @returns {Promise<BulkGetResult>}
   */
  public async bulkGet(ids: string[]): Promise<BulkGetResult> {
    return this.executionContextRunner.run(() => this._bulkGet(ids), {
      id: 'bulk-get',
    });
  }

  private async _bulkGet(ids: string[]): Promise<BulkGetResult> {
    let result;
    try {
      result = await this.savedObjectsRepository.bulkGet<SerializedConcreteTaskInstance>(
        ids.map((id) => ({ type: 'task', id }))
      );
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }

    const tasks: ConcreteTaskInstance[] = [];
    result.saved_objects.forEach((task) => {
      if (!isSavedObjectErrorResult(task)) {
        tasks.push(savedObjectToConcreteTaskInstance(task));
      }
    });
    const tasksWithDecryptedApiKeys = await this.bulkGetAndMergeTasksWithDecryptedApiKey(tasks);

    const taskMap = new Map();
    tasksWithDecryptedApiKeys.forEach((task) => taskMap.set(task.id, task));

    return result.saved_objects.map((task) => {
      if (isSavedObjectErrorResult(task)) {
        return asErr({ id: task.id, type: task.type, error: task.error });
      }
      return asOk(taskMap.get(task.id));
    });
  }

  /**
   * Gets task version info by ids
   *
   * @param {Array<string>} esIds
   * @returns {Promise<ConcreteTaskInstanceVersion[]>}
   */
  public async bulkGetVersions(ids: string[]): Promise<ConcreteTaskInstanceVersion[]> {
    return this.executionContextRunner.run(() => this._bulkGetVersions(ids), {
      id: 'bulk-get-versions',
    });
  }

  private async _bulkGetVersions(ids: string[]): Promise<ConcreteTaskInstanceVersion[]> {
    let taskVersions: estypes.MgetResponse<never>;
    try {
      taskVersions = await this.esClient.mget<never>(
        {
          index: this.index,
          _source: false,
          ids,
        },
        { retryOnTimeout: false }
      );
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }

    const result = taskVersions.docs.map((taskVersion) => {
      if (isMGetSuccess(taskVersion)) {
        if (!taskVersion.found) {
          return {
            esId: taskVersion._id,
            error: `task "${taskVersion._id}" not found`,
          };
        } else {
          return {
            esId: taskVersion._id,
            seqNo: taskVersion._seq_no,
            primaryTerm: taskVersion._primary_term,
          };
        }
      }

      const type = taskVersion.error?.type || 'unknown type of error';
      const reason = taskVersion.error?.reason || 'unknown reason';
      const error = `error getting version for ${taskVersion._id}: ${type}: ${reason}`;
      return {
        esId: taskVersion._id,
        error,
      };
    });

    return result;
  }

  /**
   * Gets task lifecycle step by id
   *
   * @param {string} id
   * @returns {Promise<void>}
   */
  public async getLifecycle(id: string): Promise<TaskLifecycle> {
    try {
      const task = await this.get(id);
      return task.status;
    } catch (err) {
      if (err.output && err.output.statusCode === 404) {
        return TaskLifecycleResult.NotFound;
      }
      throw err;
    }
  }

  // like search(), only runs multiple searches in parallel returning the combined results
  async msearch(opts: SearchOpts[] = []): Promise<FetchResult> {
    return this.executionContextRunner.run(() => this._msearch(opts), {
      id: 'msearch',
    });
  }

  private async _msearch(opts: SearchOpts[] = []): Promise<FetchResult> {
    const queries = opts.map(({ sort = [{ 'task.runAt': 'asc' }], ...opt }) =>
      ensureQueryOnlyReturnsTaskObjects({ sort, ...opt })
    );
    const searches = queries.flatMap((query) => [{}, query]);

    const result = await this.esClient.msearch<SavedObjectsRawDoc['_source']>(
      {
        index: this.index,
        ignore_unavailable: true,
        searches,
      },
      { retryOnTimeout: false }
    );
    const { responses } = result;

    const versionMap = this.createVersionMap([]);
    let allTasks = new Array<ConcreteTaskInstance>();

    for (const response of responses) {
      if (response.status !== 200) {
        const err = new MsearchError(response.status);
        this.errors$.next(err);
        throw err;
      }

      const { hits } = response as estypes.MsearchMultiSearchItem<SavedObjectsRawDoc['_source']>;
      const { hits: tasks } = hits;
      this.addTasksToVersionMap(versionMap, tasks);
      allTasks = allTasks.concat(this.filterTasks(tasks));
    }

    const allSortedTasks = claimSort(this.definitions, allTasks);
    const tasksWithDecryptedApiKeys = await this.bulkGetAndMergeTasksWithDecryptedApiKey(
      allSortedTasks
    );
    return { docs: tasksWithDecryptedApiKeys, versionMap };
  }

  public async search(opts: SearchOpts = {}, limitResponse: boolean = false): Promise<FetchResult> {
    return this.executionContextRunner.run(() => this._search(opts, limitResponse), {
      id: 'search',
    });
  }

  private async _search(
    opts: SearchOpts = {},
    limitResponse: boolean = false
  ): Promise<FetchResult> {
    const { query } = ensureQueryOnlyReturnsTaskObjects(opts);

    try {
      const result = await this.esClient.search<SavedObjectsRawDoc['_source']>(
        {
          index: this.index,
          ignore_unavailable: true,
          ...opts,
          query,
          ...(limitResponse ? { _source_excludes: ['task.state', 'task.params'] } : {}),
        },
        { retryOnTimeout: false }
      );

      const {
        hits: { hits: tasks },
      } = result;

      const versionMap = this.createVersionMap(tasks);
      const concreteTasks = this.filterTasks(tasks);
      const tasksWithDecryptedApiKeys = await this.bulkGetAndMergeTasksWithDecryptedApiKey(
        concreteTasks
      );

      return {
        docs: tasksWithDecryptedApiKeys,
        versionMap,
      };
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }
  }

  private filterTasks(
    tasks: Array<estypes.SearchHit<SavedObjectsRawDoc['_source']>>
  ): ConcreteTaskInstance[] {
    return (
      tasks
        // @ts-expect-error @elastic/elasticsearch _source is optional
        .filter((doc) => this.serializer.isRawSavedObject(doc))
        // @ts-expect-error @elastic/elasticsearch _source is optional
        .map((doc) => this.serializer.rawToSavedObject(doc))
        .map((doc) => omit(doc, 'namespace') as SavedObject<SerializedConcreteTaskInstance>)
        .map((doc) => savedObjectToConcreteTaskInstance(doc))
        .filter((doc): doc is ConcreteTaskInstance => !!doc)
    );
  }

  private addTasksToVersionMap(
    versionMap: Map<string, ConcreteTaskInstanceVersion>,
    tasks: Array<estypes.SearchHit<SavedObjectsRawDoc['_source']>>
  ): void {
    for (const task of tasks) {
      if (task._id == null || task._seq_no == null || task._primary_term == null) continue;

      const esId = task._id.startsWith('task:') ? task._id.slice(5) : task._id;
      versionMap.set(esId, {
        esId: task._id,
        seqNo: task._seq_no,
        primaryTerm: task._primary_term,
      });
    }
  }

  private createVersionMap(
    tasks: Array<estypes.SearchHit<SavedObjectsRawDoc['_source']>>
  ): Map<string, ConcreteTaskInstanceVersion> {
    const versionMap = new Map<string, ConcreteTaskInstanceVersion>();
    this.addTasksToVersionMap(versionMap, tasks);
    return versionMap;
  }

  public async aggregate<TSearchRequest extends AggregationOpts>({
    aggs,
    query,
    runtime_mappings,
    size = 0,
  }: TSearchRequest): Promise<estypes.SearchResponse<ConcreteTaskInstance>> {
    return this.executionContextRunner.run(
      () => this._aggregate({ aggs, query, runtime_mappings, size }),
      { id: 'aggregate' }
    );
  }

  private async _aggregate<TSearchRequest extends AggregationOpts>({
    aggs,
    query,
    runtime_mappings,
    size = 0,
  }: TSearchRequest): Promise<estypes.SearchResponse<ConcreteTaskInstance>> {
    const body = await this.esClient.search<
      ConcreteTaskInstance,
      Record<string, estypes.AggregationsAggregate>
    >({
      index: this.index,
      ignore_unavailable: true,
      track_total_hits: true,
      ...ensureAggregationOnlyReturnsEnabledTaskObjects({
        query,
        aggs,
        runtime_mappings,
        size,
      }),
    });
    return body;
  }

  public async updateByQuery(
    opts: UpdateByQuerySearchOpts = {},
    updateByQueryOpts: UpdateByQueryOpts = {}
  ): Promise<UpdateByQueryResult> {
    return this.executionContextRunner.run(() => this._updateByQuery(opts, updateByQueryOpts), {
      id: 'update-by-query',
    });
  }

  private async _updateByQuery(
    opts: UpdateByQuerySearchOpts = {},
    { max_docs: max_docs }: UpdateByQueryOpts = {}
  ): Promise<UpdateByQueryResult> {
    const { query } = ensureQueryOnlyReturnsTaskObjects(opts);
    const { sort, ...rest } = opts;
    try {
      const { total, updated, version_conflicts } = await this.esClient.updateByQuery(
        {
          index: this.index,
          ignore_unavailable: true,
          refresh: true,
          conflicts: 'proceed',
          ...rest,
          max_docs,
          query,
          // @ts-expect-error According to the docs, sort should be a comma-separated list of fields and goes in the querystring.
          // However, this one is using a "body" format?
          body: { sort },
        },
        { requestTimeout: this.requestTimeouts.update_by_query, retryOnTimeout: false }
      );

      const conflictsCorrectedForContinuation = correctVersionConflictsForContinuation(
        updated,
        version_conflicts,
        max_docs
      );

      return {
        total: total || 0,
        updated: updated || 0,
        version_conflicts: conflictsCorrectedForContinuation,
      };
    } catch (e) {
      this.errors$.next(e);
      throw e;
    }
  }

  public async getDocVersions(esIds: string[]): Promise<Map<string, ConcreteTaskInstanceVersion>> {
    return this.executionContextRunner.run(() => this._getDocVersions(esIds), {
      id: 'get-doc-versions',
    });
  }

  private async _getDocVersions(
    esIds: string[]
  ): Promise<Map<string, ConcreteTaskInstanceVersion>> {
    const versions = await this._bulkGetVersions(esIds);
    const result = new Map<string, ConcreteTaskInstanceVersion>();
    for (const version of versions) {
      result.set(version.esId, version);
    }
    return result;
  }
}

/**
 * When we run updateByQuery with conflicts='proceed', it's possible for the `version_conflicts`
 * to count against the specified `max_docs`, as per https://github.com/elastic/elasticsearch/issues/63671
 * In order to correct for that happening, we only count `version_conflicts` if we haven't updated as
 * many docs as we could have.
 * This is still no more than an estimation, as there might have been less docuemnt to update that the
 * `max_docs`, but we bias in favour of over zealous `version_conflicts` as that's the best indicator we
 * have for an unhealthy cluster distribution of Task Manager polling intervals
 */

export function correctVersionConflictsForContinuation(
  updated: estypes.ReindexResponse['updated'],
  versionConflicts: estypes.ReindexResponse['version_conflicts'],
  maxDocs?: number
): number {
  // @ts-expect-error estypes.ReindexResponse['updated'] and estypes.ReindexResponse['version_conflicts'] can be undefined
  return maxDocs && versionConflicts + updated > maxDocs ? maxDocs - updated : versionConflicts;
}

/**
 * Returns true when a task document holds an encrypted API key credential
 * (either an ES API key or a UIAM API key) together with the `userScope`
 * metadata required to process it. Must be kept in sync with every credential
 * field registered for ESO encryption on the `task` saved object type.
 */
export function docHasEncryptedApiKey(
  doc: Pick<ConcreteTaskInstance, 'apiKey' | 'uiamApiKey' | 'userScope'>
): boolean {
  return Boolean((doc.apiKey || doc.uiamApiKey) && doc.userScope);
}

export function taskInstanceToAttributes(
  doc: TaskInstance,
  id: string
): SerializedConcreteTaskInstance {
  return {
    ...omit(doc, 'id', 'version', 'userScope', 'apiKey', 'uiamApiKey'),
    params: JSON.stringify(doc.params || {}),
    state: JSON.stringify(doc.state || {}),
    attempts: (doc as ConcreteTaskInstance).attempts || 0,
    scheduledAt: (doc.scheduledAt || new Date()).toISOString(),
    startedAt: (doc.startedAt && doc.startedAt.toISOString()) || null,
    retryAt: (doc.retryAt && doc.retryAt.toISOString()) || null,
    runAt: (doc.runAt || new Date()).toISOString(),
    status: (doc as ConcreteTaskInstance).status || 'idle',
    partition: doc.partition || murmurhash.v3(id) % MAX_PARTITIONS,
  } as SerializedConcreteTaskInstance;
}

export function partialTaskInstanceToAttributes(
  doc: PartialConcreteTaskInstance
): PartialSerializedConcreteTaskInstance {
  return {
    ...omit(doc, 'id', 'version', 'userScope', 'apiKey', 'uiamApiKey'),
    ...(doc.params ? { params: JSON.stringify(doc.params) } : {}),
    ...(doc.state ? { state: JSON.stringify(doc.state) } : {}),
    ...(doc.scheduledAt ? { scheduledAt: doc.scheduledAt.toISOString() } : {}),
    ...(doc.startedAt ? { startedAt: doc.startedAt.toISOString() } : {}),
    ...(doc.retryAt ? { retryAt: doc.retryAt.toISOString() } : {}),
    ...(doc.runAt ? { runAt: doc.runAt.toISOString() } : {}),
  } as PartialSerializedConcreteTaskInstance;
}

export function savedObjectToConcreteTaskInstance(
  savedObject: Omit<SavedObject<SerializedConcreteTaskInstance>, 'references'>
): ConcreteTaskInstance {
  return {
    ...savedObject.attributes,
    id: savedObject.id,
    version: savedObject.version,
    scheduledAt: new Date(savedObject.attributes.scheduledAt),
    runAt: new Date(savedObject.attributes.runAt),
    startedAt: savedObject.attributes.startedAt ? new Date(savedObject.attributes.startedAt) : null,
    retryAt: savedObject.attributes.retryAt ? new Date(savedObject.attributes.retryAt) : null,
    state: parseJSONField(savedObject.attributes.state, 'state', savedObject.id),
    params: parseJSONField(savedObject.attributes.params, 'params', savedObject.id),
  };
}

function parseJSONField(json: string, fieldName: string, id: string) {
  try {
    return json ? JSON.parse(json) : {};
  } catch (error) {
    throw new Error(`Task "${id}"'s ${fieldName} field has invalid JSON: ${json}`);
  }
}

function ensureQueryOnlyReturnsTaskObjects(opts: SearchOpts): SearchOpts {
  const originalQuery = opts.query;
  const queryOnlyTasks = { term: { type: 'task' } };
  const query = originalQuery
    ? { bool: { must: [queryOnlyTasks, originalQuery] } }
    : queryOnlyTasks;

  return {
    ...opts,
    query,
  };
}

function ensureAggregationOnlyReturnsEnabledTaskObjects(opts: AggregationOpts): AggregationOpts {
  const originalQuery = opts.query;
  const filterToOnlyTasks = {
    bool: {
      filter: {
        bool: {
          must: [{ term: { type: 'task' } }, { term: { 'task.enabled': true } }],
          must_not: [{ term: { 'task.status': TaskStatus.Unrecognized } }],
        },
      },
    },
  };
  const query = originalQuery
    ? { bool: { must: [filterToOnlyTasks, originalQuery] } }
    : filterToOnlyTasks;
  return {
    ...opts,
    query,
  };
}

function isMGetSuccess(doc: estypes.MgetResponseItem<unknown>): doc is estypes.GetGetResult {
  return (doc as estypes.GetGetResult).found !== undefined;
}
