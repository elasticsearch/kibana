/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import joi from 'joi';
import type { Type } from '@kbn/config-schema';
import { isConfigSchema } from '@kbn/config-schema';
import { get } from 'lodash';
import type { OpenAPIV3 } from 'openapi-types';
import type { ConvertOptions, KnownParameters } from '../../type';
import { isReferenceObject } from '../common';
import { collapseArrayUnion } from '../collapse_array_union';
import { parse } from './parse';

import type { IContext } from './post_process_mutations';
import { createCtx } from './post_process_mutations';

const isObjectType = (schema: joi.Schema | joi.Description): boolean => {
  return schema.type === 'object';
};

const isRecordType = (schema: joi.Schema | joi.Description): boolean => {
  return schema.type === 'record';
};

// See the `schema.nullable` type in @kbn/config-schema
export const isNullableObjectType = (schema: joi.Schema | joi.Description): boolean => {
  if (schema.type === 'alternatives') {
    const { matches } = joi.isSchema(schema) ? schema.describe() : schema;
    return (
      matches.length === 2 &&
      matches.every(
        (match: { schema: joi.Description }) =>
          match.schema.type === 'object' ||
          (match.schema.type === 'any' &&
            get(match, 'schema.flags.only') === true &&
            get(match, 'schema.allow')?.length === 1 &&
            get(match, 'schema.allow.0') === null)
      )
    );
  }
  return false;
};

const isEmptyObjectAllowsUnknowns = (schema: joi.Description) => {
  return (
    isObjectType(schema) &&
    Object.keys(schema.keys).length === 0 &&
    get(schema, 'flags.unknown') === true
  );
};

const createError = (message: string) => {
  return new Error(`[@kbn/config-schema converter] ${message}`);
};

function assertInstanceOfKbnConfigSchema(schema: unknown): asserts schema is Type<any> {
  if (!is(schema)) {
    throw createError('Expected schema to be an instance of @kbn/config-schema');
  }
}

export const unwrapKbnConfigSchema = (schema: unknown): joi.Schema => {
  assertInstanceOfKbnConfigSchema(schema);
  return schema.getSchema();
};

export const convert = (
  kbnConfigSchema: unknown,
  { sharedSchemas, env, onCollision }: ConvertOptions = {}
) => {
  const schema = unwrapKbnConfigSchema(kbnConfigSchema);
  const { result, shared } = parse({
    schema,
    ctx: createCtx({ sharedSchemas, env, onCollision }),
  });
  return { schema: result, shared };
};

export const getParamSchema = (knownParameters: KnownParameters, schemaKey: string) => {
  return (
    knownParameters[schemaKey] ??
    // Handle special path parameters
    knownParameters[schemaKey + '*'] ??
    knownParameters[schemaKey + '?*']
  );
};

const convertObjectMembersToParameterObjects = (
  ctx: IContext,
  schema: joi.Schema,
  knownParameters: KnownParameters = {},
  isPathParameter = false
) => {
  let properties: OpenAPIV3.SchemaObject['properties'];
  const required = new Map<string, boolean>();
  if (isNullableObjectType(schema)) {
    const { result } = parse({ schema, ctx });
    if (result.anyOf) {
      properties = result.anyOf.find(
        (s): s is OpenAPIV3.SchemaObject => !isReferenceObject(s) && s.type === 'object'
      )?.properties;
    } else if (result.type === 'object') {
      properties = result.properties;
    }
  } else if (isObjectType(schema)) {
    const { result } = parse({ schema, ctx });
    if ('$ref' in result)
      throw new Error(
        `Found a reference to "${result.$ref}". Runtime types with IDs are not supported in path or query parameters.`
      );
    properties = (result as OpenAPIV3.SchemaObject).properties!;
    (result.required ?? []).forEach((key) => required.set(key, true));
  } else if (isRecordType(schema)) {
    return [];
  } else {
    throw createError(`Expected record, object or nullable object type, but got '${schema.type}'`);
  }

  if (!properties) {
    throw createError(`Could not extract properties from ${schema.describe()}`);
  }

  return Object.entries(properties).map(([schemaKey, schemaObject]) => {
    const paramSchema = getParamSchema(knownParameters, schemaKey);
    if (!paramSchema && isPathParameter) {
      throw createError(`Unknown parameter: ${schemaKey}, are you sure this is in your path?`);
    }
    const isSubSchemaRequired = required.has(schemaKey);
    let description: undefined | string;
    let finalSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;
    if (!isReferenceObject(schemaObject)) {
      const { description: des, ...rest } = schemaObject;
      description = des;
      finalSchema = !isPathParameter ? collapseArrayUnion(rest) : rest;
    } else {
      finalSchema = schemaObject;
    }
    return {
      name: schemaKey,
      in: isPathParameter ? 'path' : 'query',
      required: isPathParameter || isSubSchemaRequired,
      schema: finalSchema,
      description,
    };
  });
};

export const convertQuery = (kbnConfigSchema: unknown) => {
  const schema = unwrapKbnConfigSchema(kbnConfigSchema);
  const ctx = createCtx();
  const result = convertObjectMembersToParameterObjects(ctx, schema, {}, false);
  return {
    query: result,
    shared: ctx.getSharedSchemas(),
  };
};

export const convertPathParameters = (
  kbnConfigSchema: unknown,
  knownParameters: { [paramName: string]: { optional: boolean } }
) => {
  const schema = unwrapKbnConfigSchema(kbnConfigSchema);
  if (!isObjectType(schema) && !isNullableObjectType(schema)) {
    throw createError('Input parser for path params expected to be an object schema');
  }
  const ctx = createCtx(); // For now context is not shared between body, params and queries
  const result = convertObjectMembersToParameterObjects(ctx, schema, knownParameters, true);
  return {
    params: result,
    shared: ctx.getSharedSchemas(),
  };
};

export const is = (schema: unknown): boolean => {
  if (isConfigSchema(schema)) {
    const description = schema.getSchema().describe();
    // We ignore "any" @kbn/config-schema for the purposes of OAS generation...
    if (
      (description.type === 'any' && !('allow' in description)) ||
      isEmptyObjectAllowsUnknowns(description)
    ) {
      return false;
    }
    return true;
  }
  return false;
};
