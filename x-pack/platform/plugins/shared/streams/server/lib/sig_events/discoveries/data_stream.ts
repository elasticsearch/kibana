/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataStreamDefinition } from '@kbn/data-streams';
import type { Discovery } from '@kbn/streams-schema';
import type { GetFieldsOf, MappingsDefinition } from '@kbn/es-mappings';
import { mappings } from '@kbn/es-mappings';

export const DISCOVERIES_DATA_STREAM = '.significant_events-discoveries';

export const discoveriesMappings = {
  dynamic: false,
  properties: {
    '@timestamp': mappings.date({ format: 'strict_date_optional_time' }),
    kind: mappings.keyword(),
    discovery_id: mappings.keyword(),
    discovery_slug: mappings.keyword(),
    parent_discovery_id: mappings.keyword(),
    event_id: mappings.keyword(),
    grouped_discovery_ids: mappings.keyword(),
    criticality: mappings.integer(),
    closed_by_execution_id: mappings.keyword(),
    detections: mappings.object({
      properties: {
        rule_uuid: { type: 'keyword' as const },
      },
    }),
  },
} satisfies MappingsDefinition;

export type StoredDiscovery = GetFieldsOf<typeof discoveriesMappings>;
export type { Discovery };

export const discoveriesDataStream: DataStreamDefinition<
  typeof discoveriesMappings,
  StoredDiscovery
> = {
  name: DISCOVERIES_DATA_STREAM,
  version: 4,
  hidden: true,
  template: {
    priority: 500,
    lifecycle: { data_retention: '90d' },
    mappings: discoveriesMappings,
  },
};
