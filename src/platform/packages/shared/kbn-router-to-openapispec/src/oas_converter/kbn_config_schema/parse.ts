/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type Joi from 'joi';
import { metaFields } from '@kbn/config-schema';
import joiToJsonParse from 'joi-to-json';
import { omit } from 'lodash';
import type { OpenAPIV3 } from 'openapi-types';
import { isReferenceObject } from '../common';
import { createCtx, postProcessMutations } from './post_process_mutations';
import type { IContext } from './post_process_mutations';

interface ParseArgs {
  schema: Joi.Schema;
  ctx?: IContext;
}

export interface JoiToJsonReferenceObject extends OpenAPIV3.BaseSchemaObject {
  schemas: { [id: string]: OpenAPIV3.SchemaObject };
}

type ParseResult = OpenAPIV3.SchemaObject | JoiToJsonReferenceObject;

export const isJoiToJsonSpecialSchemas = (
  parseResult: ParseResult
): parseResult is JoiToJsonReferenceObject => {
  return 'schemas' in parseResult;
};

export const joi2JsonInternal = (schema: Joi.Schema) => {
  return joiToJsonParse(schema, 'open-api');
};

// Based on how default values manifest from config-schema
// having a default value as a function { defaultValue: () => undefined } means
// config schema will treat that as the default value, so we stick to that as the map
// for determining whether, at runtime, a given schema will default.
const hasRuntimeOptionalMetadata = (description: Joi.Description): boolean => {
  const defaultValue = (description.flags as { default?: unknown } | undefined)?.default;
  const hasDefaultValue =
    defaultValue !== undefined &&
    // see post_process_mutations/mutations/object.ts
    !(
      typeof defaultValue === 'object' &&
      defaultValue !== null &&
      (defaultValue as { special?: unknown }).special === 'deep' &&
      Object.keys(defaultValue).length === 1
    );

  return (
    hasDefaultValue ||
    Boolean(description.metas?.some((meta) => meta[metaFields.META_FIELD_X_OAS_OPTIONAL] === true))
  );
};

type Schema = OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;

const addInternalOptionalMarker = (schema: Schema): void => {
  Object.defineProperty(schema, metaFields.META_FIELD_X_OAS_OPTIONAL, {
    configurable: true,
    enumerable: false,
    value: true,
    writable: true,
  });
};

type DescriptionWithContainers = Joi.Description & {
  keys?: Record<string, Joi.Description>;
  matches?: Array<{
    schema?: Joi.Description;
    then?: Joi.Description;
    otherwise?: Joi.Description;
    switch?: Array<{ then?: Joi.Description; otherwise?: Joi.Description }>;
  }>;
  items?: Joi.Description[];
  rules?: Array<{ args?: { key?: Joi.Description; value?: Joi.Description } }>;
  whens?: Array<{ then?: Joi.Description; otherwise?: Joi.Description }>;
};

const arrayContainers = ['allOf', 'oneOf', 'anyOf'] as const;

const applyRuntimeMetadataToContainer = (
  descriptions: Joi.Description[],
  schemas: Schema[] | undefined
): void => {
  if (!schemas) {
    return;
  }

  descriptions.forEach((childDescription, index) => {
    const childSchema = schemas[index];
    if (childSchema) {
      applyPropertyRuntimeMetadata(childDescription, childSchema);
    }
  });
};

const isDescription = (
  description: Joi.Description | undefined
): description is Joi.Description => {
  return Boolean(description);
};

const getMatchDescriptions = (matches: DescriptionWithContainers['matches']): Joi.Description[] => {
  if (!matches) {
    return [];
  }

  return matches.flatMap((match) => {
    const descriptions = [
      match.schema,
      match.then,
      match.otherwise,
      ...(match.switch?.flatMap((switchCase) => [switchCase.then, switchCase.otherwise]) ?? []),
    ];

    return descriptions.filter(isDescription);
  });
};

const getWhenDescriptions = (whens: DescriptionWithContainers['whens']): Joi.Description[] => {
  if (!whens) {
    return [];
  }

  return whens.flatMap((when) => [when.then, when.otherwise].filter(isDescription));
};

const getRuleDescriptions = (rules: DescriptionWithContainers['rules']): Joi.Description[] => {
  return rules?.flatMap(({ args }) => [args?.key, args?.value].filter(isDescription)) ?? [];
};

const getChildDescriptions = (description: Joi.Description): Joi.Description[] => {
  const { keys, items, matches, rules, whens } = description as DescriptionWithContainers;

  return [
    ...Object.values(keys ?? {}),
    ...(items ?? []),
    ...getMatchDescriptions(matches),
    ...getRuleDescriptions(rules),
    ...getWhenDescriptions(whens),
  ];
};

const applyNullableDefault = (
  description: Joi.Description,
  openApiSchema: OpenAPIV3.SchemaObject
): void => {
  if (!openApiSchema.anyOf && !openApiSchema.oneOf) {
    return;
  }

  const defaultValue = (description.flags as { default?: unknown } | undefined)?.default;
  if (defaultValue === null) {
    openApiSchema.default = null;
  }
};

const applyPropertyRuntimeMetadata = (
  description: Joi.Description,
  openApiSchema: Schema
): void => {
  if (isReferenceObject(openApiSchema)) {
    if (hasRuntimeOptionalMetadata(description)) {
      addInternalOptionalMarker(openApiSchema);
    }
    return;
  }

  applyNullableDefault(description, openApiSchema);

  const { keys, items, matches, rules, whens } = description as DescriptionWithContainers;
  if (keys && openApiSchema.properties) {
    for (const [key, childDescription] of Object.entries(keys)) {
      const childSchema = openApiSchema.properties[key] as Schema | undefined;
      if (childSchema) {
        applyPropertyRuntimeMetadata(childDescription, childSchema);
      }
    }
  }

  if (items?.[0] && openApiSchema.type === 'array') {
    applyPropertyRuntimeMetadata(
      items[0],
      (openApiSchema as OpenAPIV3.ArraySchemaObject).items as Schema
    );
  }

  const matchDescriptions = getMatchDescriptions(matches);
  const whenDescriptions = getWhenDescriptions(whens);
  for (const arrayContainer of arrayContainers) {
    const childSchemas = openApiSchema[arrayContainer] as Schema[] | undefined;
    applyRuntimeMetadataToContainer(matchDescriptions, childSchemas);
    applyRuntimeMetadataToContainer(whenDescriptions, childSchemas);
  }

  if (!openApiSchema.oneOf && !openApiSchema.anyOf && !openApiSchema.allOf) {
    const [singleMatchDescription] = matchDescriptions;
    if (matchDescriptions.length === 1 && singleMatchDescription) {
      applyPropertyRuntimeMetadata(singleMatchDescription, openApiSchema);
    }
  }

  const additionalProperties = openApiSchema.additionalProperties;
  const valueDescription = rules?.find(({ args }) => args?.value)?.args?.value;
  if (valueDescription && additionalProperties && typeof additionalProperties === 'object') {
    applyPropertyRuntimeMetadata(valueDescription, additionalProperties as Schema);
  }
};

const applySharedSchemaRuntimeMetadata = (
  description: Joi.Description,
  sharedSchemas: Record<string, OpenAPIV3.SchemaObject>
): void => {
  const id = (description.flags as { id?: string } | undefined)?.id;
  if (id && sharedSchemas[id]) {
    applyPropertyRuntimeMetadata(description, sharedSchemas[id]);
  }

  getChildDescriptions(description).forEach((childDescription) => {
    applySharedSchemaRuntimeMetadata(childDescription, sharedSchemas);
  });
};

const removeInternalOptionalMarker = (
  schema: unknown,
  seenSchemas: WeakSet<object> = new WeakSet()
): void => {
  if (!schema || typeof schema !== 'object') {
    return;
  }

  if (seenSchemas.has(schema)) {
    return;
  }
  seenSchemas.add(schema);

  delete (schema as Record<string, unknown>)[metaFields.META_FIELD_X_OAS_OPTIONAL];
  Object.values(schema).forEach((value) => removeInternalOptionalMarker(value, seenSchemas));
};

export const parse = ({ schema, ctx = createCtx() }: ParseArgs) => {
  const parsed: ParseResult = joi2JsonInternal(schema);
  let result: OpenAPIV3.SchemaObject;
  if (isJoiToJsonSpecialSchemas(parsed)) {
    result = omit(parsed, 'schemas');
    const schemaDescription = schema.describe();
    applySharedSchemaRuntimeMetadata(schemaDescription, parsed.schemas);
    if (!isReferenceObject(result)) {
      applyPropertyRuntimeMetadata(schemaDescription, result);
    }
    Object.entries(parsed.schemas).forEach(([id, s]) => {
      postProcessMutations({ schema: s, ctx });
      removeInternalOptionalMarker(s);
      ctx.addSharedSchema(id, s);
    });
  } else {
    result = parsed;
    applyPropertyRuntimeMetadata(schema.describe(), result);
  }
  postProcessMutations({ schema: result, ctx });
  const shared = ctx.getSharedSchemas();
  removeInternalOptionalMarker(result);
  Object.values(shared).forEach((sharedSchema) => removeInternalOptionalMarker(sharedSchema));
  return { shared, result };
};
