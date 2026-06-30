/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { metaFields } from '@kbn/config-schema';
import { cloneDeep, isEqual } from 'lodash';
import type { OpenAPIV3 } from 'openapi-types';

const ISSUE_URL = 'https://github.com/elastic/kibana/issues/271809';

const TRANSIENT_SCHEMA_KEYS = new Set<string>([
  metaFields.META_FIELD_X_OAS_OPTIONAL,
  metaFields.META_FIELD_X_OAS_DISCRIMINATOR,
  metaFields.META_FIELD_X_OAS_DISCRIMINATOR_DEFAULT_CASE,
]);

const normalizeProcessedDiscriminator = (schema: Record<string, unknown>): void => {
  if ('discriminator' in schema && Array.isArray(schema.oneOf) && !('anyOf' in schema)) {
    schema.anyOf = schema.oneOf;
    delete schema.oneOf;
    delete schema.discriminator;
  }
};

const removeTransientSchemaKeys = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(removeTransientSchemaKeys);
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  const record = value as Record<string, unknown>;
  normalizeProcessedDiscriminator(record);
  TRANSIENT_SCHEMA_KEYS.forEach((key) => delete record[key]);
  Object.values(record).forEach(removeTransientSchemaKeys);
};

/**
 * Shared schemas can be mutated by OAS post-processing before they are compared
 * against later registrations. Ignore transient generator annotations so collision
 * detection only sees the public schema shape.
 */
export const normalizeSchemaForCollision = (
  schema: OpenAPIV3.SchemaObject
): OpenAPIV3.SchemaObject => {
  const normalized = cloneDeep(schema);
  removeTransientSchemaKeys(normalized);
  return normalized;
};

export const schemasMatch = (
  previous: OpenAPIV3.SchemaObject,
  next: OpenAPIV3.SchemaObject
): boolean => {
  return isEqual(normalizeSchemaForCollision(previous), normalizeSchemaForCollision(next));
};

const propertyNames = (schema: OpenAPIV3.SchemaObject): string[] => {
  return schema.properties ? Object.keys(schema.properties).sort() : [];
};

const sortedDifference = (a: readonly string[], b: readonly string[]): string[] => {
  const bSet = new Set(b);
  return a.filter((key) => !bSet.has(key));
};

const formatKeyList = (keys: readonly string[]): string => {
  if (keys.length === 0) return '(none)';
  return keys.map((key) => `\`${key}\``).join(', ');
};

/**
 * Build the human-readable diagnostic for a shared-schema id collision.
 *
 * Two shapes are considered colliding when they share an id but differ
 * in any way (deep-equal mismatch). The diagnostic lists property-key
 * differences first because that is the dominant failure mode driven by
 * `Base.extends({...})` patterns inheriting `meta.id` from the base.
 */
export const describeSchemaCollision = (
  id: string,
  previous: OpenAPIV3.SchemaObject,
  next: OpenAPIV3.SchemaObject
): string => {
  const previousKeys = propertyNames(previous);
  const nextKeys = propertyNames(next);
  const onlyInPrevious = sortedDifference(previousKeys, nextKeys);
  const onlyInNext = sortedDifference(nextKeys, previousKeys);

  const lines = [
    `OAS shared schema collision for id "${id}": the same id was registered with two different shapes.`,
  ];

  if (onlyInPrevious.length > 0 || onlyInNext.length > 0) {
    lines.push(
      `  properties only in the first registration: ${formatKeyList(onlyInPrevious)}`,
      `  properties only in the second registration: ${formatKeyList(onlyInNext)}`
    );
  } else {
    lines.push('  property key sets match; the shapes differ in property definitions or metadata.');
  }

  lines.push(
    'This usually means a `Base.extends({...})` call inherited `meta.id` from its base, ' +
      'or two unrelated schemas accidentally chose the same id string. ' +
      "Pass `{ meta: { id: 'distinct_id' } }` as the second argument to `extends()` " +
      `to give the derived schema its own component name. See ${ISSUE_URL}.`
  );

  return lines.join('\n');
};

/**
 * Thrown by the OAS converter when a shared schema id is registered with two
 * different shapes within a single generation pass.
 */
export class OasSchemaCollisionError extends Error {
  public readonly schemaId: string;
  constructor(message: string, schemaId: string) {
    super(message);
    this.name = 'OasSchemaCollisionError';
    this.schemaId = schemaId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
