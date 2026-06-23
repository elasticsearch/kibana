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
import type { WorkspaceDocument } from '../types';

export const workspaceIndexName = chatSystemIndex('workspaces');

const storageSettings = {
  name: workspaceIndexName,
  schema: {
    properties: {
      workspace_id: types.keyword({}),
      space: types.keyword({}),
      schema_version: types.long({}),
      created_at: types.date({}),
      updated_at: types.date({}),
      files: types.object({ dynamic: false, properties: {} }),
    },
  },
} satisfies IndexStorageSettings;

export type WorkspaceStorageSettings = typeof storageSettings;

export type WorkspaceStorage = StorageIndexAdapter<WorkspaceStorageSettings, WorkspaceDocument>;

export const createStorage = ({
  logger,
  esClient,
}: {
  logger: Logger;
  esClient: ElasticsearchClient;
}): WorkspaceStorage => {
  return new StorageIndexAdapter<WorkspaceStorageSettings, WorkspaceDocument>(
    esClient,
    logger,
    storageSettings
  );
};
