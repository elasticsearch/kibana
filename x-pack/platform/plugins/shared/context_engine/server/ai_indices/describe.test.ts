/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { AiIndexHttpItem } from '../../common/http_api/ai_indices';
import { describeAiIndex } from './describe';
import { describeAiIndexAggregations } from './describe_aggregations';
import { describeAiIndexFields } from './describe_fields';
import { buildExampleQueries } from './example_queries';

jest.mock('./describe_fields');
jest.mock('./describe_aggregations');

const describeAiIndexFieldsMock = jest.mocked(describeAiIndexFields);
const describeAiIndexAggregationsMock = jest.mocked(describeAiIndexAggregations);

const aiIndex: AiIndexHttpItem = {
  id: 'support',
  description: 'Support KIs',
  dest: { type: 'index', value: 'ai-index-idx-support*' },
  managed: false,
  automations: [],
  sources: [],
  date_created: '2026-01-01T00:00:00.000Z',
  date_modified: '2026-01-01T00:00:00.000Z',
};

const fields = [
  { path: 'content.semantic', type: 'semantic_text', searchable: true, aggregatable: false },
  { path: 'title', type: 'text', searchable: true, aggregatable: false },
  { path: 'type', type: 'keyword', searchable: true, aggregatable: true },
  { path: 'weight', type: 'binary', searchable: false, aggregatable: false },
];

const exampleQueriesBlock = [
  'Example queries (adapt field names for non-canonical indices)',
  ...buildExampleQueries('ai-index-idx-support*').flatMap(({ title, esql }) => ['', title, esql]),
].join('\n');

describe('describeAiIndex', () => {
  const esClient = {} as ElasticsearchClient;
  const params = { esClient, aiIndex, spaceId: 'marketing' };

  beforeEach(() => {
    describeAiIndexFieldsMock.mockReset();
    describeAiIndexFieldsMock.mockResolvedValue({
      fields,
      allFields: fields,
      semanticFields: ['content.semantic'],
      omittedFieldCount: 0,
    });
    describeAiIndexAggregationsMock.mockReset();
    describeAiIndexAggregationsMock.mockResolvedValue({
      kiTypeCounts: [
        { type: 'document', count: 7 },
        { type: 'detection rule', count: 2 },
      ],
      tagCounts: [{ tag: 'billing, invoices', count: 3 }],
    });
  });

  it('renders every section one item per line, keys quoted', async () => {
    const response = await describeAiIndex(params);

    expect(describeAiIndexFieldsMock).toHaveBeenCalledWith({
      esClient,
      target: 'ai-index-idx-support*',
    });
    expect(describeAiIndexAggregationsMock).toHaveBeenCalledWith({
      esClient,
      target: 'ai-index-idx-support*',
      spaceId: 'marketing',
      fields,
    });
    expect(response).toBe(
      [
        'AI index: support',
        'Support KIs',
        'Query with ES|QL against: ai-index-idx-support*',
        '',
        'Fields',
        'content.semantic: semantic_text, searchable',
        'title: text, searchable',
        'type: keyword, searchable, aggregatable',
        'weight: binary',
        '',
        'Semantic fields',
        'content.semantic',
        '',
        'Knowledge item types',
        '"document": 7',
        '"detection rule": 2',
        '',
        'Tags',
        '"billing, invoices": 3',
        '',
        exampleQueriesBlock,
      ].join('\n')
    );
  });

  it('omits the description line when the AI index has none', async () => {
    const { description, ...withoutDescription } = aiIndex;

    const response = await describeAiIndex({ ...params, aiIndex: withoutDescription });

    expect(response.split('\n').slice(0, 2)).toEqual([
      'AI index: support',
      'Query with ES|QL against: ai-index-idx-support*',
    ]);
  });

  it('reports omitted fields in the heading', async () => {
    describeAiIndexFieldsMock.mockResolvedValue({
      fields: [fields[1]],
      allFields: fields,
      semanticFields: [],
      omittedFieldCount: 3,
    });

    const response = await describeAiIndex(params);

    expect(response).toContain('\nFields (showing 1 of 4)\n');
    expect(response).not.toContain('Semantic fields');
  });

  it('gates counts on the uncapped field list, so type/tags beyond the display cap still count', async () => {
    const [content, title, type] = fields;
    describeAiIndexFieldsMock.mockResolvedValue({
      fields: [content, title],
      allFields: [content, title, type],
      semanticFields: [],
      omittedFieldCount: 1,
    });

    const response = await describeAiIndex(params);

    expect(describeAiIndexAggregationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ fields: [content, title, type] })
    );
    expect(response).not.toContain('\ntype: keyword');
    expect(response).toContain('\nKnowledge item types\n"document": 7\n');
  });

  it('drops empty sections but always renders the example queries', async () => {
    describeAiIndexFieldsMock.mockResolvedValue({
      fields: [],
      allFields: [],
      semanticFields: [],
      omittedFieldCount: 0,
    });
    describeAiIndexAggregationsMock.mockResolvedValue({ kiTypeCounts: [], tagCounts: [] });

    const response = await describeAiIndex(params);

    expect(response).toContain('\n\nFields\n(none)\n\n');
    expect(response).not.toContain('Knowledge item types');
    expect(response).not.toContain('\nTags\n');
    expect(response.endsWith(exampleQueriesBlock)).toBe(true);
  });
});
