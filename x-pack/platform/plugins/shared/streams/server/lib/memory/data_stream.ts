/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataStreamDefinition } from '@kbn/data-streams';
import type { GetFieldsOf, MappingsDefinition } from '@kbn/es-mappings';
import { mappings } from '@kbn/es-mappings';
import { MEMORIES_DATA_STREAM } from '../../../common/constants';

export const memoriesMappings = {
  dynamic: false,
  properties: {
    '@timestamp': mappings.date({ format: 'strict_date_optional_time' }),
    // Core identity
    id: mappings.keyword(),
    name: mappings.keyword(),
    title: mappings.text({ fields: { keyword: { type: 'keyword', ignore_above: 512 } } }),
    content: mappings.text(),
    // Semantic embedding — populated on write, queried via 'semantic' or 'hybrid' search mode
    search_embedding: mappings.semanticText(),
    // Classification
    categories: mappings.keyword(),
    tags: mappings.keyword(),
    references: mappings.keyword(),
    // Versioning & authorship
    version: mappings.long(),
    created_at: mappings.date({ format: 'strict_date_optional_time' }),
    updated_at: mappings.date({ format: 'strict_date_optional_time' }),
    created_by: mappings.keyword(),
    updated_by: mappings.keyword(),
    // Soft-delete flag: true on tombstone documents written by MemoryServiceImpl.delete()
    is_deleted: mappings.boolean(),
  },
} satisfies MappingsDefinition;

export type StoredMemoryPage = GetFieldsOf<typeof memoriesMappings>;

export const memoriesDataStream: DataStreamDefinition<typeof memoriesMappings, StoredMemoryPage> = {
  name: MEMORIES_DATA_STREAM,
  version: 2,
  hidden: true,
  template: {
    priority: 500,
    lifecycle: { data_retention: '90d' },
    mappings: memoriesMappings,
  },
};
