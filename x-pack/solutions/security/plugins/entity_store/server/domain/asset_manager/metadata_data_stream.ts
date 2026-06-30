/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getEntityIndexPattern,
  ENTITY_SCHEMA_VERSION_V2,
  ENTITY_METADATA,
} from '../../../common/domain/entity_index';

export const getMetadataEntitiesDataStreamName = (namespace: string) =>
  getEntityIndexPattern({
    schemaVersion: ENTITY_SCHEMA_VERSION_V2,
    dataset: ENTITY_METADATA,
    namespace,
  });
