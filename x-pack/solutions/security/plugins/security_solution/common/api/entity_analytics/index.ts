/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export * from './asset_criticality';
export * from './risk_engine';
export * from './monitoring';
export * from './watchlists';
export * from './anomaly_summary';
export type { EntityAnalyticsPrivileges } from './common';

// Entity Store v1 schemas were removed; types now come from @kbn/entity-store/common
// (the v2 API contract) and from local entity-analytics types where the shape is
// security_solution-specific. Re-exported here for backwards-compatible barrel imports.
export type {
  Entity,
  HostEntity,
  UserEntity,
  ServiceEntity,
  GenericEntity,
  EntityField,
  EngineMetadata,
  Asset,
  EngineStatus,
  EngineDescriptor,
  EngineComponentResource,
  EngineComponentStatus,
  GetEntityStoreStatusResponse,
  InitEntityStoreResponse,
  InspectQuery,
  ListEntitiesResponse,
} from '@kbn/entity-store/common';
export { EntityType } from '@kbn/entity-store/common';

export type {
  ListEntitiesRequestQuery,
  StartEntityEngineResponse,
  StopEntityEngineResponse,
  StoreStatus,
} from '../../entity_analytics/entity_store/types';
export {
  EngineComponentResourceEnum,
  EngineStatusEnum,
  StoreStatusEnum,
} from '../../entity_analytics/entity_store/types';
