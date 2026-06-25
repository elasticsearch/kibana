/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { metaFields } from '@kbn/config-schema';
import type { OpenAPIV3 } from 'openapi-types';
import { getXState } from '../../../../util';
import type { IContext } from '../context';

export const stripBadDefault = (schema: OpenAPIV3.SchemaObject): void => {
  if (schema.default?.special === 'deep') {
    if (Object.keys(schema.default).length === 1) {
      delete schema.default;
    } else {
      delete schema.default.special;
    }
  }
  if (typeof schema.default === 'function') {
    const defaultValue = schema.default();
    if (defaultValue === undefined) {
      delete schema.default;
    } else {
      schema.default = defaultValue;
    }
  }
};

export const processDeprecated = (schema: OpenAPIV3.SchemaObject): void => {
  if (metaFields.META_FIELD_X_OAS_DEPRECATED in schema) {
    schema.deprecated = true;
    deleteField(schema, metaFields.META_FIELD_X_OAS_DEPRECATED);
  }
};

export const processDiscontinued = (schema: OpenAPIV3.SchemaObject): void => {
  if (metaFields.META_FIELD_X_OAS_DISCONTINUED in schema) {
    schema['x-discontinued'] = schema[metaFields.META_FIELD_X_OAS_DISCONTINUED] as string;
    deleteField(schema, metaFields.META_FIELD_X_OAS_DISCONTINUED);
  }
};

export const processAvailability = (ctx: IContext, schema: OpenAPIV3.SchemaObject): void => {
  if (metaFields.META_FIELD_X_OAS_AVAILABILITY in schema) {
    const state = getXState(
      schema[metaFields.META_FIELD_X_OAS_AVAILABILITY] as {
        stability?: 'experimental' | 'stable' | 'tech_preview';
        since?: string;
      },
      ctx.getEnv()
    );

    if (state !== undefined) {
      (schema as OpenAPIV3.SchemaObject & { 'x-state'?: string })['x-state'] = state;
    }

    deleteField(schema, metaFields.META_FIELD_X_OAS_AVAILABILITY);
  }
};

/** Just for type convenience */
export const deleteField = (schema: object, field: string): void => {
  delete (schema as Record<string, unknown>)[field];
};

export const isAnyType = (schema: OpenAPIV3.SchemaObject): boolean => {
  return metaFields.META_FIELD_X_OAS_ANY in schema;
};

/** OAS 3.0 requires `null` to appear in `enum` when `nullable: true`. */
export const ensureNullableEnumIncludesNull = (schema: OpenAPIV3.SchemaObject): void => {
  if (schema.nullable !== true || !schema.enum?.length || schema.enum.includes(null)) {
    return;
  }

  schema.enum.push(null);
};

/** Assumes ref is in the form of "#/components/schemas/my-schema-my-team" */
export const getIdFromRefString = (ref: string): string => {
  return ref.split('/').pop()!;
};
