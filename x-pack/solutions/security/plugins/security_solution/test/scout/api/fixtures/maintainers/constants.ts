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
  ENTITY_STORE_ROUTES as COMMON_ROUTES,
} from '@kbn/entity-store/common';

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

// Strip the leading '/' from common route strings — Scout's apiClient.post/get
// prepends the Kibana base URL, so paths must not start with '/'.
const r = (route: string) => route.replace(/^\//, '');

// Dynamic routes: substitute the OpenAPI {param} placeholder with a real value.
const withId = (route: string, id: string) => r(route.replace('{id}', id));
const withEntityType = (route: string, entityType: string) =>
  r(route.replace('{entityType}', entityType));

export const ENTITY_STORE_ROUTES = {
  public: {
    INSTALL: r(COMMON_ROUTES.public.INSTALL),
    UPDATE: r(COMMON_ROUTES.public.UPDATE),
    STATUS: r(COMMON_ROUTES.public.STATUS),
    START: r(COMMON_ROUTES.public.START),
    STOP: r(COMMON_ROUTES.public.STOP),
    UNINSTALL: r(COMMON_ROUTES.public.UNINSTALL),
    CRUD_CREATE: (entityType: string) =>
      withEntityType(COMMON_ROUTES.public.CRUD_CREATE, entityType),
    CRUD_UPDATE: (entityType: string) =>
      withEntityType(COMMON_ROUTES.public.CRUD_UPDATE, entityType),
    CRUD_BULK_UPDATE: r(COMMON_ROUTES.public.CRUD_BULK_UPDATE),
    CRUD_GET: r(COMMON_ROUTES.public.CRUD_GET),
    CRUD_DELETE: r(COMMON_ROUTES.public.CRUD_DELETE),
    RESOLUTION_LINK: r(COMMON_ROUTES.public.RESOLUTION_LINK),
    RESOLUTION_UNLINK: r(COMMON_ROUTES.public.RESOLUTION_UNLINK),
    RESOLUTION_GROUP: r(COMMON_ROUTES.public.RESOLUTION_GROUP),
  },
  internal: {
    CHECK_PRIVILEGES: r(COMMON_ROUTES.internal.CHECK_PRIVILEGES),
    FORCE_LOG_EXTRACTION: (entityType: string) =>
      withEntityType(COMMON_ROUTES.internal.FORCE_LOG_EXTRACTION, entityType),
    FORCE_CCS_EXTRACT_TO_UPDATES: (entityType: string) =>
      withEntityType(COMMON_ROUTES.internal.FORCE_REMOTE_EXTRACT_TO_UPDATES, entityType),
    FORCE_HISTORY_SNAPSHOT: r(COMMON_ROUTES.internal.FORCE_HISTORY_SNAPSHOT),
    ENTITY_MAINTAINERS_INIT: r(COMMON_ROUTES.internal.ENTITY_MAINTAINERS_INIT),
    ENTITY_MAINTAINERS_GET: r(COMMON_ROUTES.internal.ENTITY_MAINTAINERS_GET),
    ENTITY_MAINTAINERS_START: (id: string) =>
      withId(COMMON_ROUTES.internal.ENTITY_MAINTAINERS_START, id),
    ENTITY_MAINTAINERS_STOP: (id: string) =>
      withId(COMMON_ROUTES.internal.ENTITY_MAINTAINERS_STOP, id),
    ENTITY_MAINTAINERS_RUN: (id: string) =>
      withId(COMMON_ROUTES.internal.ENTITY_MAINTAINERS_RUN, id),
  },
};

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
