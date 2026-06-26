/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildGenericEntityFlyoutPreviewQuery } from '@kbn/cloud-security-posture-common';
import type { UseCspOptions } from '@kbn/cloud-security-posture-common/types/findings';
import type { EntityStoreEuidApi, EntityType } from '@kbn/entity-store/public';

/**
 * Picks host / user / service / generic from flattened identity field keys for CSP/EUID queries.
 */
export const inferEntityTypeFromIdentityFields = (
  fields: Record<string, string | undefined>
): EntityType => {
  for (const key of Object.keys(fields)) {
    if (key.startsWith('user.')) {
      return 'user';
    }
    if (key.startsWith('host.')) {
      return 'host';
    }
    if (key.startsWith('service.')) {
      return 'service';
    }
  }
  return 'generic';
};

const disabledCspPreviewOptions: UseCspOptions = {
  query: { bool: { filter: [] } },
  sort: [],
  enabled: false,
  pageSize: 1,
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readFlatString = (doc: unknown, field: string): string | undefined => {
  if (!isPlainObject(doc)) {
    return undefined;
  }
  const v = doc[field];
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
};

const readNestedString = (
  doc: unknown,
  parentKey: string,
  childKey: string
): string | undefined => {
  if (!isPlainObject(doc)) {
    return undefined;
  }
  const parent = doc[parentKey];
  if (!isPlainObject(parent)) {
    return undefined;
  }
  const v = parent[childKey];
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
};

const legacyFieldAndValue = (
  entityType: EntityType,
  doc: unknown
): { field: string; value: string } | undefined => {
  if (entityType === 'user') {
    const value = readFlatString(doc, 'user.name') ?? readNestedString(doc, 'user', 'name');
    return value !== undefined ? { field: 'user.name', value } : undefined;
  }
  if (entityType === 'host') {
    const value = readFlatString(doc, 'host.name') ?? readNestedString(doc, 'host', 'name');
    return value !== undefined ? { field: 'host.name', value } : undefined;
  }
  if (entityType === 'service') {
    const value = readFlatString(doc, 'service.name') ?? readNestedString(doc, 'service', 'name');
    return value !== undefined ? { field: 'service.name', value } : undefined;
  }
  const userName = readFlatString(doc, 'user.name') ?? readNestedString(doc, 'user', 'name');
  if (userName !== undefined) {
    return { field: 'user.name', value: userName };
  }
  const hostName = readFlatString(doc, 'host.name') ?? readNestedString(doc, 'host', 'name');
  if (hostName !== undefined) {
    return { field: 'host.name', value: hostName };
  }
  return undefined;
};

export interface BuildEuidCspPreviewOptionsContext {
  /**
   * ECS-style identity used when the primary document is missing or insufficient
   * (e.g. `host.name` / `user.name` from the panel when the entity store record is absent).
   */
  legacyIdentityFields?: Record<string, string | undefined>;
}

/**
 * Builds {@link UseCspOptions} for CSP preview hooks from entity-store EUID filters when the
 * document yields an EUID filter; otherwise falls back to term filters on `user.name` /
 * `host.name` (and `service.name` for service entities).
 */
export const buildEuidCspPreviewOptions = (
  entityType: EntityType,
  identityDocument: unknown,
  euidApi: EntityStoreEuidApi | null,
  context: BuildEuidCspPreviewOptionsContext = {}
): UseCspOptions => {
  const { legacyIdentityFields } = context;

  if (euidApi?.euid) {
    const euidEntityFilter = euidApi.euid.dsl.getEuidFilterBasedOnDocument(
      entityType,
      identityDocument
    );
    if (euidEntityFilter != null) {
      return {
        query: { bool: { filter: [euidEntityFilter] } },
        sort: [],
        enabled: true,
        pageSize: 1,
      };
    }
  }

  const fromDocument = legacyFieldAndValue(entityType, identityDocument);
  if (fromDocument) {
    return {
      query: buildGenericEntityFlyoutPreviewQuery(fromDocument.field, fromDocument.value),
      sort: [],
      enabled: true,
      pageSize: 1,
    };
  }
  if (legacyIdentityFields) {
    const fromLegacy = legacyFieldAndValue(entityType, legacyIdentityFields);
    if (fromLegacy) {
      return {
        query: buildGenericEntityFlyoutPreviewQuery(fromLegacy.field, fromLegacy.value),
        sort: [],
        enabled: true,
        pageSize: 1,
      };
    }
  }

  return disabledCspPreviewOptions;
};
