/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  FieldCapsFieldCapability,
  MappingProperty,
  MappingRuntimeField,
  MappingTypeMapping,
} from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core/server';
import { isMaximumResponseSizeExceededError } from '@kbn/es-errors';
import {
  MAX_AI_INDEX_DESCRIBE_FIELDS,
  MAX_AI_INDEX_DESCRIBE_METADATA_BYTES,
} from '../../common/constants';
import { AiIndexDescribeResponseTooLargeError } from './errors';
import type { AiIndexField } from './types';

const CONFLICT_FIELD_TYPE = 'conflict';
const SEMANTIC_TEXT_TYPE = 'semantic_text';
export interface AiIndexFieldsDescription {
  /** Capped at `MAX_AI_INDEX_DESCRIBE_FIELDS`; what gets rendered. */
  fields: AiIndexField[];
  /** Uncapped; use for decisions about specific paths, never render. */
  allFields: AiIndexField[];
  /** Searchable `semantic_text` paths among `fields`. */
  semanticFields: string[];
  /** Fields beyond `MAX_AI_INDEX_DESCRIBE_FIELDS` that were dropped. */
  omittedFieldCount: number;
}

export interface DescribeAiIndexFieldsParams {
  esClient: ElasticsearchClient;
  /** `dest.value`: index, data stream, or pattern. */
  target: string;
}

/**
 * `[path, type]` per typed property, containers and multi-fields included. Mapping-defined runtime
 * fields (`mapping.runtime`, composite subfields under `fields`) are included too.
 */
const flattenMappingTypes = (mapping: MappingTypeMapping): Array<[string, string]> => {
  const joinPath = (prefix: string, name: string) => (prefix ? `${prefix}.${name}` : name);

  const walk = (
    properties: Record<string, MappingProperty>,
    prefix: string
  ): Array<[string, string]> =>
    Object.entries(properties).flatMap(([name, property]) => {
      const path = joinPath(prefix, name);
      const own: Array<[string, string]> = property.type ? [[path, property.type]] : [];
      const subFields = 'properties' in property ? property.properties : undefined;
      return [
        ...own,
        ...(subFields ? walk(subFields, path) : []),
        ...(property.fields ? walk(property.fields, path) : []),
      ];
    });

  const runtime = ([name, field]: [string, MappingRuntimeField]): Array<[string, string]> => [
    [name, field.type],
    ...Object.entries(field.fields ?? {}).map(([sub, { type }]): [string, string] => [
      joinPath(name, sub),
      type,
    ]),
  ];

  return [
    ...walk(mapping.properties ?? {}, ''),
    ...Object.entries(mapping.runtime ?? {}).flatMap(runtime),
  ];
};

/** True only if every `_field_caps` type entry for path supports it. */
const mergeCapabilities = (caps: Record<string, FieldCapsFieldCapability> | undefined) => {
  const entries = Object.values(caps ?? {});
  return {
    searchable: entries.length > 0 && entries.every((cap) => cap.searchable),
    aggregatable: entries.length > 0 && entries.every((cap) => cap.aggregatable),
  };
};

const byPath = (a: AiIndexField, b: AiIndexField) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

/**
 * Types from `_mapping`, `searchable`/`aggregatable` from `_field_caps`. Mixed types across
 * indices: `conflict`. `semanticFields` is a subset of capped `fields`.
 */
export const describeAiIndexFields = async ({
  esClient,
  target,
}: DescribeAiIndexFieldsParams): Promise<AiIndexFieldsDescription> => {
  const indexOptions = { index: target, ignore_unavailable: true, allow_no_indices: true };
  const transportOptions = { maxResponseSize: MAX_AI_INDEX_DESCRIBE_METADATA_BYTES };
  const [mappings, fieldCaps] = await Promise.all([
    esClient.indices.getMapping(indexOptions, transportOptions),
    esClient.fieldCaps({ ...indexOptions, fields: '*' }, transportOptions),
  ]).catch((error) => {
    if (isMaximumResponseSizeExceededError(error)) {
      throw new AiIndexDescribeResponseTooLargeError(MAX_AI_INDEX_DESCRIBE_METADATA_BYTES);
    }
    throw error;
  });

  const typesByPath = new Map<string, Set<string>>();
  for (const { mappings: mapping } of Object.values(mappings)) {
    for (const [path, type] of flattenMappingTypes(mapping)) {
      typesByPath.set(path, (typesByPath.get(path) ?? new Set<string>()).add(type));
    }
  }

  const allFields = [...typesByPath.entries()]
    .map(([path, types]) => ({
      path,
      type: types.size === 1 ? [...types][0] : CONFLICT_FIELD_TYPE,
      ...mergeCapabilities(fieldCaps.fields[path]),
    }))
    .sort(byPath);

  const fields = allFields.slice(0, MAX_AI_INDEX_DESCRIBE_FIELDS);
  return {
    fields,
    allFields,
    semanticFields: fields
      .filter(({ type, searchable }) => type === SEMANTIC_TEXT_TYPE && searchable)
      .map(({ path }) => path),
    omittedFieldCount: allFields.length - fields.length,
  };
};
