/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import type { ElasticsearchClient } from '@kbn/core/server';
import {
  MAX_AI_INDEX_DESCRIBE_FIELDS,
  MAX_AI_INDEX_DESCRIBE_METADATA_BYTES,
} from '../../common/constants';
import { describeAiIndexFields } from './describe_fields';
import { AiIndexDescribeResponseTooLargeError } from './errors';

/** One `_field_caps` capability entry. */
const capability = (searchable: boolean, aggregatable: boolean) => ({
  searchable,
  aggregatable,
  metadata_field: false,
});

describe('describeAiIndexFields', () => {
  const getMapping = jest.fn();
  const fieldCaps = jest.fn();
  const esClient = {
    indices: { getMapping },
    fieldCaps,
  } as unknown as ElasticsearchClient;

  beforeEach(() => {
    getMapping.mockReset();
    fieldCaps.mockReset();
    fieldCaps.mockResolvedValue({ indices: [], fields: {} });
  });

  it('queries mapping and field caps for the target, tolerating missing indices', async () => {
    getMapping.mockResolvedValue({});

    await describeAiIndexFields({ esClient, target: 'ai-index-idx-*' });

    const indexOptions = {
      index: 'ai-index-idx-*',
      ignore_unavailable: true,
      allow_no_indices: true,
    };
    expect(getMapping).toHaveBeenCalledWith(indexOptions, expect.anything());
    expect(fieldCaps).toHaveBeenCalledWith({ ...indexOptions, fields: '*' }, expect.anything());
  });

  it('flattens nested properties and multi-fields, sorted by path', async () => {
    getMapping.mockResolvedValue({
      'ai-index-idx-a': {
        mappings: {
          properties: {
            title: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            attributes: { type: 'flattened' },
            permissions: {
              properties: {
                kibana: {
                  properties: {
                    privileges: { type: 'nested', properties: { space: { type: 'keyword' } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    fieldCaps.mockResolvedValue({
      indices: ['ai-index-idx-a'],
      fields: {
        title: { text: capability(true, false) },
        'title.keyword': { keyword: capability(true, true) },
        attributes: { flattened: capability(true, true) },
        'permissions.kibana.privileges': { nested: capability(false, false) },
        'permissions.kibana.privileges.space': { keyword: capability(true, true) },
      },
    });

    const { fields, semanticFields, omittedFieldCount } = await describeAiIndexFields({
      esClient,
      target: 'ai-index-idx-a',
    });

    expect(fields).toEqual([
      { path: 'attributes', type: 'flattened', searchable: true, aggregatable: true },
      {
        path: 'permissions.kibana.privileges',
        type: 'nested',
        searchable: false,
        aggregatable: false,
      },
      {
        path: 'permissions.kibana.privileges.space',
        type: 'keyword',
        searchable: true,
        aggregatable: true,
      },
      { path: 'title', type: 'text', searchable: true, aggregatable: false },
      { path: 'title.keyword', type: 'keyword', searchable: true, aggregatable: true },
    ]);
    expect(semanticFields).toEqual([]);
    expect(omittedFieldCount).toBe(0);
  });

  it('includes mapping-defined runtime fields and composite subfields', async () => {
    getMapping.mockResolvedValue({
      'ai-index-idx-a': {
        mappings: {
          properties: { title: { type: 'text' } },
          runtime: {
            day_of_week: { type: 'keyword', script: { source: 'emit("mon")' } },
            parsed: {
              type: 'composite',
              script: { source: 'emit("code", 1L)' },
              fields: { code: { type: 'long' } },
            },
          },
        },
      },
    });
    fieldCaps.mockResolvedValue({
      indices: ['ai-index-idx-a'],
      fields: {
        title: { text: capability(true, false) },
        day_of_week: { keyword: capability(true, true) },
        'parsed.code': { long: capability(true, true) },
      },
    });

    const { fields } = await describeAiIndexFields({ esClient, target: 'ai-index-idx-a' });

    expect(fields).toEqual([
      { path: 'day_of_week', type: 'keyword', searchable: true, aggregatable: true },
      { path: 'parsed', type: 'composite', searchable: false, aggregatable: false },
      { path: 'parsed.code', type: 'long', searchable: true, aggregatable: true },
      { path: 'title', type: 'text', searchable: true, aggregatable: false },
    ]);
  });

  it('reports conflict when matched indices map a path to different types', async () => {
    getMapping.mockResolvedValue({
      'ai-index-idx-a': { mappings: { properties: { status: { type: 'keyword' } } } },
      'ai-index-idx-b': { mappings: { properties: { status: { type: 'long' } } } },
      'ai-index-idx-c': { mappings: { properties: { status: { type: 'keyword' } } } },
    });
    fieldCaps.mockResolvedValue({
      indices: ['ai-index-idx-a', 'ai-index-idx-b', 'ai-index-idx-c'],
      fields: { status: { keyword: capability(true, true), long: capability(true, false) } },
    });

    const { fields } = await describeAiIndexFields({ esClient, target: 'ai-index-idx-*' });

    expect(fields).toEqual([
      { path: 'status', type: 'conflict', searchable: true, aggregatable: false },
    ]);
  });

  it('marks a mapped field without field caps as neither searchable nor aggregatable', async () => {
    getMapping.mockResolvedValue({
      'ai-index-idx-a': { mappings: { properties: { blob: { type: 'binary' } } } },
    });

    const { fields } = await describeAiIndexFields({ esClient, target: 'ai-index-idx-a' });

    expect(fields).toEqual([
      { path: 'blob', type: 'binary', searchable: false, aggregatable: false },
    ]);
  });

  it('lists searchable semantic_text fields from the mapping type, not a name heuristic', async () => {
    getMapping.mockResolvedValue({
      'ai-index-idx-a': {
        mappings: {
          properties: {
            content: { properties: { semantic: { type: 'semantic_text' } } },
            'summary.semantic': { type: 'text' },
            disabled: { type: 'semantic_text' },
          },
        },
      },
    });
    fieldCaps.mockResolvedValue({
      indices: ['ai-index-idx-a'],
      fields: {
        'content.semantic': { semantic_text: capability(true, false) },
        'summary.semantic': { text: capability(true, false) },
        disabled: { semantic_text: capability(false, false) },
      },
    });

    const { semanticFields } = await describeAiIndexFields({
      esClient,
      target: 'ai-index-idx-a',
    });

    expect(semanticFields).toEqual(['content.semantic']);
  });

  it('caps fields, counts the omitted ones and derives semantic fields from the capped list', async () => {
    const properties = Object.fromEntries(
      Array.from({ length: MAX_AI_INDEX_DESCRIBE_FIELDS + 1 }, (_, i) => [
        `field_${String(i).padStart(4, '0')}`,
        { type: 'keyword' },
      ])
    );
    properties.aaa_semantic = { type: 'semantic_text' };
    properties.zzz_semantic = { type: 'semantic_text' };
    getMapping.mockResolvedValue({ 'ai-index-idx-a': { mappings: { properties } } });
    fieldCaps.mockResolvedValue({
      indices: ['ai-index-idx-a'],
      fields: {
        aaa_semantic: { semantic_text: capability(true, false) },
        zzz_semantic: { semantic_text: capability(true, false) },
      },
    });

    const { fields, allFields, semanticFields, omittedFieldCount } = await describeAiIndexFields({
      esClient,
      target: 'ai-index-idx-a',
    });

    expect(fields).toHaveLength(MAX_AI_INDEX_DESCRIBE_FIELDS);
    expect(fields.some(({ path }) => path === 'zzz_semantic')).toBe(false);
    // Uncapped: callers deciding on a specific path must not lose it to the display cap.
    expect(allFields).toHaveLength(MAX_AI_INDEX_DESCRIBE_FIELDS + 3);
    expect(allFields.some(({ path }) => path === 'zzz_semantic')).toBe(true);
    expect(semanticFields).toEqual(['aaa_semantic']);
    // MAX + 1 keywords plus two semantic fields, minus the MAX kept.
    expect(omittedFieldCount).toBe(3);
  });

  it('bounds both metadata responses and maps overflow to a typed error', async () => {
    getMapping.mockResolvedValue({});
    await describeAiIndexFields({ esClient, target: 'ai-index-idx-a' });
    expect(getMapping).toHaveBeenCalledWith(expect.anything(), {
      maxResponseSize: MAX_AI_INDEX_DESCRIBE_METADATA_BYTES,
    });
    expect(fieldCaps).toHaveBeenCalledWith(expect.anything(), {
      maxResponseSize: MAX_AI_INDEX_DESCRIBE_METADATA_BYTES,
    });

    getMapping.mockRejectedValue(
      new errors.RequestAbortedError(
        `The content length (999) is bigger than the maximum allowed buffer (${MAX_AI_INDEX_DESCRIBE_METADATA_BYTES})`
      )
    );
    await expect(describeAiIndexFields({ esClient, target: 'ai-index-idx-a' })).rejects.toThrow(
      AiIndexDescribeResponseTooLargeError
    );
  });

  it('rethrows other Elasticsearch errors unchanged', async () => {
    getMapping.mockRejectedValue(new Error('boom'));

    await expect(describeAiIndexFields({ esClient, target: 'ai-index-idx-a' })).rejects.toThrow(
      'boom'
    );
  });
});
