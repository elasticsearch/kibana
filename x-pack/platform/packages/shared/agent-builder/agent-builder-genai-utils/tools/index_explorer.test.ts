/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EsResourceType } from '@kbn/agent-builder-common';
import type { ResourceDescriptor } from './index_explorer';
import {
  createIndexSelectorPrompt,
  formatResource,
  gatherResourceDescriptors,
  indexExplorer,
} from './index_explorer';
import { listSearchSources } from './steps/list_search_sources';
import { getIndexFields } from './utils/ccs';
import { getDataStreamMappings } from './utils/mappings';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import type { ScopedModel } from '@kbn/agent-builder-server';

jest.mock('./steps/list_search_sources');
jest.mock('./utils/ccs', () => ({
  ...jest.requireActual('./utils/ccs'),
  getIndexFields: jest.fn(),
}));
jest.mock('./utils/mappings', () => ({
  ...jest.requireActual('./utils/mappings'),
  getDataStreamMappings: jest.fn(),
}));

const listSearchSourcesMock = listSearchSources as jest.Mock;
const getIndexFieldsMock = getIndexFields as jest.Mock;
const getDataStreamMappingsMock = getDataStreamMappings as jest.Mock;

describe('createIndexSelectorPrompt', () => {
  const nlQuery = 'some NL query';

  const indexDescriptor: ResourceDescriptor = {
    type: EsResourceType.index,
    name: 'some_index',
    description: 'some description',
    fields: [
      { path: 'foo', type: 'keyword' },
      { path: 'bar', type: 'text' },
    ],
  };

  it('returns a prompt containing the nl query', () => {
    const messages = createIndexSelectorPrompt({
      nlQuery,
      resources: [indexDescriptor],
    });

    const userPrompt = (messages[1] as string[])[1];

    expect(userPrompt).toContain(nlQuery);
  });

  it('returns a prompt containing the formatted resource', () => {
    const messages = createIndexSelectorPrompt({
      nlQuery,
      resources: [indexDescriptor],
    });

    const userPrompt = (messages[1] as string[])[1];

    expect(userPrompt).toContain(formatResource(indexDescriptor));
  });
});

describe('formatResource', () => {
  it('formats a resource with description and fields', () => {
    const result = formatResource({
      type: EsResourceType.index,
      name: 'my-index',
      description: 'My index description',
      fields: [
        { path: 'field1', type: 'keyword' },
        { path: 'field2', type: 'text' },
        { path: 'field3', type: 'long' },
      ],
    });
    expect(result).toEqual(
      '- my-index (index): My index description\n  fields: field1 [keyword], field2 [text], field3 [long]'
    );
  });

  it('omits description when not provided', () => {
    const result = formatResource({
      type: EsResourceType.dataStream,
      name: 'logs-nginx',
      fields: [
        { path: '@timestamp', type: 'date' },
        { path: 'message', type: 'text' },
      ],
    });
    expect(result).toEqual(
      '- logs-nginx (data_stream)\n  fields: @timestamp [date], message [text]'
    );
  });

  it('omits fields line when fields is empty', () => {
    const result = formatResource({
      type: EsResourceType.alias,
      name: 'my-alias',
      description: 'An alias',
      fields: [],
    });
    expect(result).toEqual('- my-alias (alias): An alias');
  });

  it('omits fields line when fields is undefined', () => {
    const result = formatResource({
      type: EsResourceType.alias,
      name: 'my-alias',
    });
    expect(result).toEqual('- my-alias (alias)');
  });

  it('truncates fields to 10 entries', () => {
    const fields = Array.from({ length: 15 }, (_, i) => ({
      path: `field${i + 1}`,
      type: 'keyword',
    }));
    const result = formatResource({
      type: EsResourceType.index,
      name: 'big-index',
      fields,
    });
    expect(result).toContain('fields: field1 [keyword],');
    expect(result).toContain('[and 5 more]');
    expect(result).not.toContain('field11');
  });
});

describe('indexExplorer', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
  let model: ScopedModel;

  beforeEach(() => {
    jest.clearAllMocks();
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    model = {
      chatModel: {
        withStructuredOutput: jest.fn().mockReturnValue({
          invoke: jest.fn().mockResolvedValue({
            targets: [],
          }),
        }),
      },
    } as unknown as ScopedModel;

    listSearchSourcesMock.mockResolvedValue({
      datasets: [],
      indices: [],
      aliases: [],
      data_streams: [],
    });
  });

  it('forwards the index pattern to `listSearchSources` for source resolution', async () => {
    await indexExplorer({
      nlQuery: 'test query',
      indexPattern: 'logs-*',
      esClient,
      model,
    });

    expect(listSearchSourcesMock).toHaveBeenCalledWith({
      pattern: 'logs-*',
      excludeIndicesRepresentedAsDatastream: true,
      excludeIndicesRepresentedAsAlias: false,
      includeDatasets: false,
      esClient,
    });
  });
});

describe('gatherResourceDescriptors', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    esClient = elasticsearchServiceMock.createElasticsearchClient();

    listSearchSourcesMock.mockResolvedValue({
      datasets: [],
      indices: [],
      aliases: [],
      data_streams: [],
    });
  });

  it('returns index descriptors with field path and type', async () => {
    listSearchSourcesMock.mockResolvedValue({
      datasets: [],
      indices: [{ type: EsResourceType.index, name: 'my-index' }],
      aliases: [],
      data_streams: [],
    });

    getIndexFieldsMock.mockResolvedValue({
      'my-index': {
        fields: [
          { path: 'name', type: 'text', meta: {} },
          { path: 'status', type: 'keyword', meta: {} },
        ],
        rawMapping: { _meta: { description: 'test index' } },
      },
    });

    const result = await gatherResourceDescriptors({ indexPattern: 'my-*', esClient });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: EsResourceType.index,
      name: 'my-index',
      description: 'test index',
      fields: [
        { path: 'name', type: 'text' },
        { path: 'status', type: 'keyword' },
      ],
    });
  });

  it('returns data stream descriptors with field path and type', async () => {
    listSearchSourcesMock.mockResolvedValue({
      datasets: [],
      indices: [],
      aliases: [],
      data_streams: [
        {
          type: EsResourceType.dataStream,
          name: 'logs-nginx',
          indices: [],
          timestamp_field: '@timestamp',
        },
      ],
    });

    getDataStreamMappingsMock.mockResolvedValue({
      'logs-nginx': {
        mappings: {
          _meta: { description: 'nginx logs' },
          properties: {
            '@timestamp': { type: 'date' },
            message: { type: 'text' },
          },
        },
      },
    });

    const result = await gatherResourceDescriptors({ indexPattern: 'logs-*', esClient });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(EsResourceType.dataStream);
    expect(result[0].name).toBe('logs-nginx');
    expect(result[0].description).toBe('nginx logs');
    expect(result[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '@timestamp', type: 'date' }),
        expect.objectContaining({ path: 'message', type: 'text' }),
      ])
    );
  });

  it('returns alias descriptors without fields', async () => {
    listSearchSourcesMock.mockResolvedValue({
      datasets: [],
      indices: [],
      aliases: [{ type: EsResourceType.alias, name: 'my-alias', indices: ['idx-a', 'idx-b'] }],
      data_streams: [],
    });

    const result = await gatherResourceDescriptors({ indexPattern: '*', esClient });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: EsResourceType.alias,
      name: 'my-alias',
      description: 'Point to the following indices: idx-a, idx-b',
    });
    expect(result[0].fields).toBeUndefined();
  });

  it('excludes data streams when includeDatastream is false', async () => {
    listSearchSourcesMock.mockResolvedValue({
      datasets: [],
      indices: [{ type: EsResourceType.index, name: 'my-index' }],
      aliases: [],
      data_streams: [
        {
          type: EsResourceType.dataStream,
          name: 'logs-ds',
          indices: [],
          timestamp_field: '@timestamp',
        },
      ],
    });

    getIndexFieldsMock.mockResolvedValue({
      'my-index': { fields: [], rawMapping: {} },
    });

    const result = await gatherResourceDescriptors({
      indexPattern: '*',
      includeDatastream: false,
      esClient,
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('my-index');
    expect(getDataStreamMappingsMock).not.toHaveBeenCalled();
  });

  it('excludes aliases when includeAliases is false', async () => {
    listSearchSourcesMock.mockResolvedValue({
      datasets: [],
      indices: [{ type: EsResourceType.index, name: 'my-index' }],
      aliases: [{ type: EsResourceType.alias, name: 'my-alias', indices: ['my-index'] }],
      data_streams: [],
    });

    getIndexFieldsMock.mockResolvedValue({
      'my-index': { fields: [], rawMapping: {} },
    });

    const result = await gatherResourceDescriptors({
      indexPattern: '*',
      includeAliases: false,
      esClient,
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('my-index');
  });

  it('returns mixed resource types', async () => {
    listSearchSourcesMock.mockResolvedValue({
      datasets: [],
      indices: [{ type: EsResourceType.index, name: 'idx-1' }],
      aliases: [{ type: EsResourceType.alias, name: 'alias-1', indices: ['idx-1'] }],
      data_streams: [
        {
          type: EsResourceType.dataStream,
          name: 'ds-1',
          indices: [],
          timestamp_field: '@timestamp',
        },
      ],
    });

    getIndexFieldsMock.mockResolvedValue({
      'idx-1': {
        fields: [{ path: 'id', type: 'keyword', meta: {} }],
        rawMapping: {},
      },
    });

    getDataStreamMappingsMock.mockResolvedValue({
      'ds-1': {
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
          },
        },
      },
    });

    const result = await gatherResourceDescriptors({ indexPattern: '*', esClient });

    expect(result).toHaveLength(3);
    const types = result.map((r) => r.type);
    expect(types).toContain(EsResourceType.index);
    expect(types).toContain(EsResourceType.alias);
    expect(types).toContain(EsResourceType.dataStream);
  });

  it('returns empty array when no sources match', async () => {
    const result = await gatherResourceDescriptors({ indexPattern: 'nonexistent-*', esClient });
    expect(result).toEqual([]);
  });
});
