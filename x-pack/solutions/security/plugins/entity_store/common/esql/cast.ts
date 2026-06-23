/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityField } from '../domain/definitions/entity_schema';
import { hostEntityDefinition } from '../domain/definitions/host';
import { userEntityDefinition } from '../domain/definitions/user';
import { serviceEntityDefinition } from '../domain/definitions/service';
import { genericEntityDefinition } from '../domain/definitions/generic';

const TIMESTAMP_FIELD = '@timestamp';

/**
 * Map of source field name → declared mapping type, built once from all known entity definitions.
 * Fields absent from any definition (e.g. filter-only fields like event.kind) default to TO_STRING.
 * This is a static mapping in memory. It will be recalculated once this file is loaded.
 */
const fieldTypeMap: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const def of [
    hostEntityDefinition,
    userEntityDefinition,
    serviceEntityDefinition,
    genericEntityDefinition,
  ]) {
    for (const field of def.fields) {
      if (field.mapping?.type && !map.has(field.source)) {
        map.set(field.source, field.mapping.type);
      }
    }
  }
  return map;
})();

/**
 * Returns the appropriate `TO_*(<fieldName>)` expression for the given mapping type.
 * Defaults to `TO_STRING` when no type is provided or the type is unrecognised.
 */
export function castFieldByType(fieldName: string, mappingType?: string): string {
  switch (mappingType) {
    case 'keyword':
    case 'text':
    case 'match_only_text':
    case 'wildcard':
      return `TO_STRING(${fieldName})`;
    case 'date':
      return `TO_DATETIME(${fieldName})`;
    case 'boolean':
      return `TO_BOOLEAN(${fieldName})`;
    case 'long':
      return `TO_LONG(${fieldName})`;
    case 'integer':
    case 'short':
    case 'byte':
      return `TO_INTEGER(${fieldName})`;
    case 'float':
    case 'double':
    case 'half_float':
      return `TO_DOUBLE(${fieldName})`;
    case 'ip':
      return `TO_IP(${fieldName})`;
    case 'scaled_float':
      return fieldName;
    default:
      return `TO_STRING(${fieldName})`;
  }
}

/**
 * Casts a field name to its declared type using the singleton registry built from all entity
 * definitions. Fields not present in any definition default to `TO_STRING`.
 * `@timestamp` is always returned raw.
 */
export function castField(fieldName: string): string {
  if (fieldName === TIMESTAMP_FIELD) {
    return fieldName;
  }
  return castFieldByType(fieldName, fieldTypeMap.get(fieldName));
}

/** Casts a field to its declared type — used by the STATS aggregation stage. */
export function castEntityField(field: EntityField): string {
  return castFieldByType(field.source, field.mapping?.type);
}
