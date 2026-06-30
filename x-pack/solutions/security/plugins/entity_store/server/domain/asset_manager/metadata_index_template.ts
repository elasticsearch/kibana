/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IndicesPutIndexTemplateRequest } from '@elastic/elasticsearch/lib/api/types';
import { ECS_MAPPINGS_COMPONENT_TEMPLATE } from '../constants';
import {
  ENTITY_METADATA,
  ENTITY_BASE_PREFIX,
  ENTITY_SCHEMA_VERSION_V2,
  MAPPING_VERSION,
  getEntityIndexPattern,
  getEntitiesAlias,
} from '../../../common/domain/entity_index';
import { getMetadataComponentTemplateName } from './metadata_component_templates';
import { getMetadataIndexIngestPipelineId } from './metadata_index_ingest_pipeline';

const DATA_RETENTION_PERIOD = '365d';

export const getMetadataIndexTemplateId = (namespace: string) =>
  `.${ENTITY_BASE_PREFIX}_${ENTITY_SCHEMA_VERSION_V2}_${ENTITY_METADATA}_security_${namespace}_index_template` as const;

export const getMetadataEntityIndexTemplateConfig = (
  namespace: string
): IndicesPutIndexTemplateRequest => ({
  name: getMetadataIndexTemplateId(namespace),
  _meta: {
    description:
      'Index template for the entity metadata data stream. ' +
      'Stores metadata documents emitted by entity maintainers (relationships, behaviors).',
    ecs_version: '9.2.0',
    managed: true,
    managed_by: 'security_context_core_analysis',
  },
  composed_of: [ECS_MAPPINGS_COMPONENT_TEMPLATE, getMetadataComponentTemplateName(namespace)],
  index_patterns: [
    getEntityIndexPattern({
      schemaVersion: ENTITY_SCHEMA_VERSION_V2,
      dataset: ENTITY_METADATA,
      namespace,
    }),
  ],
  priority: 200,
  data_stream: {},
  template: {
    lifecycle: {
      data_retention: DATA_RETENTION_PERIOD,
    },
    aliases: {
      [getEntitiesAlias(ENTITY_METADATA, namespace)]: {},
    },
    mappings: {
      _meta: { mappingsVersion: MAPPING_VERSION },
      date_detection: false,
    },
    settings: {
      index: {
        codec: 'best_compression',
        default_pipeline: getMetadataIndexIngestPipelineId(namespace),
        mapping: { total_fields: { limit: 2000 } },
      },
    },
  },
});
