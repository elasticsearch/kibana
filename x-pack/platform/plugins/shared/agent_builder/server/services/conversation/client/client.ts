/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { GetResponse, SortResults } from '@elastic/elasticsearch/lib/api/types';
import { OccWriter, isElasticsearchWriteConflict } from '@kbn/occ';
import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type {
  ConversationOrigin,
  ConversationRoundFeedback,
  FeedbackChipId,
} from '@kbn/agent-builder-common';
import {
  type CurrentUser,
  type Conversation,
  type ConversationAccessControl,
  type ConversationAccessControlEntry,
  CONVERSATION_ACCESS_CONTROL_MAX_ENTRIES,
  CONVERSATION_ACCESS_CONTROL_PRINCIPAL_ID_MAX_LENGTH,
  CONVERSATION_SCHEMA_VERSION,
  CONVERSATION_TITLE_MAX_LENGTH,
  ConversationAccessControlMode,
  isConversationAccessControlRole,
  normalizeConversationAccessControl,
  createBadRequestError,
  createConversationAlreadyExistsError,
  createConversationNotFoundError,
  createConversationWriteConflictError,
  createInternalError,
  isAgentNotFoundError,
  isAgentUnavailableError,
  isConversationNotFoundError,
} from '@kbn/agent-builder-common';
import type { SerializedMetadataValue, MetadataFieldValue } from '@kbn/agent-builder-common';
import type {
  ConversationWithPermissions,
  UpdateConversationAccessControlRequestBody,
} from '../../../../common/http_api/conversations';
import type { AgentRegistry } from '../../agents/agent_registry';
import {
  buildPinnedFilter,
  buildReadAccessFilter,
  hasConversationConverseAccess,
  hasConversationDeleteAccess,
  hasConversationOwnerAccess,
  hasConversationRenameAccess,
  hasConversationUpdateAccessControlAccess,
  type ConversationAccess,
} from '../access_control';
import type {
  AddAttachmentsToLastRoundRequest,
  AppendEventsRequest,
  ConversationCreateRequest,
  ConversationUpdatableFields,
  ConversationUpdateRequest,
  ConversationListOptions,
  NormalizedConversation,
  ReplaceRoundEventsRequest,
  ConversationListResult,
  UpsertRoundRequest,
} from './types';
import { createSpaceDslFilter, isDefaultSpace } from '../../../utils/spaces';
import { MAX_CONVERSATIONS_PER_PAGE, MAX_RESULT_WINDOW } from '../../../../common/constants';
import { isVersionConflictError } from '../../../utils/is_version_conflict_error';
import type { ConversationProperties, ConversationStorage } from './storage';
import { conversationIndexName, createStorage } from './storage';
import { getTemplate } from '../templates/registry';
import { validateTemplateDefaults, validateMetadataUpdate } from '../templates/validation';
import { serializeMetadataValue, buildMetadataFromTemplate } from '../templates/serialize';
import { reconcileAttachments, upsertRound as upsertRoundInList } from './round_writes';
import { applyAttachmentRefsToRounds } from './migrate_attachments';
import { updateReadBy } from './read_by';
import { updatePinnedBy } from './pinned_by';
import {
  fromEs,
  fromEsWithoutRounds,
  toEs,
  toConversationResponse,
  toConversationResponseFromDocument,
  createRequestToEs,
  isConversationDocument,
  toResponseConversation,
  toResponseConversationWithoutRounds,
  updateConversation,
  type Document,
} from './converters';
import type { ConversationMetadataPatchedPayload } from '../../../workflows/triggers/conversation_event_bus';

// Note: comparison is order-sensitive for arrays — reordering elements counts as a change.
// This is intentional: metadata arrays (e.g. ordered checklists) preserve insertion order.
function computeChangedFields(
  updates: Record<string, SerializedMetadataValue>,
  stored: Record<string, SerializedMetadataValue>
): string[] {
  return Object.keys(updates).filter(
    (k) => JSON.stringify(stored[k]) !== JSON.stringify(updates[k])
  );
}

export interface ConversationClient {
  /** Identity this client is scoped to: the owner of the conversations it creates. */
  readonly user: CurrentUser;
  get(conversationId: string): Promise<ConversationWithPermissions>;
  exists(conversationId: string): Promise<boolean>;
  getByOrigin(origin: ConversationOrigin): Promise<Conversation | undefined>;
  create(conversation: ConversationCreateRequest): Promise<ConversationWithPermissions>;
  update(
    conversation: ConversationUpdateRequest,
    options?: { access: ConversationAccess; retryOnConflict?: boolean }
  ): Promise<Conversation>;
  addAttachmentsToLastRound(
    request: AddAttachmentsToLastRoundRequest,
    options?: { access: ConversationAccess }
  ): Promise<Conversation>;
  upsertRound(
    request: UpsertRoundRequest,
    options?: { access: ConversationAccess }
  ): Promise<Conversation>;
  appendEvents(
    request: AppendEventsRequest,
    options?: { access: ConversationAccess }
  ): Promise<Conversation>;
  replaceRoundEvents(
    request: ReplaceRoundEventsRequest,
    options?: { access: ConversationAccess }
  ): Promise<Conversation>;
  markRead(conversationId: string, read: boolean): Promise<Conversation>;
  setPinned(conversationId: string, pinned: boolean): Promise<Conversation>;
  updateRoundFeedback(
    conversationId: string,
    roundId: string,
    feedback: { vote: 'up' | 'down' | null; chips?: FeedbackChipId[]; comment?: string }
  ): Promise<void>;
  list(options?: ConversationListOptions): Promise<ConversationListResult>;
  delete(conversationId: string): Promise<boolean>;
  updateAccessControl(
    conversationId: string,
    update: UpdateConversationAccessControlRequestBody
  ): Promise<ConversationAccessControl>;
  applyTemplate(conversationId: string, templateId: string): Promise<Conversation>;
  patchMetadata(
    conversationId: string,
    updates: Record<string, unknown>
  ): Promise<{ conversation: Conversation; changedFields: string[] }>;
}

/**
 * Caps `title` at the stored bound. HTTP routes already validate it, but server-side callers
 * (LLM title generation in particular) do not, so enforce it here to cover every write path.
 */
const withBoundedTitle = <T extends { title?: string }>(fields: T): T =>
  fields.title === undefined
    ? fields
    : { ...fields, title: fields.title.slice(0, CONVERSATION_TITLE_MAX_LENGTH) };

export const createClient = ({
  space,
  logger,
  esClient,
  user,
  agentRegistry,
  onMetadataPatched,
}: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
  user: CurrentUser;
  agentRegistry: AgentRegistry;
  onMetadataPatched?: (payload: ConversationMetadataPatchedPayload) => void;
}): ConversationClient => {
  const storage = createStorage({ logger, esClient });
  return new ConversationClientImpl({
    storage,
    esClient,
    user,
    space,
    agentRegistry,
    logger,
    onMetadataPatched,
  });
};

class ConversationClientImpl implements ConversationClient {
  private readonly space: string;
  private readonly storage: ConversationStorage;
  private readonly esClient: ElasticsearchClient;
  public readonly user: CurrentUser;
  private readonly agentRegistry: AgentRegistry;
  private readonly logger: Logger;
  private readonly onMetadataPatched?: (payload: ConversationMetadataPatchedPayload) => void;

  constructor({
    storage,
    esClient,
    user,
    space,
    agentRegistry,
    logger,
    onMetadataPatched,
  }: {
    storage: ConversationStorage;
    esClient: ElasticsearchClient;
    user: CurrentUser;
    space: string;
    agentRegistry: AgentRegistry;
    logger: Logger;
    onMetadataPatched?: (payload: ConversationMetadataPatchedPayload) => void;
  }) {
    this.storage = storage;
    this.esClient = esClient;
    this.user = user;
    this.space = space;
    this.agentRegistry = agentRegistry;
    this.logger = logger;
    this.onMetadataPatched = onMetadataPatched;
  }

  async list(options: ConversationListOptions = {}): Promise<ConversationListResult> {
    const {
      agentId,
      page = 1,
      perPage = MAX_CONVERSATIONS_PER_PAGE,
      sortOrder = 'desc',
      pinned,
    } = options;

    const accessibleAgentIds = await this.agentRegistry.getIds();

    if (accessibleAgentIds.length === 0 || (agentId && !accessibleAgentIds.includes(agentId))) {
      return { results: [], total: 0 };
    }

    const agentIds = agentId ? [agentId] : accessibleAgentIds;

    const pinnedFilter = buildPinnedFilter({ user: this.user, pinned });

    const response = await this.storage.getClient().search({
      // Cap at MAX_RESULT_WINDOW: anything beyond is unreachable via offset pagination.
      track_total_hits: MAX_RESULT_WINDOW,
      from: (page - 1) * perPage,
      size: perPage,
      sort: [{ updated_at: { order: sortOrder } }, { created_at: { order: sortOrder } }],
      seq_no_primary_term: true,
      _source: [
        'agent_id',
        'user_id',
        'user_name',
        'title',
        'created_at',
        'updated_at',
        'status',
        'read',
        'read_by',
        'pinned',
        'pinned_by',
        'read_only',
        'access_control',
        'origin',
        'workspace_id',
        'template_id',
        'template_version',
        'metadata',
      ],
      query: {
        bool: {
          filter: [
            createSpaceDslFilter(this.space),
            buildReadAccessFilter({ user: this.user, agentIds }),
            // Hide sub-agent conversations from the nav list - hardcoded until we need to do better
            { bool: { must_not: [{ exists: { field: 'parent_conversation' } }] } },
            ...pinnedFilter,
          ],
        },
      },
    });

    const hitsTotal = response.hits.total;
    const total = Math.min(
      typeof hitsTotal === 'number' ? hitsTotal : hitsTotal?.value ?? 0,
      MAX_RESULT_WINDOW
    );

    const results = response.hits.hits.map((hit) => {
      if (!isConversationDocument(hit)) {
        throw createInternalError('Conversation list search returned an incomplete hit');
      }

      return toResponseConversationWithoutRounds({
        document: hit,
        user: this.user,
        resolveTemplate: getTemplate,
      });
    });

    return { results, total };
  }

  async get(conversationId: string): Promise<ConversationWithPermissions> {
    const document = await this.getDocumentWithAccess({ conversationId, access: 'converse' });

    return toResponseConversation({
      document,
      user: this.user,
      resolveTemplate: getTemplate,
    });
  }

  async exists(conversationId: string): Promise<boolean> {
    const document = await this.getDocument(conversationId);

    return document !== undefined;
  }

  async getByOrigin(origin: ConversationOrigin): Promise<Conversation | undefined> {
    const response = await this.storage.getClient().search({
      track_total_hits: false,
      size: 1,
      terminate_after: 1,
      seq_no_primary_term: true,
      query: {
        bool: {
          filter: [
            createSpaceDslFilter(this.space),
            { term: { 'origin.external_conversation_id': origin.external_conversation_id } },
          ],
        },
      },
    });

    const hit = response.hits.hits[0];

    if (!hit) {
      return undefined;
    }

    if (!isConversationDocument(hit)) {
      throw createInternalError('Conversation origin search returned an incomplete hit');
    }

    try {
      const document = await this.getDocumentWithAccess({
        conversationId: hit._id,
        access: 'converse',
      });

      return toConversationResponseFromDocument({
        document,
        user: this.user,
        resolveTemplate: getTemplate,
      });
    } catch (error) {
      if (isConversationNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async create(conversation: ConversationCreateRequest): Promise<ConversationWithPermissions> {
    const now = new Date();
    const id = conversation.id ?? uuidv4();

    const { template_id: templateId, ...conversationWithoutTemplateId } = conversation;

    let resolvedMetadata = conversationWithoutTemplateId.metadata;
    let resolvedTemplateId: string | undefined;
    let resolvedTemplateVersion: number | undefined;
    if (!templateId && resolvedMetadata && Object.keys(resolvedMetadata).length > 0) {
      throw createBadRequestError(
        '`metadata` requires `template_id`: metadata values are validated against the referenced template'
      );
    }
    if (templateId) {
      const template = getTemplate(templateId);
      if (!template) {
        throw createBadRequestError(`Template not found: ${templateId}`);
      }
      validateTemplateDefaults(template);
      // Validate any caller-supplied metadata against the template before merging.
      if (resolvedMetadata && Object.keys(resolvedMetadata).length > 0) {
        validateMetadataUpdate(template.id, template.fields, resolvedMetadata);
      }
      const templateMetadata = buildMetadataFromTemplate(template);
      // Serialize caller-supplied values to string/string[] before merging, just as
      // buildMetadataFromTemplate and patchMetadata do. Without this, a caller passing
      // e.g. { recipients_notified: true } (TOGGLE) writes a raw boolean into the
      // flattened field; deserializeMetadataValue then reads `true === 'true'` → false.
      const serializedCallerMetadata = Object.fromEntries(
        Object.entries(resolvedMetadata ?? {}).map(([key, value]) => {
          const def = template.fields[key];
          return [
            key,
            def ? serializeMetadataValue(value as MetadataFieldValue, def.input_type) : value,
          ];
        })
      );
      resolvedMetadata = { ...templateMetadata, ...serializedCallerMetadata };
      resolvedTemplateId = templateId;
      resolvedTemplateVersion = template.version;
    }

    const normalizedAccessControl = conversationWithoutTemplateId.access_control
      ? {
          access_mode: conversationWithoutTemplateId.access_control.access_mode,
          entries: validateAccessControlEntries({
            entries: conversationWithoutTemplateId.access_control.entries,
            ownerId: this.user.id,
            addedAtById: new Map(),
          }),
        }
      : undefined;

    const attributes = createRequestToEs({
      conversation: {
        ...withBoundedTitle(conversationWithoutTemplateId),
        access_control: normalizedAccessControl,
        metadata: resolvedMetadata,
        ...(resolvedTemplateId ? { template_id: resolvedTemplateId } : {}),
        ...(resolvedTemplateVersion !== undefined
          ? { template_version: resolvedTemplateVersion }
          : {}),
      },
      currentUser: this.user,
      creationDate: now,
      space: this.space,
    });

    try {
      await this.storage.getClient().index({
        id,
        document: attributes,
        op_type: 'create',
      });
    } catch (error) {
      if (isVersionConflictError(error)) {
        throw createConversationAlreadyExistsError({ conversationId: id });
      }

      throw error;
    }

    return this.get(id);
  }

  async update(
    conversationUpdate: ConversationUpdateRequest,
    options: { access: ConversationAccess; retryOnConflict?: boolean } = { access: 'owner' }
  ): Promise<Conversation> {
    const { id: conversationId, ...fields } = conversationUpdate;
    const { access, retryOnConflict = false } = options;

    const result = await this.writeConversation({
      conversationId,
      access,
      ...(retryOnConflict ? {} : { maxRetries: 0 }),
      fields: () => withBoundedTitle(fields),
    });

    return result;
  }

  async addAttachmentsToLastRound(
    request: AddAttachmentsToLastRoundRequest,
    options: { access: ConversationAccess } = { access: 'owner' }
  ): Promise<Conversation> {
    const { id: conversationId, refs, attachments } = request;
    const { access } = options;

    const result = await this.writeConversation({
      conversationId,
      access,
      fields: (current) => {
        if (current.rounds.length === 0) {
          throw createBadRequestError(`Conversation ${conversationId} has no rounds to attach to`);
        }

        return {
          rounds: applyAttachmentRefsToRounds(
            current.rounds,
            new Map([[current.rounds.length - 1, refs]])
          ),
          attachments: reconcileAttachments({
            snapshot: attachments.snapshot,
            stored: current.attachments ?? [],
            produced: attachments.produced,
          }),
        };
      },
    });
    return result;
  }

  async upsertRound(
    request: UpsertRoundRequest,
    options: { access: ConversationAccess } = { access: 'converse' }
  ): Promise<Conversation> {
    const { id: conversationId, round, replacesRoundId, state, attachments, workspaceId } = request;
    const { access } = options;

    const result = await this.writeConversation({
      conversationId,
      access,
      fields: (current) => ({
        rounds: upsertRoundInList(current.rounds, round, replacesRoundId),
        status: round.status,
        ...(state ? { state } : {}),
        ...(attachments
          ? {
              attachments: reconcileAttachments({
                snapshot: attachments.snapshot,
                stored: current.attachments ?? [],
                produced: attachments.produced,
              }),
            }
          : {}),
        ...(workspaceId && !current.workspace_id ? { workspace_id: workspaceId } : {}),
        read_by: [],
        read: false,
      }),
    });
    return result;
  }

  /** Appends timeline events onto a conversation.*/
  async appendEvents(
    request: AppendEventsRequest,
    options: { access: ConversationAccess } = { access: 'converse' }
  ): Promise<Conversation> {
    const { id: conversationId, events, title, status, state, attachments, workspaceId } = request;
    const { access } = options;

    return this.writeConversation({
      conversationId,
      access,
      fields: (current) => {
        const currentEvents = current.events ?? [];
        const existingIds = new Set(currentEvents.map((event) => event.id));
        const newEvents = events.filter((event) => !existingIds.has(event.id));
        const appended = [...currentEvents, ...newEvents];
        return {
          events: appended,
          schema_version: CONVERSATION_SCHEMA_VERSION,
          ...(title !== undefined ? { title } : {}),
          ...(status ? { status } : {}),
          ...(state ? { state } : {}),
          ...(attachments
            ? {
                attachments: reconcileAttachments({
                  snapshot: attachments.snapshot,
                  stored: current.attachments ?? [],
                  produced: attachments.produced,
                }),
              }
            : {}),
          ...(workspaceId && !current.workspace_id ? { workspace_id: workspaceId } : {}),
          read_by: [],
          read: false,
        };
      },
    });
  }

  async replaceRoundEvents(
    request: ReplaceRoundEventsRequest,
    options: { access: ConversationAccess } = { access: 'converse' }
  ): Promise<Conversation> {
    const {
      id: conversationId,
      roundId,
      events,
      title,
      status,
      state,
      attachments,
      workspaceId,
    } = request;
    const { access } = options;
    const roundPrefix = `${roundId}::`;

    return this.writeConversation({
      conversationId,
      access,
      fields: (current) => {
        const currentEvents = current.events ?? [];
        const nonRoundEvents = currentEvents.filter((event) => !event.id.startsWith(roundPrefix));
        const replaced = [...nonRoundEvents, ...events];
        return {
          events: replaced,
          schema_version: CONVERSATION_SCHEMA_VERSION,
          ...(title !== undefined ? { title } : {}),
          ...(status ? { status } : {}),
          ...(state ? { state } : {}),
          ...(attachments
            ? {
                attachments: reconcileAttachments({
                  snapshot: attachments.snapshot,
                  stored: current.attachments ?? [],
                  produced: attachments.produced,
                }),
              }
            : {}),
          ...(workspaceId && !current.workspace_id ? { workspace_id: workspaceId } : {}),
          read_by: [],
          read: false,
        };
      },
    });
  }

  async markRead(conversationId: string, read: boolean): Promise<Conversation> {
    return this.writeConversation({
      conversationId,
      access: 'converse',
      fields: (current) =>
        updateReadBy({
          userId: this.user.id,
          readBy: current.read_by,
          currentRead: current.read ?? false,
          nextRead: read,
        }),
    });
  }

  async setPinned(conversationId: string, pinned: boolean): Promise<Conversation> {
    return this.writeConversation({
      conversationId,
      access: 'converse',
      fields: (current) =>
        updatePinnedBy({
          userId: this.user.id,
          pinnedBy: current.pinned_by,
          currentPinned: current.pinned ?? false,
          nextPinned: pinned,
        }),
    });
  }

  async updateRoundFeedback(
    conversationId: string,
    roundId: string,
    feedback: { vote: 'up' | 'down' | null; chips?: FeedbackChipId[]; comment?: string }
  ): Promise<void> {
    await this.writeConversation({
      conversationId,
      access: 'owner',
      fields: (current) => {
        const roundIndex = current.rounds.findIndex((r) => r.id === roundId);

        if (roundIndex === -1) {
          throw createConversationNotFoundError({ conversationId });
        }

        const round = current.rounds[roundIndex];
        const { feedback: _removed, ...roundWithoutFeedback } = round;

        const updatedRound =
          feedback.vote === null
            ? roundWithoutFeedback
            : {
                ...round,
                feedback: {
                  vote: feedback.vote,
                  chips: feedback.chips ?? [],
                  comment: feedback.comment ?? '',
                  submitted_at: new Date().toISOString(),
                  connector_id: round.model_usage?.connector_id,
                  model: round.model_usage?.model,
                } satisfies ConversationRoundFeedback,
              };

        return {
          rounds: current.rounds.map((r, i) => (i === roundIndex ? updatedRound : r)),
        };
      },
    });
  }

  async delete(conversationId: string): Promise<boolean> {
    return this.deleteWithCascade(conversationId, new Set<string>());
  }

  private async deleteWithCascade(conversationId: string, visited: Set<string>): Promise<boolean> {
    // Guard against cycles / self-referential loops
    if (visited.has(conversationId)) {
      return true;
    }
    visited.add(conversationId);

    await this.getDocumentWithAccess({ conversationId, access: 'delete' });

    // Cascade — find children (persistent sub-agent conversations), delete them
    // concurrently (best-effort per child; the `visited` guard is race-free
    // because its has/add pair runs synchronously with no `await` between).
    const childIds = (await this.findChildConversationIds(conversationId)).filter(
      (id) => id !== conversationId && !visited.has(id)
    );
    await Promise.all(
      childIds.map((childId) =>
        this.deleteWithCascade(childId, visited).catch((err) => {
          this.logger.warn(
            `Failed to cascade-delete child conversation ${childId} of ${conversationId}: ${
              (err as Error)?.message ?? String(err)
            }`
          );
        })
      )
    );

    try {
      const { result } = await this.storage.getClient().delete({ id: conversationId });
      return result === 'deleted';
    } catch (err) {
      if (err?.statusCode === 404) {
        return true;
      }
      throw err;
    }
  }

  async updateAccessControl(
    conversationId: string,
    update: UpdateConversationAccessControlRequestBody
  ): Promise<ConversationAccessControl> {
    const conversation = await this.writeConversation({
      conversationId,
      access: 'updateAccessControl',
      fields: (current) => ({
        access_control: this.buildAccessControlUpdate({ current, update }),
      }),
    });

    return normalizeConversationAccessControl(conversation.access_control);
  }

  async applyTemplate(conversationId: string, templateId: string): Promise<Conversation> {
    const template = getTemplate(templateId);
    if (!template) {
      throw createBadRequestError(`Template not found: ${templateId}`);
    }

    validateTemplateDefaults(template);
    const newTemplateFieldNames = new Set(Object.keys(template.fields));
    const newTemplateMetadata = buildMetadataFromTemplate(template);

    const result = await this.writeConversation({
      conversationId,
      access: 'owner',
      fields: (current) => {
        // Reject switching to a different template — one template per conversation.
        // Re-applying the same template is the explicit version-migration action.
        if (current.template_id && current.template_id !== templateId) {
          throw createBadRequestError(
            `Conversation already has template "${current.template_id}". ` +
              `Switching templates is not supported; re-apply the same template to migrate to a newer version.`
          );
        }

        // Version bump (or first apply): preserve existing values for fields still
        // declared in the new version, seed defaults for newly added fields, and drop
        // everything else (fields the new version removed).
        const storedMetadata = (current.metadata ?? {}) as Record<string, SerializedMetadataValue>;
        const preservedValues = Object.fromEntries(
          Object.entries(storedMetadata).filter(([key]) => newTemplateFieldNames.has(key))
        );
        return {
          metadata: { ...newTemplateMetadata, ...preservedValues },
          template_id: templateId,
          template_version: template.version,
        };
      },
    });

    return result;
  }

  async patchMetadata(
    conversationId: string,
    updates: Record<string, unknown>
  ): Promise<{ conversation: Conversation; changedFields: string[] }> {
    let changedFields: string[] = [];

    const result = await this.writeConversation({
      conversationId,
      access: 'owner',
      fields: (current) => {
        if (!current.template_id) {
          throw createBadRequestError(
            `Conversation "${conversationId}" has no template — apply a template before writing metadata`
          );
        }

        const template = getTemplate(current.template_id);
        if (!template) {
          throw createBadRequestError(
            `Template "${current.template_id}" referenced by this conversation was not found`
          );
        }

        // validateMetadataUpdate throws with accumulated per-field errors if any key is invalid.
        validateMetadataUpdate(template.id, template.fields, updates);

        const serialized = Object.fromEntries(
          Object.entries(updates).map(([k, v]) => {
            const def = template.fields[k];
            return [k, serializeMetadataValue(v as MetadataFieldValue, def.input_type)];
          })
        );

        const storedMetadata = (current.metadata ?? {}) as Record<string, SerializedMetadataValue>;

        // Track which fields actually changed to suppress no-op trigger events.
        changedFields = computeChangedFields(serialized, storedMetadata);

        return { metadata: { ...storedMetadata, ...serialized } };
      },
    });

    if (changedFields.length > 0 && this.onMetadataPatched) {
      this.onMetadataPatched({
        conversationId: result.id,
        templateId: result.template_id,
        parentId: result.parent_conversation?.id,
        changedFields,
      });
    }

    return { conversation: result, changedFields };
  }

  private async getDocument(conversationId: string): Promise<Document | undefined> {
    let response: GetResponse<ConversationProperties>;
    try {
      // Bypass the storage adapter (whose `get` still routes through `search`) and use the raw
      // ES `get` API — reads by id must be immediate, not subject to search-refresh latency.
      response = await this.esClient.get<ConversationProperties>({
        index: conversationIndexName,
        id: conversationId,
      });
    } catch (err) {
      if (err?.meta?.statusCode === 404 || err?.statusCode === 404) {
        return undefined;
      }
      throw err;
    }

    if (!response.found || !response._source) {
      return undefined;
    }

    // Mirror `createSpaceDslFilter`: any space-mismatched hit is treated as not-found so callers
    // cannot cross a space boundary via a known id.
    const docSpace = response._source.space;
    const spaceMatches = isDefaultSpace(this.space)
      ? docSpace === undefined || docSpace === this.space
      : docSpace === this.space;
    if (!spaceMatches) {
      return undefined;
    }

    if (!isConversationDocument(response as Partial<Document>)) {
      throw createInternalError(`Conversation ${conversationId} was read without version metadata`);
    }

    return response as Document;
  }

  private async findChildConversationIds(parentId: string): Promise<string[]> {
    // Paginate through all children
    const PAGE_SIZE = 500;
    const ids: string[] = [];
    let searchAfter: SortResults | undefined;

    while (true) {
      const response = await this.storage.getClient().search({
        size: PAGE_SIZE,
        track_total_hits: false,
        _source: false,
        // `_doc` sort is the cheapest ES sort — no scoring, no field access and stable for search_after paging.
        sort: ['_doc'],
        ...(searchAfter ? { search_after: searchAfter } : {}),
        query: {
          bool: {
            filter: [
              { term: { 'parent_conversation.id': parentId } },
              createSpaceDslFilter(this.space),
            ],
          },
        },
      });

      const hits = response.hits.hits;
      for (const hit of hits) {
        if (hit._id) ids.push(hit._id);
      }

      if (hits.length < PAGE_SIZE) break;
      searchAfter = hits[hits.length - 1].sort;
    }

    return ids;
  }

  /**
   * Fetches a conversation and applies the requested access gate. Converse access
   * requires current use access to the underlying agent even for conversation
   * owners; all denials are masked as not-found responses so callers cannot
   * distinguish inaccessible conversations.
   */
  private async getDocumentWithAccess({
    conversationId,
    access,
  }: {
    conversationId: string;
    access: ConversationAccess;
  }): Promise<Document> {
    const document = await this.getDocument(conversationId);

    if (!document) {
      throw createConversationNotFoundError({ conversationId });
    }

    let allowed = false;
    const conversation = fromEsWithoutRounds(document, this.user);

    switch (access) {
      case 'converse':
        allowed = hasConversationConverseAccess({ conversation, user: this.user });

        if (allowed) {
          try {
            await this.agentRegistry.get(conversation.agent_id, { access: 'use' });
          } catch (error) {
            if (
              !isAgentNotFoundError(error) &&
              !isAgentUnavailableError(error, conversation.agent_id)
            ) {
              throw error;
            }

            allowed = false;
          }
        }
        break;

      case 'owner':
        allowed = hasConversationOwnerAccess({ conversation, user: this.user });
        break;

      case 'rename':
        allowed = hasConversationRenameAccess({ conversation, user: this.user });
        break;

      case 'delete':
        allowed = hasConversationDeleteAccess({ conversation, user: this.user });
        break;

      case 'updateAccessControl':
        allowed = hasConversationUpdateAccessControlAccess({ conversation, user: this.user });
        break;
    }

    if (!allowed) {
      throw createConversationNotFoundError({ conversationId });
    }

    return document;
  }

  /**
   * Read-modify-write against the stored conversation, retrying on conflict.
   * `fields` is replayed per attempt against the freshly read conversation, so it must be free of side effects.
   */
  private async writeConversation({
    conversationId,
    access,
    fields,
    maxRetries = 5,
  }: {
    conversationId: string;
    access: ConversationAccess;
    fields: (current: NormalizedConversation) => Omit<ConversationUpdatableFields, 'id'>;
    maxRetries?: number;
  }): Promise<Conversation> {
    const writer = this.createWriter({ access, maxRetries });

    try {
      const { document } = await writer.readModifyWrite({
        id: conversationId,
        mutate: (current) =>
          updateConversation({
            conversation: current,
            update: { id: conversationId, ...fields(current) },
            updateDate: new Date(),
            space: this.space,
          }),
      });

      return toConversationResponse({ conversation: document, resolveTemplate: getTemplate });
    } catch (error) {
      // retries are exhausted
      if (isElasticsearchWriteConflict(error)) {
        this.logger.warn(
          `Conflicting writes to conversation ${conversationId} could not be reconciled`
        );

        throw createConversationWriteConflictError({ conversationId });
      }

      throw error;
    }
  }

  private createWriter({
    access,
    maxRetries,
  }: {
    access: ConversationAccess;
    maxRetries: number;
  }): OccWriter<NormalizedConversation> {
    return new OccWriter<NormalizedConversation>({
      get: async (id) => {
        const document = await this.getDocumentWithAccess({ conversationId: id, access });

        return {
          id,
          source: fromEs(document, this.user),
          occ: { seqNo: document._seq_no, primaryTerm: document._primary_term },
        };
      },
      index: async ({ id, document, ifSeqNo, ifPrimaryTerm }) => {
        const response = await this.storage.getClient().index({
          id,
          document: toEs(document, this.space),
          ...(ifSeqNo != null && ifPrimaryTerm != null
            ? { if_seq_no: ifSeqNo, if_primary_term: ifPrimaryTerm }
            : {}),
        });

        return { seqNo: response._seq_no!, primaryTerm: response._primary_term! };
      },
      logger: this.logger,
      maxRetries,
      retryDelayMs: 400,
    });
  }

  /**
   * Validates the request and builds the replacement access control, carrying `added_at` over
   * for members that are already listed so re-sharing does not reset when they were added.
   */
  private buildAccessControlUpdate({
    current,
    update,
  }: {
    current: Conversation;
    update: UpdateConversationAccessControlRequestBody;
  }): ConversationAccessControl {
    const { access_mode: accessMode, entries } = update;
    const ownerId = current.user.id;

    if (accessMode === ConversationAccessControlMode.Public && entries.length > 0) {
      throw createBadRequestError('ACL entries are not supported when access_mode is "public"');
    }

    if (entries.length > CONVERSATION_ACCESS_CONTROL_MAX_ENTRIES) {
      throw createBadRequestError(
        `ACL entries exceed maximum of ${CONVERSATION_ACCESS_CONTROL_MAX_ENTRIES}`
      );
    }

    const addedAtById = new Map(
      normalizeConversationAccessControl(current.access_control).entries.map((entry) => [
        `${entry.type}:${entry.id}`,
        entry.added_at,
      ])
    );

    return {
      access_mode: accessMode,
      entries: validateAccessControlEntries({ entries, ownerId, addedAtById }),
    };
  }
}

/**
 * Validates each requested entry and stamps `added_at`, carrying it over from `addedAtById`
 * for members already listed so re-sharing does not reset when they were added. An entry
 * naming the owner is dropped, since owner access is keyed off document ownership, not entries.
 */
export const validateAccessControlEntries = ({
  entries,
  ownerId,
  addedAtById,
}: {
  entries: UpdateConversationAccessControlRequestBody['entries'];
  ownerId: string | undefined;
  addedAtById: Map<string, string>;
}): ConversationAccessControlEntry[] => {
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const normalizedEntries: ConversationAccessControlEntry[] = [];

  for (const entry of entries) {
    if (!entry || entry.type !== 'user') {
      throw createBadRequestError('Each ACL entry requires a type of "user"');
    }

    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      throw createBadRequestError('Each ACL entry requires a non-empty id');
    }

    if (entry.id.length > CONVERSATION_ACCESS_CONTROL_PRINCIPAL_ID_MAX_LENGTH) {
      throw createBadRequestError(
        `ACL principal id exceeds maximum length of ${CONVERSATION_ACCESS_CONTROL_PRINCIPAL_ID_MAX_LENGTH}`
      );
    }

    if (!isConversationAccessControlRole(entry.role)) {
      throw createBadRequestError(`Unknown ACL role: ${String(entry.role)}`);
    }

    // Owner access is keyed off document ownership, so an owner entry would be inert.
    if (ownerId !== undefined && entry.id === ownerId) {
      continue;
    }

    const key = `${entry.type}:${entry.id}`;

    if (seen.has(key)) {
      throw createBadRequestError(`Duplicate ACL entry for ${entry.type} "${entry.id}"`);
    }

    seen.add(key);

    normalizedEntries.push({
      type: entry.type,
      id: entry.id,
      role: entry.role,
      added_at: addedAtById.get(key) ?? now,
    });
  }

  return normalizedEntries;
};
