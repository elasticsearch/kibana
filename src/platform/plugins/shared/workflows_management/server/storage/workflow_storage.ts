/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { IndexStorageSettings } from '@kbn/storage-adapter';
import { StorageIndexAdapter, types } from '@kbn/storage-adapter';
import type { WorkflowYaml } from '@kbn/workflows';
import { workflowSystemIndex } from './indices';

export const workflowIndexName = workflowSystemIndex('workflows');

const storageSettings = {
  name: workflowIndexName,
  schema: {
    properties: {
      // ONLY map fields we actively search/filter/aggregate on
      name: types.text({
        fields: {
          keyword: { type: 'keyword', ignore_above: 256 },
        },
      }),
      description: types.text({
        fields: {
          keyword: { type: 'keyword', ignore_above: 256 },
        },
      }),
      enabled: types.boolean({}), // We filter by this
      tags: types.keyword({}), // We search by this
      createdBy: types.keyword({}), // We filter by this
      spaceId: types.keyword({}), // We filter by this
      triggerTypes: types.keyword({}), // We filter by trigger subscription (e.g. event-driven)
      managed: types.boolean({}),
      managedBy: types.keyword({}),
      managedVersion: types.long({ index: false }),
      version: types.long({ index: false }),
      definitionHash: types.keyword({ index: false }),
      managedTemplateValues: types.object({ enabled: false }),
      originManagedWorkflowId: types.keyword({}),
      lifecycle: types.keyword({}),
      updated_at: types.date({}), // We sort by this
      // Non-searchable fields (stored but not indexed)
      yaml: types.text({ index: false }),
      definition: types.object({ enabled: false }),
      deleted_at: types.date({}),
      valid: types.boolean({}),
      created_at: types.date({}),
      lastUpdatedBy: types.keyword({}),
    },
  },
} satisfies IndexStorageSettings;

export interface WorkflowProperties {
  // TODO: we can remove this name, since we use the WorkflowYaml object to get the name
  name: string;
  description?: string;
  enabled: boolean;
  tags: string[];
  triggerTypes: string[];
  yaml: string;
  definition: WorkflowYaml | null;
  createdBy: string;
  lastUpdatedBy: string;
  spaceId: string;
  managed?: boolean;
  managedBy?: string | null;
  managedVersion?: number | null;
  version?: number;
  definitionHash?: string | null;
  managedTemplateValues?: Record<string, unknown> | null;
  originManagedWorkflowId?: string | null;
  lifecycle?: 'static' | 'dynamic' | null;
  deleted_at: Date | null;
  valid: boolean;
  created_at: string;
  updated_at: string;
}

export type WorkflowStorageSettings = typeof storageSettings;

/**
 * The storage adapter generic constraint expects `tags` to be `string`
 * (matching the ES keyword mapping), but at application level `tags` is
 * `string[]` because ES keyword fields transparently accept arrays.
 * We use a storage-level type where `tags` is `string` to satisfy the
 * generic and expose the application type externally.
 */
// @ts-expect-error type mismatch for tags type
export type WorkflowStorage = StorageIndexAdapter<WorkflowStorageSettings, WorkflowProperties>;

export const createStorage = ({
  logger,
  esClient,
}: {
  logger: Logger;
  esClient: ElasticsearchClient;
}): WorkflowStorage => {
  // @ts-expect-error type mismatch for tags type
  return new StorageIndexAdapter<WorkflowStorageSettings, WorkflowProperties>(
    esClient,
    logger,
    storageSettings
  );
};
