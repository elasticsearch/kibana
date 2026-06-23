/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-security';
import {
  ENTITY_LATEST,
  ENTITY_UPDATES,
  ENTITY_HISTORY,
  getEntitiesAlias,
  getLatestEntitiesIndexName,
  getEntityIndexPattern,
  ENTITY_SCHEMA_VERSION_V2,
} from '../../../../common/domain/entity_index';

const BASE_HEADERS = {
  'kbn-xsrf': 'some-xsrf-token',
  'x-elastic-internal-origin': 'kibana',
  'Content-Type': 'application/json;charset=UTF-8',
};

export const PUBLIC_HEADERS = {
  ...BASE_HEADERS,
  'elastic-api-version': '2023-10-31',
};

export const INTERNAL_HEADERS = {
  ...BASE_HEADERS,
  'elastic-api-version': '2',
};

const PUBLIC_BASE = 'api/security/entity_store';
const INTERNAL_BASE = 'internal/security/entity_store';

/**
 * Entity Store API routes
 */
export const ENTITY_STORE_ROUTES = {
  public: {
    INSTALL: `${PUBLIC_BASE}/install`,
    UPDATE: PUBLIC_BASE,
    STATUS: `${PUBLIC_BASE}/status`,
    START: `${PUBLIC_BASE}/start`,
    STOP: `${PUBLIC_BASE}/stop`,
    UNINSTALL: `${PUBLIC_BASE}/uninstall`,
    CRUD_CREATE: (entityType: string) => `${PUBLIC_BASE}/entities/${entityType}`,
    CRUD_UPDATE: (entityType: string) => `${PUBLIC_BASE}/entities/${entityType}`,
    CRUD_BULK_UPDATE: `${PUBLIC_BASE}/entities/bulk`,
    CRUD_GET: `${PUBLIC_BASE}/entities`,
    CRUD_DELETE: `${PUBLIC_BASE}/entities/`,
    RESOLUTION_LINK: `${PUBLIC_BASE}/resolution/link`,
    RESOLUTION_UNLINK: `${PUBLIC_BASE}/resolution/unlink`,
    RESOLUTION_GROUP: `${PUBLIC_BASE}/resolution/group`,
  },
  internal: {
    CHECK_PRIVILEGES: `${INTERNAL_BASE}/check_privileges`,
    FORCE_LOG_EXTRACTION: (entityType: string) =>
      `${INTERNAL_BASE}/${entityType}/force_log_extraction`,
    FORCE_REMOTE_EXTRACT_TO_UPDATES: (entityType: string) =>
      `${INTERNAL_BASE}/${entityType}/force_remote_extract_to_updates`,
    FORCE_HISTORY_SNAPSHOT: `${INTERNAL_BASE}/force_history_snapshot`,
    ENTITY_MAINTAINERS_INIT: `${INTERNAL_BASE}/entity_maintainers/init`,
    ENTITY_MAINTAINERS_GET: `${INTERNAL_BASE}/entity_maintainers`,
    ENTITY_MAINTAINERS_START: (id: string) => `${INTERNAL_BASE}/entity_maintainers/start/${id}`,
    ENTITY_MAINTAINERS_STOP: (id: string) => `${INTERNAL_BASE}/entity_maintainers/stop/${id}`,
    ENTITY_MAINTAINERS_RUN: (id: string) => `${INTERNAL_BASE}/entity_maintainers/run/${id}`,
  },
} as const;

export const ENTITY_STORE_TAGS = [...tags.stateful.classic, ...tags.serverless.security.complete];

export const UPDATES_INDEX = getEntityIndexPattern({
  schemaVersion: ENTITY_SCHEMA_VERSION_V2,
  dataset: ENTITY_UPDATES,
  namespace: 'default',
});
export const LATEST_ALIAS = getEntitiesAlias(ENTITY_LATEST, 'default');
export const LATEST_INDEX = getLatestEntitiesIndexName('default');
export const HISTORY_INDEX_PATTERN = `${getEntityIndexPattern({
  schemaVersion: ENTITY_SCHEMA_VERSION_V2,
  dataset: ENTITY_HISTORY,
  namespace: 'default',
})}*`;
