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
} from '@kbn/agent-builder-common';
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
  update(conversation: ConversationUpdateRequest): Promise<Conversation>;
  list(options?: ConversationListOptions): Promise<ConversationWithoutRounds[]>;
  delete(conversationId: string): Promise<boolean>;
}

export const createClient = ({
  space,
  logger,
  esClient,
  user,
}: {
  space: string;
  logger: Logger;
  esClient: ElasticsearchClient;
  user: UserIdAndName;
}): ConversationClient => {
  const storage = createStorage({ logger, esClient });
  return new ConversationClientImpl({ storage, user, space });
};

class ConversationClientImpl implements ConversationClient {
  private readonly space: string;
  private readonly storage: ConversationStorage;
  private readonly user: UserIdAndName;

  constructor({
    storage,
    user,
    space,
  }: {
    storage: ConversationStorage;
    user: UserIdAndName;
    space: string;
  }) {
    this.storage = storage;
    this.user = user;
    this.space = space;
  }

  async list(options: ConversationListOptions = {}): Promise<ConversationWithoutRounds[]> {
    const { agentId } = options;

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
          filter: [createSpaceDslFilter(this.space)],
          must: [
            {
              term: { user_name: this.user.username },
            },
            ...(agentId ? [{ term: { agent_id: agentId } }] : []),
          ],
        },
      },
    });

    return response.hits.hits.map((hit) => fromEsWithoutRounds(hit as Document));
  }

  async get(conversationId: string): Promise<Conversation> {
    const document = await this._get(conversationId);
    if (!document) {
      throw createConversationNotFoundError({ conversationId });
    }

    if (!hasAccess({ conversation: document, user: this.user })) {
      throw createConversationNotFoundError({ conversationId });
    }

    return fromEs(document);
  }

  async exists(conversationId: string): Promise<boolean> {
    const document = await this._get(conversationId);
    if (!document) {
      return false;
    }
    return hasAccess({ conversation: document, user: this.user });
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

  async update(conversationUpdate: ConversationUpdateRequest): Promise<Conversation> {
    const { id: conversationId } = conversationUpdate;
    const now = new Date();
    const document = await this._get(conversationUpdate.id);
    if (!document) {
      throw createConversationNotFoundError({ conversationId });
    }

    if (!hasAccess({ conversation: document, user: this.user })) {
      throw createConversationNotFoundError({ conversationId });
    }

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

    return this.get(conversationUpdate.id);
  }

  async delete(conversationId: string): Promise<boolean> {
    const document = await this._get(conversationId);
    if (!document) {
      throw createConversationNotFoundError({ conversationId });
    }

    if (!hasAccess({ conversation: document, user: this.user })) {
      throw createConversationNotFoundError({ conversationId });
    }

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
}

const hasAccess = ({
  conversation,
  user,
}: {
  conversation: Pick<Document, '_source'>;
  user: UserIdAndName;
}) => {
  if (user.id && conversation._source!.user_id === user.id) {
    return true;
  }
  return conversation._source!.user_name === user.username;
};
