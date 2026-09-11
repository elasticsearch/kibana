/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { isResponseError } from '@kbn/es-errors';
import pRetry from 'p-retry';
import {
  AI_INDEX_DATA_STREAM_PREFIX as DATA_STREAM_PREFIX,
  AI_INDEX_INDEX_PREFIX as INDEX_PREFIX,
  MAX_AI_INDEX_AUTOMATIONS,
  MAX_AI_INDICES,
} from '../../common/constants';
import type {
  AiIndexDest,
  AiIndexFeedbackAnalysis,
  AiIndexHttpItem,
  AiIndexProperties,
} from '../../common/http_api/ai_indices';
import {
  InvalidAiIndexDestError,
  AiIndexConflictError,
  AiIndexManagedError,
  AiIndexNotFoundError,
  AiIndexIdConflictError,
  AiIndexAlreadyExistsError,
} from './errors';
import type { AiIndexDocument, AiIndexStorageClient } from './storage';
import { buildAiIndexDocId, createAiIndexStorageClient } from './storage';

const toAiIndexItem = (document: AiIndexDocument): AiIndexHttpItem => ({
  id: document.id,
  ...(document.description !== undefined && { description: document.description }),
  ...(document.feedback_analysis !== undefined && {
    feedback_analysis: document.feedback_analysis,
  }),
  managed: document.managed ?? false,
  dest: document.dest,
  automations: document.automations,
  sources: document.sources,
  date_created: document.date_created,
  date_modified: document.date_modified,
});

const ADD_AUTOMATION_CONFLICT_RETRIES = 2;

export interface AiIndexManagedBootstrap {
  isManaged: (id: string) => boolean;
  getManagedIds: () => string[];
  ensure: (id: string, spaceId: string) => Promise<void>;
}

type AiIndexAutomationTarget = Pick<AiIndexDocument, 'managed' | 'automations'>;

const assertAiIndexAcceptsAutomation = (
  aiIndexId: string,
  index: AiIndexAutomationTarget,
  automation?: { type: 'workflow'; value: string }
): { alreadyAttached: boolean } => {
  if (index.managed) {
    throw new AiIndexManagedError(aiIndexId);
  }

  const alreadyAttached =
    automation !== undefined &&
    index.automations.some(
      (entry) => entry.type === automation.type && entry.value === automation.value
    );

  if (!alreadyAttached && index.automations.length >= MAX_AI_INDEX_AUTOMATIONS) {
    throw new Error(
      `AI index "${aiIndexId}" already has the maximum number of automations (${MAX_AI_INDEX_AUTOMATIONS}).`
    );
  }

  return { alreadyAttached };
};

/**
 * Manages the AI index registry stored in the hidden
 * `.contextengine-ai-indices` system index. Reads and writes go through the
 * internal user; access is enforced at the API layer.
 */
export class AiIndexService {
  private readonly esClient: ElasticsearchClient;
  private readonly storageClient: AiIndexStorageClient;
  private readonly managedBootstrap?: AiIndexManagedBootstrap;
  private readonly logger: Logger;

  constructor({
    esClient,
    logger,
    managedBootstrap,
  }: {
    esClient: ElasticsearchClient;
    logger: Logger;
    managedBootstrap?: AiIndexManagedBootstrap;
  }) {
    this.esClient = esClient;
    this.storageClient = createAiIndexStorageClient({ esClient, logger });
    this.managedBootstrap = managedBootstrap;
    this.logger = logger;
  }

  /** Creates a new AI index. Duplicate ids throw {@link AiIndexAlreadyExistsError}. */
  async create(aiIndexId: string, spaceId: string, properties: AiIndexProperties): Promise<void> {
    if (this.managedBootstrap?.isManaged(aiIndexId)) {
      throw new AiIndexManagedError(aiIndexId);
    }
    await this.assertValidDest(properties.dest);

    const now = new Date().toISOString();
    const document: AiIndexDocument = {
      ...properties,
      id: aiIndexId,
      space: spaceId,
      managed: false,
      date_created: now,
      date_modified: now,
    };

    try {
      await this.storageClient.index({
        id: buildAiIndexDocId(spaceId, aiIndexId),
        document,
        op_type: 'create',
        refresh: 'wait_for',
      });
    } catch (error) {
      if (isResponseError(error) && error.statusCode === 409) {
        throw new AiIndexAlreadyExistsError(aiIndexId);
      }
      throw error;
    }
  }

  /**
   * Creates or fully replaces an AI index, preserving `date_created` on update.
   * Concurrent writes are guarded with optimistic concurrency control; a losing
   * writer gets an {@link AiIndexConflictError}. Managed entries (registered
   * by a plugin at startup) are immutable via this method.
   */
  async put(
    aiIndexId: string,
    spaceId: string,
    properties: AiIndexProperties
  ): Promise<'created' | 'updated'> {
    await this.assertValidDest(properties.dest);

    const existing = await this.findDocument(aiIndexId, spaceId);
    if (existing?.document.managed || (!existing && this.managedBootstrap?.isManaged(aiIndexId))) {
      throw new AiIndexManagedError(aiIndexId);
    }

    return this.writeDocument(
      aiIndexId,
      spaceId,
      { ...properties, id: aiIndexId, space: spaceId, managed: false },
      existing
    );
  }

  /**
   * Creates or fully replaces a managed AI index. Managed entries are owned by
   * the registering plugin and cannot be mutated via the public API.
   *
   * This is an idempotent upsert: it is safe to call on every access, so a
   * managed entry always reflects the latest registration (the source of truth
   * lives in code). It will overwrite an existing managed entry, but refuses to
   * clobber a user-owned (unmanaged) entry that squats the same id, throwing
   * {@link AiIndexIdConflictError} so the collision surfaces instead of
   * silently destroying user data.
   */
  async putManaged(
    aiIndexId: string,
    spaceId: string,
    properties: AiIndexProperties
  ): Promise<'created' | 'updated'> {
    await this.assertValidDest(properties.dest);
    const existing = await this.findDocument(aiIndexId, spaceId);
    if (existing && !existing.document.managed) {
      throw new AiIndexIdConflictError(aiIndexId);
    }
    return this.writeDocument(
      aiIndexId,
      spaceId,
      { ...properties, id: aiIndexId, space: spaceId, managed: true },
      existing
    );
  }

  private async writeDocument(
    aiIndexId: string,
    spaceId: string,
    document: Omit<AiIndexDocument, 'date_created' | 'date_modified'>,
    existing: Awaited<ReturnType<typeof this.findDocument>>
  ): Promise<'created' | 'updated'> {
    const now = new Date().toISOString();
    const fullDocument: AiIndexDocument = {
      ...document,
      date_created: existing?.document.date_created ?? now,
      date_modified: now,
    };
    const docId = buildAiIndexDocId(spaceId, aiIndexId);

    try {
      if (existing) {
        await this.storageClient.index({
          id: docId,
          document: fullDocument,
          if_seq_no: existing.seqNo,
          if_primary_term: existing.primaryTerm,
          refresh: 'wait_for',
        });
        return 'updated';
      }

      await this.storageClient.index({
        id: docId,
        document: fullDocument,
        op_type: 'create',
        refresh: 'wait_for',
      });
      return 'created';
    } catch (error) {
      if (isResponseError(error) && error.statusCode === 409) {
        throw new AiIndexConflictError(aiIndexId);
      }
      throw error;
    }
  }

  /**
   * Replaces only the feedback analysis block, leaving the rest of the entry —
   * including its `managed` flag and its dest — untouched.
   *
   * Unlike {@link put} this is permitted on managed entries. A managed entry's
   * *definition* is owned by the plugin that registers it, but which agent
   * analyzes it and how often is operator preference; without this carve-out
   * the indices that ship by default would be the only ones that could never
   * be analyzed.
   */
  async setFeedbackAnalysis(
    aiIndexId: string,
    spaceId: string,
    feedbackAnalysis: AiIndexFeedbackAnalysis
  ): Promise<AiIndexFeedbackAnalysis> {
    const existing = await this.findDocument(aiIndexId, spaceId);
    if (!existing) {
      throw new AiIndexNotFoundError(aiIndexId);
    }

    // The dest is unchanged, so it is not re-validated here: an index whose
    // backing store was deleted after registration must still be switchable
    // off.
    await this.writeDocument(
      aiIndexId,
      spaceId,
      { ...existing.document, feedback_analysis: feedbackAnalysis },
      existing
    );

    return feedbackAnalysis;
  }

  async get(aiIndexId: string, spaceId: string): Promise<AiIndexHttpItem> {
    const existing = await this.findDocument(aiIndexId, spaceId);
    if (existing) {
      return toAiIndexItem(existing.document);
    }
    if (!this.managedBootstrap?.isManaged(aiIndexId)) {
      throw new AiIndexNotFoundError(aiIndexId);
    }
    await this.managedBootstrap.ensure(aiIndexId, spaceId);
    const newManagedAiIndex = await this.findDocument(aiIndexId, spaceId);
    if (!newManagedAiIndex) {
      throw new AiIndexNotFoundError(aiIndexId);
    }
    return toAiIndexItem(newManagedAiIndex.document);
  }

  /**
   * Fail-fast validation before expensive side effects.
   */
  async assertCanAcceptAutomation(
    aiIndexId: string,
    spaceId: string,
    automation?: { type: 'workflow'; value: string }
  ): Promise<void> {
    const existing = await this.findDocument(aiIndexId, spaceId);
    if (!existing) {
      throw new AiIndexNotFoundError(aiIndexId);
    }

    assertAiIndexAcceptsAutomation(aiIndexId, existing.document, automation);
  }

  /**
   * Appends a workflow automation to an AI index, retrying on concurrent writes.
   */
  async addAutomation(
    aiIndexId: string,
    spaceId: string,
    automation: { type: 'workflow'; value: string }
  ): Promise<'attached' | 'already_attached'> {
    return pRetry(
      async () => {
        const existing = await this.findDocument(aiIndexId, spaceId);
        if (!existing) {
          throw new AiIndexNotFoundError(aiIndexId);
        }

        const { alreadyAttached } = assertAiIndexAcceptsAutomation(
          aiIndexId,
          existing.document,
          automation
        );
        if (alreadyAttached) {
          return 'already_attached';
        }

        await this.writeDocument(
          aiIndexId,
          spaceId,
          {
            ...existing.document,
            automations: [...existing.document.automations, automation],
          },
          existing
        );

        return 'attached';
      },
      {
        retries: ADD_AUTOMATION_CONFLICT_RETRIES,
        onFailedAttempt: (error) => {
          if (!(error instanceof AiIndexConflictError)) {
            throw error;
          }
        },
      }
    );
  }

  async list(spaceId: string): Promise<AiIndexHttpItem[]> {
    const items = await this.searchSpace(spaceId);
    const missingManagedIds =
      this.managedBootstrap
        ?.getManagedIds()
        .filter((id) => !items.some((item) => item.id === id)) ?? [];
    if (missingManagedIds.length === 0) {
      return items;
    }

    // Bootstrap failures (e.g. an invalid managed dest) are isolated per id so
    // that one broken managed entry doesn't hide the rest of the space's list.
    await Promise.all(
      missingManagedIds.map(async (id) => {
        try {
          await this.managedBootstrap?.ensure(id, spaceId);
        } catch (error) {
          this.logger.warn(
            `Failed to bootstrap managed AI index '${id}' in space '${spaceId}': ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      })
    );
    return this.searchSpace(spaceId);
  }

  /**
   * Deletes the AI index entry only; backing indices are left untouched.
   * Managed entries cannot be deleted via the API.
   */
  async delete(aiIndexId: string, spaceId: string): Promise<void> {
    const existing = await this.findDocument(aiIndexId, spaceId);
    if (!existing) {
      throw new AiIndexNotFoundError(aiIndexId);
    }
    if (existing.document.managed) {
      throw new AiIndexManagedError(aiIndexId);
    }
    // Re-check the delete result: the entry may have been removed concurrently
    // between the existence lookup above and this call.
    const { result } = await this.storageClient.delete({
      id: buildAiIndexDocId(spaceId, aiIndexId),
    });
    if (result === 'not_found') {
      throw new AiIndexNotFoundError(aiIndexId);
    }
  }

  private async searchSpace(spaceId: string): Promise<AiIndexHttpItem[]> {
    const response = await this.storageClient.search({
      size: MAX_AI_INDICES,
      track_total_hits: false,
      query: { term: { space: spaceId } },
      sort: [{ id: 'asc' }],
    });
    return response.hits.hits.flatMap((hit) => (hit._source ? [toAiIndexItem(hit._source)] : []));
  }

  private async findDocument(
    aiIndexId: string,
    spaceId: string
  ): Promise<
    | {
        document: AiIndexDocument;
        seqNo?: number;
        primaryTerm?: number;
      }
    | undefined
  > {
    try {
      // seq_no_primary_term is required for the OCC assertions in `put`: the
      // storage client's get is search-based, and search hits only carry
      // _seq_no/_primary_term when explicitly requested.
      const response = await this.storageClient.get({
        id: buildAiIndexDocId(spaceId, aiIndexId),
        seq_no_primary_term: true,
      });
      if (!response.found || !response._source || response._source.space !== spaceId) {
        return undefined;
      }
      return {
        document: response._source,
        seqNo: response._seq_no,
        primaryTerm: response._primary_term,
      };
    } catch (error) {
      if (isResponseError(error) && error.statusCode === 404) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * The dest value must follow the type-specific naming convention and match
   * the declared `type`.
   */
  private async assertValidDest({ type, value }: AiIndexDest): Promise<void> {
    if (type === 'data_stream') {
      await this.assertValidDataStreamDest(value);
    } else {
      await this.assertValidIndexDest(value);
    }
  }

  /**
   * Every expression in the dest value must start with the type-specific
   * prefix.
   */
  private assertDestValueHasPrefix(value: string, prefix: string): void {
    const invalid = value.split(',').find((expression) => !expression.startsWith(prefix));
    if (invalid !== undefined) {
      throw new InvalidAiIndexDestError(
        `dest.value '${value}' is not allowed: every expression must start with '${prefix}'`
      );
    }
  }

  private async assertValidDataStreamDest(value: string): Promise<void> {
    this.assertDestValueHasPrefix(value, DATA_STREAM_PREFIX);

    let indices: estypes.IndicesResolveIndexResolveIndexItem[] = [];
    let dataStreams: estypes.IndicesResolveIndexResolveIndexDataStreamsItem[] = [];
    try {
      const resolved = await this.esClient.indices.resolveIndex({
        name: value,
        expand_wildcards: ['open', 'hidden', 'closed'],
      });
      indices = resolved.indices;
      dataStreams = resolved.data_streams;
    } catch (error) {
      if (!(isResponseError(error) && error.statusCode === 404)) {
        throw error;
      }
    }

    if (indices.length > 0) {
      throw new InvalidAiIndexDestError(
        `dest.value '${value}' is not allowed: '${indices[0].name}' is not a data stream`
      );
    }

    const invalidPrefix = dataStreams.find((ds) => !ds.name.startsWith(DATA_STREAM_PREFIX));
    if (invalidPrefix) {
      throw new InvalidAiIndexDestError(
        `dest.value '${value}' is not allowed: '${invalidPrefix.name}' must start with '${DATA_STREAM_PREFIX}'`
      );
    }
  }

  private async assertValidIndexDest(value: string): Promise<void> {
    this.assertDestValueHasPrefix(value, INDEX_PREFIX);

    let indices: estypes.IndicesResolveIndexResolveIndexItem[] = [];
    let dataStreams: estypes.IndicesResolveIndexResolveIndexDataStreamsItem[] = [];
    try {
      const resolved = await this.esClient.indices.resolveIndex({
        name: value,
        expand_wildcards: ['open', 'hidden', 'closed'],
      });
      indices = resolved.indices;
      dataStreams = resolved.data_streams;
    } catch (error) {
      if (!(isResponseError(error) && error.statusCode === 404)) {
        throw error;
      }
    }

    if (dataStreams.length > 0) {
      throw new InvalidAiIndexDestError(
        `dest.value '${value}' is not allowed: '${dataStreams[0].name}' is not an index`
      );
    }

    const invalidPrefix = indices.find((index) => !index.name.startsWith(INDEX_PREFIX));
    if (invalidPrefix) {
      throw new InvalidAiIndexDestError(
        `dest.value '${value}' is not allowed: '${invalidPrefix.name}' must start with '${INDEX_PREFIX}'`
      );
    }

    const system = indices.find((index) => index.attributes.includes('system'));
    if (system) {
      throw new InvalidAiIndexDestError(
        `dest.value '${value}' is not allowed: '${system.name}' is a system index`
      );
    }
  }
}
