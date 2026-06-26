/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EntityStoreStatus, type EntityType } from '@kbn/entity-store/common';

// Snake-cased query for the v2 GET /entities route. Matches the on-the-wire shape.
// Callers consume `FetchEntitiesListParams` (camelCase) defined in `public/entity_analytics/api/api.ts`.
export interface ListEntitiesRequestQuery {
  sort_field?: string;
  sort_order?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
  filterQuery?: string;
  entity_types: EntityType[];
}

export interface StartEntityEngineResponse {
  started: boolean;
}

export interface StopEntityEngineResponse {
  stopped: boolean;
}

// Alias matching the legacy `StoreStatus` name historically exported by entity_store v1 schemas.
// The shape is identical to `@kbn/entity-store/common`'s `EntityStoreStatus`.
export type StoreStatus = EntityStoreStatus;
export const StoreStatusEnum = EntityStoreStatus.enum;
export type StoreStatusEnum = typeof EntityStoreStatus.enum;

export const EngineStatusEnum = {
  installing: 'installing',
  started: 'started',
  stopped: 'stopped',
  updating: 'updating',
  error: 'error',
} as const;
export type EngineStatusEnum = typeof EngineStatusEnum;

export const EngineComponentResourceEnum = {
  entity_engine: 'entity_engine',
  entity_definition: 'entity_definition',
  index: 'index',
  data_stream: 'data_stream',
  component_template: 'component_template',
  index_template: 'index_template',
  ingest_pipeline: 'ingest_pipeline',
  enrich_policy: 'enrich_policy',
  task: 'task',
  transform: 'transform',
  ilm_policy: 'ilm_policy',
} as const;
export type EngineComponentResourceEnum = typeof EngineComponentResourceEnum;
