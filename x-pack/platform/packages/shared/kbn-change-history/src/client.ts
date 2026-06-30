/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v7 as uuidv7 } from 'uuid';
import type {
  QueryDslQueryContainer,
  SearchTotalHits,
  SortCombinations,
} from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core/server';
import { type DataStreamDefinition, DataStreamClient } from '@kbn/data-streams';
import type { ClientCreateRequest } from '@kbn/data-streams/src/types/es_api';
import type { Logger } from '@kbn/logging';
import { changeHistoryMappings } from './mappings';
import {
  FLAGS,
  DATA_STREAM_NAME,
  ILM_POLICY_NAME,
  SEPARATOR_CHAR,
  ECS_VERSION,
  DEFAULT_RESULT_SIZE,
} from './constants';
import { ensureIlmPolicy } from './ilm_policy';
import type {
  ChangeHistoryDocument,
  GetHistoryResult,
  LogChangeHistoryOptions,
  GetChangeHistoryOptions,
  ObjectChange,
} from './types';
import { sha256, sanitizeFields } from './utils';

export { DATA_STREAM_NAME } from './constants';

type ChangeHistoryDataStreamClient = DataStreamClient<
  typeof changeHistoryMappings.v1,
  ChangeHistoryDocument
>;

export interface IChangeHistoryClient {
  isInitialized(): boolean;
  initialize(elasticsearchClient: ElasticsearchClient): Promise<void>;
  log(change: ObjectChange, opts: LogChangeHistoryOptions): Promise<void>;
  logBulk(changes: ObjectChange[], opts: LogChangeHistoryOptions): Promise<void>;
  getHistory(
    spaceId: string,
    objectType: string,
    objectId: string,
    opts?: GetChangeHistoryOptions
  ): Promise<GetHistoryResult>;
}

export class ChangeHistoryClient implements IChangeHistoryClient {
  private module: string;
  private dataset: string;
  private kibanaVersion: string;
  private logger: Logger;
  private client?: ChangeHistoryDataStreamClient;

  constructor({
    module,
    dataset,
    logger,
    kibanaVersion,
  }: {
    module: string;
    dataset: string;
    logger: Logger;
    kibanaVersion: string;
  }) {
    if (module.includes(SEPARATOR_CHAR)) {
      throw new Error(
        `Invalid module "${module}". Should not include separator [${SEPARATOR_CHAR}]`
      );
    }
    if (dataset.includes(SEPARATOR_CHAR)) {
      throw new Error(
        `Invalid dataset "${dataset}". Should not include separator [${SEPARATOR_CHAR}]`
      );
    }
    this.module = module;
    this.dataset = dataset;
    this.kibanaVersion = kibanaVersion;
    this.logger = logger;
  }

  /**
   * Check if the change tracking service is initialized.
   * @returns true if the change tracking service is initialized.
   */
  isInitialized() {
    return !!this.client;
  }

  /**
   * Initialize the change tracking service.
   * @param elasticsearchClient The privileged elasticsearch client `core.elasticsearch.client.asInternalUser`.
   * @returns A promise that resolves when the change tracking service is initialized.
   * @throws An error if the data stream is not initialized properly.
   */
  async initialize(elasticsearchClient: ElasticsearchClient) {
    if (!FLAGS.FEATURE_ENABLED) {
      const error = new Error(`Change history is disabled. Skipping initialization.`);
      this.logger.error(error);
      throw error;
    }
    // Step 1: Ensure the ILM policy exists. Installed only when missing so
    // cluster admins can customize the policy in place without Kibana
    // overwriting their changes on the next startup.
    try {
      await ensureIlmPolicy(elasticsearchClient, this.logger);
    } catch (error) {
      const err = new Error(
        `Unable to install change history ILM policy [${ILM_POLICY_NAME}]: ${error}`,
        { cause: error }
      );
      this.logger.error(err);
      throw err;
    }

    // Step 2: Create data stream definition. The `index.lifecycle.name` setting
    // points backing indices at the policy installed above.
    const definition: DataStreamDefinition<typeof changeHistoryMappings.v1, ChangeHistoryDocument> =
      {
        name: DATA_STREAM_NAME,
        version: 1,
        hidden: true,
        template: {
          priority: 100,
          mappings: changeHistoryMappings.v1,
          settings: {
            'index.lifecycle.name': ILM_POLICY_NAME,
          },
        },
      };

    // Step 3: Initialize data stream
    try {
      this.client = await DataStreamClient.initialize({
        dataStream: definition,
        elasticsearchClient,
        logger: this.logger,
        lazyCreation: false,
      });
    } catch (error) {
      const err = new Error(
        `Unable to initialize change history data stream for: module [${this.module}] and dataset [${this.dataset}]: ${error}`,
        { cause: error }
      );
      this.logger.error(err);
      throw err;
    }
  }

  /**
   * Log a change for a single object.
   * @param change - The affected object; `change.snapshot` must be the **after** (post-change) state persisted as `object.snapshot`.
   * @param opts - The options for the change.
   * @returns A promise that resolves when the change is logged.
   * @throws An error if the data stream is not initialized, or if an error occurs while logging the change.
   */
  async log(change: ObjectChange, opts: LogChangeHistoryOptions) {
    return this.logBulk([change], opts);
  }

  /**
   * Log a bulk change for one or more objects.
   * @param changes - The affected objects; each `snapshot` is the **after** (post-change) state for that object.
   * @param opts - The options for the bulk change.
   * @param opts.action - The action performed (`rule_create`, `rule_update`, `rule_delete`, etc.)
   * @param opts.username - Current login name for the user who performed the change.
   * @param opts.userProfileId - Optional user profile ID (auth realm). See Elastic User Profiles.
   * @param opts.spaceId - The ID of the space that the change belongs to.
   * @param opts.correlationId - Optional correlation ID for the bulk change.
   * @param opts.data - Optional data to merge into the change history document.
   * @param opts.fieldsToHash - Optional fields whose string values are replaced with a salted SHA-256 digest (high-entropy secrets only).
   * @param opts.fieldsToRedact - Optional fields whose string values are replaced with a `[redacted]` placeholder (low-entropy sensitive data).
   * @param opts.refresh - Optional indicator to force an ES refresh after changes (affects performance)
   * @returns A promise that resolves when the bulk change is logged.
   * @throws An error if the data stream is not initialized, or if an error occurs while logging the change.
   */
  async logBulk(changes: ObjectChange[], opts: LogChangeHistoryOptions) {
    const { module, dataset, client, kibanaVersion } = this;

    if (!client) {
      const err = new Error(
        `Change history data stream not initialized for: module [${this.module}] and dataset [${this.dataset}]`
      );
      this.logger.error(err);
      throw err;
    }
    const {
      username,
      userProfileId,
      spaceId: space,
      fieldsToHash,
      fieldsToRedact,
      correlationId,
      refresh,
    } = opts;
    const request: ClientCreateRequest<ChangeHistoryDocument> = {
      refresh,
      space,
      documents: [],
    };

    for (const change of changes) {
      // Create document and populate
      const { objectType, objectId, timestamp, sequence } = change;
      const hash = sha256(JSON.stringify(change.snapshot));
      const sanitized = sanitizeFields(change.snapshot, {
        fieldsToHash,
        fieldsToRedact,
        salt: objectId,
      });
      const { event, metadata, tags } = opts.data ?? {};
      const created = new Date().toISOString();
      const document: ChangeHistoryDocument = {
        '@timestamp': new Date(timestamp || created).toISOString(),
        ecs: { version: ECS_VERSION },
        user: { name: username, id: userProfileId },
        event: {
          id: uuidv7(), // <-- uuid v7 helps making 'same millisecond' event order deterministic
          created,
          type: event?.type ?? 'change',
          reason: event?.reason,
          module,
          dataset,
          action: opts.action,
        },
        object: {
          id: objectId,
          type: objectType,
          hash,
          sequence,
          fields: sanitized.fields,
          snapshot: sanitized.snapshot,
        },
        tags,
        metadata,
        service: { type: 'kibana', version: kibanaVersion },
        span: correlationId ? { id: correlationId } : undefined,
      };
      // Queue operations
      request.documents.push({ _id: document.event.id, ...document });
    }

    try {
      await client.create({ ...request });
    } catch (err) {
      const error = new Error(`Error saving change history: ${err}`, { cause: err });
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Get the change history of an object.
   * @param spaceId - The kibana space Id where this object exists
   * @param objectType - The type of the object.
   * @param objectId - The ID of the object.
   * @param opts - The options for the history query.
   * @param opts.additionalFilters - Additional filters to apply to the history query.
   * @param opts.sort - The sort order for the history query.
   * @param opts.from - The starting index for the history query.
   * @param opts.size - The number of results to return.
   * @returns The history of the object.
   * @throws An error if the data stream is not initialized, or if an error occurs while getting the history.
   */
  async getHistory(
    spaceId: string,
    objectType: string,
    objectId: string,
    opts?: GetChangeHistoryOptions
  ): Promise<GetHistoryResult> {
    const client = this.client;
    if (!client) {
      const err = new Error(
        `Change history data stream not initialized for: module [${this.module}] and dataset [${this.dataset}]`
      );
      this.logger.error(err);
      throw err;
    }
    const filter: QueryDslQueryContainer[] = [
      { term: { 'event.module': this.module } },
      { term: { 'event.dataset': this.dataset } },
      { term: { 'object.type': objectType } },
      { term: { 'object.id': objectId } },
    ];
    if (opts?.additionalFilters) {
      filter.push(...opts.additionalFilters);
    }
    const defaultSort: SortCombinations[] = [
      { 'object.sequence': { order: 'desc', missing: 0 } }, // <-- If available, `sequence` ordering overrides timestamps.
      { '@timestamp': { order: 'desc' } },
      { 'event.id': { order: 'desc' } },
    ];
    const history = await client.search({
      space: spaceId,
      query: { bool: { filter } },
      sort: opts?.sort ?? defaultSort,
      size: opts?.size ?? DEFAULT_RESULT_SIZE,
      from: opts?.from,
    });
    return {
      total: Number((history.hits.total as SearchTotalHits)?.value) || 0,
      items: history.hits.hits.map((h) => h._source).filter((i) => !!i),
    };
  }
}
