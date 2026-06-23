/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { IndexStorageSettings } from '@kbn/storage-adapter';
import { StorageIndexAdapter, types } from '@kbn/storage-adapter';
import { chatSystemIndex } from '@kbn/agent-builder-server';
import type { VersionedAttachment } from '@kbn/agent-builder-common/attachments';
import type {
  ConversationInternalState,
  ConversationRoundStatus,
} from '@kbn/agent-builder-common/chat';
import type { PersistentConversationRound } from './types';

export const conversationIndexName = chatSystemIndex('conversations');

const storageSettings = {
  name: conversationIndexName,
  schema: {
    properties: {
      user_id: types.keyword({}),
      user_name: types.keyword({}),
      agent_id: types.keyword({}),
      space: types.keyword({}),
      title: types.text({}),
      created_at: types.date({}),
      updated_at: types.date({}),
      conversation_rounds: types.object({ dynamic: false, properties: {} }),
      attachments: types.object({ dynamic: false, properties: {} }),
      state: types.object({ dynamic: false, properties: {} }),
      status: types.keyword({}),
      read: types.boolean({}),
      workspace_id: types.keyword({}),
    },
  },
} satisfies IndexStorageSettings;

export interface ConversationProperties {
  user_id?: string;
  user_name: string;
  agent_id: string;
  space: string;
  title: string;
  created_at: string;
  updated_at: string;
  conversation_rounds: PersistentConversationRound[];
  attachments?: VersionedAttachment[];
  state?: ConversationInternalState;
  status?: ConversationRoundStatus;
  read?: boolean;
  workspace_id?: string;
  // legacy field
  rounds?: PersistentConversationRound[];
}

export type ConversationStorageSettings = typeof storageSettings;

export type ConversationStorage = StorageIndexAdapter<
  ConversationStorageSettings,
  ConversationProperties
>;

export const createStorage = ({
  logger,
  esClient,
}: {
  logger: Logger;
  esClient: ElasticsearchClient;
}): ConversationStorage => {
  return new StorageIndexAdapter<ConversationStorageSettings, ConversationProperties>(
    esClient,
    logger,
    storageSettings
  );
};
