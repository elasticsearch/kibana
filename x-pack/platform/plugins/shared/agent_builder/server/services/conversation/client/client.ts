/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { ConversationWithoutRounds } from '@kbn/agent-builder-common';
import {
  type UserIdAndName,
  type Conversation,
  createConversationNotFoundError,
  isAgentNotFoundError,
  isAgentUnavailableError,
  isConversationNotFoundError,
} from '@kbn/agent-builder-common';
import type { AgentRegistry } from '../../agents/agent_registry';
import {
  hasConversationConverseAccess,
  hasConversationOwnerAccess,
  type ConversationAccess,
} from '../access_control';
import { buildReadAccessFilter } from '../access_control/query';
import type {
  ConversationCreateRequest,
  ConversationUpdateRequest,
  ConversationListOptions,
} from './types';
import { createSpaceDslFilter } from '../../../utils/spaces';
import type { ConversationStorage } from './storage';
import { createStorage } from './storage';
import {
  fromEs,
  fromEsWithoutRounds,
  toEs,
  createRequestToEs,
  updateConversation,
  type Document,
} from './converters';

export interface ConversationClient {
  get(conversationId: string): Promise<Conversation>;
  exists(conversationId: string): Promise<boolean>;
  create(conversation: ConversationCreateRequest): Promise<Conversation>;
  update(
    conversation: ConversationUpdateRequest,
    options?: { access: ConversationAccess }
  ): Promise<Conversation>;
  list(options?: ConversationListOptions): Promise<ConversationWithoutRounds[]>;
  delete(conversationId: string): Promise<boolean>;
}

export const createClient = ({
  space,
  logger,
  esClient,
  user,
  agentRegistry,
}: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
  user: UserIdAndName;
  agentRegistry: AgentRegistry;
}): ConversationClient => {
  const storage = createStorage({ logger, esClient });
  return new ConversationClientImpl({ storage, user, space, agentRegistry });
};

class ConversationClientImpl implements ConversationClient {
  private readonly space: string;
  private readonly storage: ConversationStorage;
  private readonly user: UserIdAndName;
  private readonly agentRegistry: AgentRegistry;

  constructor({
    storage,
    user,
    space,
    agentRegistry,
  }: {
    storage: ConversationStorage;
    user: UserIdAndName;
    space: string;
    agentRegistry: AgentRegistry;
  }) {
    this.storage = storage;
    this.user = user;
    this.space = space;
    this.agentRegistry = agentRegistry;
  }

  async list(options: ConversationListOptions = {}): Promise<ConversationWithoutRounds[]> {
    const { agentId } = options;
    const agents = await this.agentRegistry.list();
    const accessibleAgentIds = agents.map(({ id }) => id);

    if (accessibleAgentIds.length === 0 || (agentId && !accessibleAgentIds.includes(agentId))) {
      return [];
    }

    const agentIds = agentId ? [agentId] : accessibleAgentIds;

    const response = await this.storage.getClient().search({
      track_total_hits: false,
      size: 1000,
      _source: [
        'agent_id',
        'user_id',
        'user_name',
        'title',
        'created_at',
        'updated_at',
        'status',
        'read',
        'access_control',
      ],
      query: {
        bool: {
          filter: [
            createSpaceDslFilter(this.space),
            buildReadAccessFilter({ user: this.user, agentIds }),
          ],
        },
      },
    });

    return response.hits.hits.map((hit) => fromEsWithoutRounds(hit as Document));
  }

  async get(conversationId: string): Promise<Conversation> {
    const document = await this.getDocumentWithAccess({ conversationId, access: 'converse' });

    return fromEs(document);
  }

  async exists(conversationId: string): Promise<boolean> {
    try {
      await this.getDocumentWithAccess({ conversationId, access: 'converse' });
      return true;
    } catch (error) {
      if (isConversationNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  async create(conversation: ConversationCreateRequest): Promise<Conversation> {
    const now = new Date();
    const id = conversation.id ?? uuidv4();

    const attributes = createRequestToEs({
      conversation,
      currentUser: this.user,
      creationDate: now,
      space: this.space,
    });

    await this.storage.getClient().index({
      id,
      document: attributes,
    });

    return this.get(id);
  }

  async update(
    conversationUpdate: ConversationUpdateRequest,
    options: { access: ConversationAccess } = { access: 'owner' }
  ): Promise<Conversation> {
    const { id: conversationId } = conversationUpdate;
    const { access } = options;
    const now = new Date();
    const document = await this.getDocumentWithAccess({ conversationId, access });

    const storedConversation = fromEs(document);
    const updatedConversation = updateConversation({
      conversation: storedConversation,
      update: conversationUpdate,
      updateDate: now,
      space: this.space,
    });
    const attributes = toEs(updatedConversation, this.space);

    await this.storage.getClient().index({
      id: conversationUpdate.id,
      document: attributes,
      // use optimistic concurrency control to prevent concurrent update conflicts
      if_seq_no: document._seq_no,
      if_primary_term: document._primary_term,
    });

    return updatedConversation;
  }

  async delete(conversationId: string): Promise<boolean> {
    await this.getDocumentWithAccess({ conversationId, access: 'owner' });

    const { result } = await this.storage.getClient().delete({ id: conversationId });
    return result === 'deleted';
  }

  private async _get(conversationId: string): Promise<Document | undefined> {
    const response = await this.storage.getClient().search({
      track_total_hits: false,
      size: 1,
      terminate_after: 1,
      query: {
        bool: {
          filter: [createSpaceDslFilter(this.space), { term: { _id: conversationId } }],
        },
      },
    });
    if (response.hits.hits.length === 0) {
      return undefined;
    } else {
      return response.hits.hits[0] as Document;
    }
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
    const document = await this._get(conversationId);

    if (!document) {
      throw createConversationNotFoundError({ conversationId });
    }

    let allowed = false;
    const conversation = document._source!;

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
    }

    if (!allowed) {
      throw createConversationNotFoundError({ conversationId });
    }

    return document;
  }
}
