/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Lightweight `@kbn/entity-store/common` barrel (webpack `common` entry).
 * Keeps page-load size small: no euid / streamlang here — use `euid_helpers` or `loadEuidApi()`.
 *
 * @example
 * import { euid, type EntityType } from '@kbn/entity-store/common/euid_helpers';
 * Public API for the entity_store plugin.
 * Exports only constants and types needed on every load (including browser).
 * For EUID translation helpers (DSL/ESQL/Painless, entity types), use common/euid_helpers.
 */

import { z } from '@kbn/zod/v4';

export const PLUGIN_ID = 'entityStore';
export const PLUGIN_NAME = 'Entity Store';

export const FF_ENABLE_ENTITY_STORE_V2 = 'securitySolution:entityStoreEnableV2';

export type EntityStoreStatus = z.infer<typeof EntityStoreStatus>;
export const EntityStoreStatus = z.enum([
  'not_installed',
  'installing',
  'running',
  'stopped',
  'error',
]);

export const API_VERSIONS = {
  public: {
    v1: '2023-10-31',
  },
  internal: {
    v2: '2',
  },
} as const;

const PUBLIC_BASE_ROUTE = '/api/security/entity_store';
const INTERNAL_BASE_ROUTE = '/internal/security/entity_store';

export const ENTITY_STORE_ROUTES = {
  public: {
    INSTALL: `${PUBLIC_BASE_ROUTE}/install`,
    UPDATE: PUBLIC_BASE_ROUTE,
    UNINSTALL: `${PUBLIC_BASE_ROUTE}/uninstall`,
    STATUS: `${PUBLIC_BASE_ROUTE}/status`,
    START: `${PUBLIC_BASE_ROUTE}/start`,
    STOP: `${PUBLIC_BASE_ROUTE}/stop`,
    CRUD_CREATE: `${PUBLIC_BASE_ROUTE}/entities/{entityType}`,
    CRUD_UPDATE: `${PUBLIC_BASE_ROUTE}/entities/{entityType}`,
    CRUD_BULK_UPDATE: `${PUBLIC_BASE_ROUTE}/entities/bulk`,
    CRUD_GET: `${PUBLIC_BASE_ROUTE}/entities`,
    CRUD_DELETE: `${PUBLIC_BASE_ROUTE}/entities/`,
    RESOLUTION_LINK: `${PUBLIC_BASE_ROUTE}/resolution/link`,
    RESOLUTION_UNLINK: `${PUBLIC_BASE_ROUTE}/resolution/unlink`,
    RESOLUTION_GROUP: `${PUBLIC_BASE_ROUTE}/resolution/group`,
  },
  internal: {
    CHECK_PRIVILEGES: `${INTERNAL_BASE_ROUTE}/check_privileges`,
    FORCE_LOG_EXTRACTION: `${INTERNAL_BASE_ROUTE}/{entityType}/force_log_extraction`,
    FORCE_REMOTE_EXTRACT_TO_UPDATES: `${INTERNAL_BASE_ROUTE}/{entityType}/force_remote_extract_to_updates`,
    FORCE_HISTORY_SNAPSHOT: `${INTERNAL_BASE_ROUTE}/force_history_snapshot`,
    ENTITY_MAINTAINERS_START: `${INTERNAL_BASE_ROUTE}/entity_maintainers/start/{id}`,
    ENTITY_MAINTAINERS_STOP: `${INTERNAL_BASE_ROUTE}/entity_maintainers/stop/{id}`,
    ENTITY_MAINTAINERS_RUN: `${INTERNAL_BASE_ROUTE}/entity_maintainers/run/{id}`,
    ENTITY_MAINTAINERS_GET: `${INTERNAL_BASE_ROUTE}/entity_maintainers`,
    ENTITY_MAINTAINERS_INIT: `${INTERNAL_BASE_ROUTE}/entity_maintainers/init`,
  },
} as const satisfies Record<string, Record<string, string>>;

export {
  EntityMaintainerTaskStatus,
  EntityMaintainerResponseItem,
  GetEntityMaintainersResponse,
} from './entity_maintainers';

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
};

// Entity types (slim definitions; for EUID translation use common/euid_helpers)
export type EntityType = z.infer<typeof EntityType>;
export const EntityType = z.enum(['user', 'host', 'service', 'generic']);

export const ALL_ENTITY_TYPES = Object.values(EntityType.enum);

export type { Entity } from './domain/definitions/entity.gen';

export interface IdentitySourceFields {
  /** Fields that participate in identity (EUID composition). */
  requiresOneOf: string[];
  /** All field names used in EUID composition, deduplicated. */
  identitySourceFields: string[];
}

export type { NonEcsTimelineDataRow } from './domain/euid/non_ecs_timeline_data';
export type { AssetCriticalityLevel } from './domain/definitions/entity.gen';

export {
  ENTITY_LATEST,
  ENTITY_UPDATES,
  ENTITY_HISTORY,
  ENTITY_BASE_PREFIX,
  ENTITY_SCHEMA_VERSION_V2,
  MAPPING_VERSION,
  getEntityIndexPattern,
  getEntitiesAlias,
  getLatestEntitiesIndexName,
  getLatestEntityIndexPattern,
} from './domain/entity_index';
