/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolHandlerReturn } from '@kbn/agent-builder-server/tools/handler';
import type { Streams, FieldDefinition, ClassicFieldDefinition } from '@kbn/streams-schema';
import type { StreamlangStep } from '@kbn/streamlang/types/streamlang';
import { createInspectStreamsTool } from './inspect_streams';
import { getUnmappedFieldsNote } from '../../utils/mapping_utils';
import {
  createMockGetScopedClients,
  createMockToolContext,
  mockEsMethodResolvedValue,
} from '../../utils/test_helpers';

const searchResponseDefaults = {
  took: 0,
  timed_out: false,
  _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
} as const;

const wiredStreamDef = (
  name: string,
  steps: StreamlangStep[] = [],
  fields: FieldDefinition = { 'log.level': { type: 'keyword' } }
): Streams.WiredStream.Definition => ({
  type: 'wired',
  name,
  description: `${name} stream`,
  updated_at: '2026-04-10T00:00:00.000Z',
  ingest: {
    wired: { fields, routing: [] },
    processing: { steps, updated_at: '2026-04-10T00:00:00.000Z' },
    lifecycle: { inherit: {} },
    failure_store: { inherit: {} },
    settings: {},
  },
});

const classicStreamDef = (
  name: string,
  steps: StreamlangStep[] = []
): Streams.ClassicStream.Definition => ({
  type: 'classic',
  name,
  description: `${name} stream`,
  updated_at: '2026-04-10T00:00:00.000Z',
  ingest: {
    classic: { field_overrides: { message: { type: 'text' } } },
    processing: { steps, updated_at: '2026-04-10T00:00:00.000Z' },
    lifecycle: { inherit: {} },
    failure_store: { inherit: {} },
    settings: {},
  },
});

const queryStreamDef = (
  name: string,
  overrides: Partial<Streams.QueryStream.Definition> = {}
): Streams.QueryStream.Definition => ({
  type: 'query',
  name,
  description: 'test',
  updated_at: '2026-04-10T00:00:00.000Z',
  // The stored definition only keeps the view reference; the actual esql lives in the view.
  query: { esql: '', view: `view-${name}` },
  ...overrides,
});

const mockEsqlViewResponse = (query: string) => ({
  views: [{ name: 'view', query }],
});

const mockFieldCapsResponse = (
  fields: Record<string, Record<string, { type: string; metadata_field?: boolean }>>
) => ({
  indices: ['.ds-test-index'],
  fields: Object.fromEntries(
    Object.entries(fields).map(([fieldName, variants]) => [
      fieldName,
      Object.fromEntries(
        Object.entries(variants).map(([variantName, props]) => [
          variantName,
          { aggregatable: true, searchable: true, ...props },
        ])
      ),
    ])
  ),
});

const emptySearchResponse = {
  ...searchResponseDefaults,
  hits: { hits: [] },
};

interface InspectResultData {
  summary: string;
  streams: Record<string, Record<string, Record<string, unknown>>>;
}

const getData = (result: ToolHandlerReturn): InspectResultData => {
  if (!('results' in result)) throw new Error('Expected results');
  return result.results[0].data as InspectResultData;
};

describe('createInspectStreamsTool handler', () => {
  const setup = () => {
    const { getScopedClients, streamsClient, esClient, scopedClusterClient } =
      createMockGetScopedClients();
    const tool = createInspectStreamsTool({ getScopedClients, isServerless: false });
    const context = createMockToolContext();
    return { tool, context, streamsClient, esClient, scopedClusterClient };
  };

  it('returns overview for a single stream', async () => {
    const { tool, context, streamsClient } = setup();
    streamsClient.getStream.mockResolvedValue(wiredStreamDef('logs.ecs.nginx'));
    streamsClient.getAncestors.mockResolvedValue([]);

    const result = await tool.handler(
      { names: ['logs.ecs.nginx'], aspects: ['overview'] },
      context
    );

    const data = getData(result);
    expect(data.streams['logs.ecs.nginx']).toBeDefined();
    expect(data.streams['logs.ecs.nginx'].type).toBe('wired');
    expect(data.streams['logs.ecs.nginx'].overview.name).toBe('logs.ecs.nginx');
  });

  it('resolves ["*"] to all existing streams', async () => {
    const { tool, context, streamsClient } = setup();

    streamsClient.listStreamsWithDataStreamExistence.mockResolvedValue([
      { exists: true, stream: wiredStreamDef('logs.ecs.a') },
      { exists: true, stream: classicStreamDef('logs-nginx.data-default') },
      { exists: false, stream: wiredStreamDef('logs.ecs.missing') },
    ]);

    streamsClient.getStream
      .mockResolvedValueOnce(wiredStreamDef('logs.ecs.a'))
      .mockResolvedValueOnce(classicStreamDef('logs-nginx.data-default'));

    const result = await tool.handler({ names: ['*'], aspects: ['overview'] }, context);

    const data = getData(result);
    expect(Object.keys(data.streams)).toHaveLength(2);
    expect(data.streams['logs.ecs.a'].type).toBe('wired');
    expect(data.streams['logs-nginx.data-default'].type).toBe('classic');
  });

  it('includes query streams when resolving ["*"] despite their lack of a backing data stream', async () => {
    const { tool, context, streamsClient, esClient } = setup();

    // Query streams are ES|QL views with no data stream, so listStreamsWithDataStreamExistence
    // reports them with exists: false. They must still be surfaced to the agent.
    streamsClient.listStreamsWithDataStreamExistence.mockResolvedValue([
      { exists: true, stream: wiredStreamDef('logs.ecs.a') },
      { exists: false, stream: queryStreamDef('logs.ecs.a.errors') },
      { exists: false, stream: wiredStreamDef('logs.ecs.missing') },
    ]);

    streamsClient.getStream
      .mockResolvedValueOnce(wiredStreamDef('logs.ecs.a'))
      .mockResolvedValueOnce(queryStreamDef('logs.ecs.a.errors'));
    streamsClient.getAncestors.mockResolvedValue([]);
    mockEsMethodResolvedValue(esClient.transport.request, mockEsqlViewResponse('FROM logs.ecs.a'));

    const result = await tool.handler({ names: ['*'], aspects: ['overview'] }, context);

    const data = getData(result);
    // The query stream is included; the wired stream without a materialized data stream is not.
    expect(Object.keys(data.streams)).toEqual(['logs.ecs.a', 'logs.ecs.a.errors']);
    expect(data.streams['logs.ecs.a.errors'].type).toBe('query');
  });

  it('returns processing_chain with source attribution for wired streams', async () => {
    const { tool, context, streamsClient } = setup();

    const steps: StreamlangStep[] = [
      { action: 'grok', from: 'message', patterns: ['%{COMBINEDAPACHELOG}'] },
      { action: 'remove', from: 'message' },
    ];
    streamsClient.getStream.mockResolvedValue(wiredStreamDef('logs.ecs.nginx', steps));
    streamsClient.getAncestors.mockResolvedValue([]);

    const result = await tool.handler(
      { names: ['logs.ecs.nginx'], aspects: ['processing'] },
      context
    );

    const data = getData(result);
    const proc = data.streams['logs.ecs.nginx'].processing;
    expect(proc.own_step_count).toBe(2);
    expect(proc.processing_chain).toEqual([{ source: 'logs.ecs.nginx', steps }]);
  });

  it('includes ancestor steps in processing_chain for wired streams', async () => {
    const { tool, context, streamsClient } = setup();

    const parentSteps: StreamlangStep[] = [
      { action: 'date', from: 'timestamp', formats: ['ISO8601'] },
    ];
    const ownSteps: StreamlangStep[] = [
      { action: 'grok', from: 'message', patterns: ['%{GREEDYDATA}'] },
    ];

    streamsClient.getStream.mockResolvedValue(wiredStreamDef('logs.ecs.nginx', ownSteps));
    streamsClient.getAncestors.mockResolvedValue([wiredStreamDef('logs.ecs', parentSteps)]);

    const result = await tool.handler(
      { names: ['logs.ecs.nginx'], aspects: ['processing'] },
      context
    );

    const data = getData(result);
    const proc = data.streams['logs.ecs.nginx'].processing;
    expect(proc.processing_chain).toEqual([
      { source: 'logs.ecs', steps: parentSteps },
      { source: 'logs.ecs.nginx', steps: ownSteps },
    ]);
    expect(proc.own_step_count).toBe(1);
  });

  it('returns single-entry processing_chain for classic streams', async () => {
    const { tool, context, streamsClient } = setup();

    const steps: StreamlangStep[] = [
      { action: 'grok', from: 'message', patterns: ['%{GREEDYDATA}'] },
    ];
    streamsClient.getStream.mockResolvedValue(classicStreamDef('logs-nginx', steps));

    const result = await tool.handler({ names: ['logs-nginx'], aspects: ['processing'] }, context);

    const data = getData(result);
    const proc = data.streams['logs-nginx'].processing;
    expect(proc.processing_chain).toEqual([{ source: 'logs-nginx', steps }]);
    expect(proc.own_step_count).toBe(1);
  });

  it('omits processing for query streams', async () => {
    const { tool, context, streamsClient } = setup();

    streamsClient.getStream.mockResolvedValue(queryStreamDef('query.test'));

    const result = await tool.handler({ names: ['query.test'], aspects: ['processing'] }, context);

    const data = getData(result);
    expect(data.streams['query.test'].processing).toBeUndefined();
  });

  it('includes type_context per stream type', async () => {
    const { tool, context, streamsClient, esClient } = setup();

    streamsClient.getStream.mockResolvedValue(queryStreamDef('query.test'));
    mockEsMethodResolvedValue(esClient.transport.request, mockEsqlViewResponse('FROM logs'));

    const result = await tool.handler({ names: ['query.test'], aspects: ['overview'] }, context);

    const data = getData(result);
    expect(data.streams['query.test'].type).toBe('query');
    expect(data.streams['query.test'].type_context).toContain('Read-only');
  });

  it('surfaces the resolved ES|QL query (from the view) and field_descriptions for query streams', async () => {
    const { tool, context, streamsClient, esClient } = setup();

    streamsClient.getStream.mockResolvedValue(
      queryStreamDef('logs.ecs.errors', {
        query: { esql: '', view: 'view-logs.ecs.errors' },
        field_descriptions: { 'error.message': 'The human-readable error text' },
      })
    );
    // The esql comes from the view, not the stored definition.
    mockEsMethodResolvedValue(
      esClient.transport.request,
      mockEsqlViewResponse('FROM logs.ecs | WHERE log.level == "error"')
    );

    const result = await tool.handler(
      { names: ['logs.ecs.errors'], aspects: ['overview'] },
      context
    );

    const data = getData(result);
    const query = data.streams['logs.ecs.errors'].query as Record<string, unknown>;
    expect(query.view).toBe('view-logs.ecs.errors');
    expect(query.esql).toBe('FROM logs.ecs | WHERE log.level == "error"');
    expect(query.field_descriptions).toEqual({
      'error.message': 'The human-readable error text',
    });
    expect(esClient.transport.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/_query/view/view-logs.ecs.errors',
    });
  });

  it('degrades gracefully with esql_error when the ES|QL view cannot be resolved', async () => {
    const { tool, context, streamsClient, esClient } = setup();

    streamsClient.getStream.mockResolvedValue(queryStreamDef('logs.ecs.errors'));
    esClient.transport.request.mockRejectedValue(new Error('view not found'));

    const result = await tool.handler(
      { names: ['logs.ecs.errors'], aspects: ['overview'] },
      context
    );

    const data = getData(result);
    const query = data.streams['logs.ecs.errors'].query as Record<string, unknown>;
    expect(query.esql).toBeUndefined();
    expect(query.esql_error).toContain('view not found');
  });

  it('omits the query block for query streams when overview is not requested', async () => {
    const { tool, context, streamsClient, esClient } = setup();

    streamsClient.getStream.mockResolvedValue(queryStreamDef('logs.ecs.errors'));

    const result = await tool.handler(
      { names: ['logs.ecs.errors'], aspects: ['processing'] },
      context
    );

    const data = getData(result);
    expect(data.streams['logs.ecs.errors'].query).toBeUndefined();
    expect(esClient.transport.request).not.toHaveBeenCalled();
  });

  it('handles errors for individual streams gracefully', async () => {
    const { tool, context, streamsClient } = setup();

    streamsClient.getStream
      .mockResolvedValueOnce(wiredStreamDef('logs.ecs.good'))
      .mockRejectedValueOnce(new Error('Cannot find stream logs.ecs.bad'));

    const result = await tool.handler(
      { names: ['logs.ecs.good', 'logs.ecs.bad'], aspects: ['overview'] },
      context
    );

    const data = getData(result);
    expect(data.streams['logs.ecs.good'].type).toBe('wired');
    expect(data.streams['logs.ecs.bad'].error).toContain('Cannot find stream');
  });

  it('returns empty result when no streams exist', async () => {
    const { tool, context, streamsClient } = setup();
    streamsClient.listStreamsWithDataStreamExistence.mockResolvedValue([]);

    const result = await tool.handler({ names: ['*'], aspects: ['overview'] }, context);

    const data = getData(result);
    expect(data.summary).toBe('No streams found.');
    expect(Object.keys(data.streams)).toHaveLength(0);
  });

  describe('classic stream schema aspect with fieldCaps', () => {
    const classicWithOverrides = (
      name: string,
      overrides: ClassicFieldDefinition = {}
    ): Streams.ClassicStream.Definition => ({
      type: 'classic',
      name,
      description: `${name} stream`,
      updated_at: '2026-04-10T00:00:00.000Z',
      ingest: {
        classic: { field_overrides: overrides },
        processing: { steps: [], updated_at: '2026-04-10T00:00:00.000Z' },
        lifecycle: { inherit: {} },
        failure_store: { inherit: {} },
        settings: {},
      },
    });

    const mockMappingResponse = (dynamic: string = 'true') => ({
      '.ds-test-index-000001': {
        mappings: { dynamic, properties: {} },
      },
    });

    interface SchemaField {
      name: string;
      type: string;
      source: string;
      overridable?: boolean;
    }

    interface SchemaResult {
      dynamic_mapping: string;
      unmapped_fields_note: string;
      mapped_fields: SchemaField[];
      unmapped_fields: string[];
      total_mapped: number;
      total_unmapped: number;
    }

    const getSchema = (result: ToolHandlerReturn, streamName: string): SchemaResult => {
      if (!('results' in result)) throw new Error('Expected results');
      const data = result.results[0].data as {
        streams: Record<string, { schema: SchemaResult }>;
      };
      return data.streams[streamName].schema;
    };

    it('shows ES-mapped fields with source "index_template" for classic streams', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(classicWithOverrides('logs-otel'));
      mockEsMethodResolvedValue(esClient.search, emptySearchResponse);
      mockEsMethodResolvedValue(
        esClient.fieldCaps,
        mockFieldCapsResponse({
          trace_id: { trace_id: { type: 'keyword' } },
          '@timestamp': { '@timestamp': { type: 'date' } },
        })
      );
      mockEsMethodResolvedValue(esClient.indices.getMapping, mockMappingResponse('true'));

      const result = await tool.handler({ names: ['logs-otel'], aspects: ['schema'] }, context);
      const schema = getSchema(result, 'logs-otel');

      expect(schema.mapped_fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'trace_id',
            type: 'keyword',
            source: 'index_template',
            overridable: true,
          }),
          expect.objectContaining({
            name: '@timestamp',
            type: 'date',
            source: 'index_template',
            overridable: true,
          }),
        ])
      );
      expect(schema.unmapped_fields).toEqual([]);
      expect(schema.dynamic_mapping).toBe('true');
      expect(schema.unmapped_fields_note).toBe(getUnmappedFieldsNote('true'));
    });

    it('marks non-Streams types as overridable: false', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(classicWithOverrides('logs-otel'));
      mockEsMethodResolvedValue(esClient.search, emptySearchResponse);
      mockEsMethodResolvedValue(
        esClient.fieldCaps,
        mockFieldCapsResponse({
          'data_stream.type': { 'data_stream.type': { type: 'constant_keyword' } },
          trace_id: { trace_id: { type: 'keyword' } },
          'scope.version': { 'scope.version': { type: 'version' } },
        })
      );
      mockEsMethodResolvedValue(esClient.indices.getMapping, mockMappingResponse());

      const result = await tool.handler({ names: ['logs-otel'], aspects: ['schema'] }, context);
      const schema = getSchema(result, 'logs-otel');

      const dsType = schema.mapped_fields.find((f) => f.name === 'data_stream.type');
      expect(dsType).toEqual(
        expect.objectContaining({
          type: 'constant_keyword',
          source: 'index_template',
          overridable: false,
        })
      );
      const version = schema.mapped_fields.find((f) => f.name === 'scope.version');
      expect(version).toEqual(expect.objectContaining({ type: 'version', overridable: true }));
    });

    it('shows field_overrides as Streams-managed with stream name as source', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(
        classicWithOverrides('logs-otel', { my_field: { type: 'keyword' } })
      );
      mockEsMethodResolvedValue(esClient.search, emptySearchResponse);
      mockEsMethodResolvedValue(
        esClient.fieldCaps,
        mockFieldCapsResponse({
          my_field: { my_field: { type: 'keyword' } },
          trace_id: { trace_id: { type: 'keyword' } },
        })
      );
      mockEsMethodResolvedValue(esClient.indices.getMapping, mockMappingResponse());

      const result = await tool.handler({ names: ['logs-otel'], aspects: ['schema'] }, context);
      const schema = getSchema(result, 'logs-otel');

      const myField = schema.mapped_fields.find((f) => f.name === 'my_field');
      expect(myField).toEqual(
        expect.objectContaining({
          name: 'my_field',
          type: 'keyword',
          source: 'logs-otel',
        })
      );
      expect(myField?.overridable).toBeUndefined();
    });

    it('reports truly unmapped fields from _source samples', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(classicWithOverrides('logs-otel'));
      mockEsMethodResolvedValue(esClient.search, {
        ...searchResponseDefaults,
        hits: {
          hits: [
            { _index: 'logs-otel', _id: '1', _source: { trace_id: 'abc', dynamic_field: 'hello' } },
          ],
        },
      });
      mockEsMethodResolvedValue(
        esClient.fieldCaps,
        mockFieldCapsResponse({
          trace_id: { trace_id: { type: 'keyword' } },
        })
      );
      mockEsMethodResolvedValue(esClient.indices.getMapping, mockMappingResponse());

      const result = await tool.handler({ names: ['logs-otel'], aspects: ['schema'] }, context);
      const schema = getSchema(result, 'logs-otel');

      expect(schema.unmapped_fields).toEqual(['dynamic_field']);
      expect(schema.mapped_fields.find((f) => f.name === 'trace_id')).toBeDefined();
    });

    it('filters out metadata and multi-field sub-paths from fieldCaps', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(classicWithOverrides('logs-otel'));
      mockEsMethodResolvedValue(esClient.search, emptySearchResponse);
      mockEsMethodResolvedValue(
        esClient.fieldCaps,
        mockFieldCapsResponse({
          _id: { _id: { type: 'keyword', metadata_field: true } },
          trace_id: { trace_id: { type: 'keyword' } },
          'trace_id.keyword': { 'trace_id.keyword': { type: 'keyword' } },
          'message.text': { 'message.text': { type: 'match_only_text' } },
        })
      );
      mockEsMethodResolvedValue(esClient.indices.getMapping, mockMappingResponse());

      const result = await tool.handler({ names: ['logs-otel'], aspects: ['schema'] }, context);
      const schema = getSchema(result, 'logs-otel');

      const names = schema.mapped_fields.map((f) => f.name);
      expect(names).toContain('trace_id');
      expect(names).not.toContain('_id');
      expect(names).not.toContain('trace_id.keyword');
      expect(names).not.toContain('message.text');
    });

    it('does not use fieldCaps for wired streams', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(wiredStreamDef('logs.ecs.nginx'));
      streamsClient.getAncestors.mockResolvedValue([]);
      mockEsMethodResolvedValue(esClient.search, emptySearchResponse);

      const result = await tool.handler(
        { names: ['logs.ecs.nginx'], aspects: ['schema'] },
        context
      );

      expect(esClient.fieldCaps).not.toHaveBeenCalled();
      const schema = getSchema(result, 'logs.ecs.nginx');
      expect(schema.mapped_fields).toBeDefined();
    });
  });

  describe('wired stream schema parameters', () => {
    interface SchemaField {
      name: string;
      type: string;
      source: string;
      parameters?: Record<string, unknown>;
    }

    interface SchemaResult {
      dynamic_mapping: string;
      unmapped_fields_note: string;
      mapped_fields: SchemaField[];
      unmapped_fields: string[];
      total_mapped: number;
      total_unmapped: number;
    }

    const getSchema = (result: ToolHandlerReturn, streamName: string): SchemaResult => {
      if (!('results' in result)) throw new Error('Expected results');
      const data = result.results[0].data as {
        streams: Record<string, { schema: SchemaResult }>;
      };
      return data.streams[streamName].schema;
    };

    it('includes parameters for fields with advanced params like ignore_above', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(
        wiredStreamDef('logs.otel.test', [], {
          'scope.name': { type: 'keyword', ignore_above: 1024 },
          'body.text': { type: 'match_only_text' },
        })
      );
      streamsClient.getAncestors.mockResolvedValue([]);
      mockEsMethodResolvedValue(esClient.search, emptySearchResponse);

      const result = await tool.handler(
        { names: ['logs.otel.test'], aspects: ['schema'] },
        context
      );
      const schema = getSchema(result, 'logs.otel.test');

      const scopeName = schema.mapped_fields.find((f) => f.name === 'scope.name');
      expect(scopeName).toEqual({
        source: 'logs.otel.test',
        name: 'scope.name',
        type: 'keyword',
        parameters: { ignore_above: 1024 },
      });
    });

    it('omits parameters for fields without advanced params', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(
        wiredStreamDef('logs.otel.test', [], {
          'body.text': { type: 'match_only_text' },
        })
      );
      streamsClient.getAncestors.mockResolvedValue([]);
      mockEsMethodResolvedValue(esClient.search, emptySearchResponse);

      const result = await tool.handler(
        { names: ['logs.otel.test'], aspects: ['schema'] },
        context
      );
      const schema = getSchema(result, 'logs.otel.test');

      const bodyText = schema.mapped_fields.find((f) => f.name === 'body.text');
      expect(bodyText).toEqual({
        source: 'logs.otel.test',
        name: 'body.text',
        type: 'match_only_text',
      });
      expect(bodyText?.parameters).toBeUndefined();
    });

    it('surfaces ancestor field parameters through inheritance', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      const parentFields: FieldDefinition = {
        'scope.name': { type: 'keyword', ignore_above: 1024 },
        '@timestamp': { type: 'date' },
      };
      const childFields: FieldDefinition = {
        'attributes.process.name': { type: 'keyword' },
      };
      streamsClient.getStream.mockResolvedValue(wiredStreamDef('logs.otel.child', [], childFields));
      streamsClient.getAncestors.mockResolvedValue([wiredStreamDef('logs.otel', [], parentFields)]);
      mockEsMethodResolvedValue(esClient.search, emptySearchResponse);

      const result = await tool.handler(
        { names: ['logs.otel.child'], aspects: ['schema'] },
        context
      );
      const schema = getSchema(result, 'logs.otel.child');

      const scopeName = schema.mapped_fields.find((f) => f.name === 'scope.name');
      expect(scopeName).toEqual({
        source: 'logs.otel',
        name: 'scope.name',
        type: 'keyword',
        parameters: { ignore_above: 1024 },
      });

      const processName = schema.mapped_fields.find((f) => f.name === 'attributes.process.name');
      expect(processName).toEqual({
        source: 'logs.otel.child',
        name: 'attributes.process.name',
        type: 'keyword',
      });
      expect(processName?.parameters).toBeUndefined();
    });
  });

  describe('dynamic_mapping and unmapped_fields_note', () => {
    interface SchemaResult {
      dynamic_mapping: string;
      unmapped_fields_note: string;
      mapped_fields: unknown[];
      unmapped_fields: string[];
    }

    const getSchema = (result: ToolHandlerReturn, streamName: string): SchemaResult => {
      if (!('results' in result)) throw new Error('Expected results');
      const data = result.results[0].data as {
        streams: Record<string, { schema: SchemaResult }>;
      };
      return data.streams[streamName].schema;
    };

    it('returns dynamic_mapping: false for wired streams without calling indices.getMapping', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(wiredStreamDef('logs.ecs.nginx'));
      streamsClient.getAncestors.mockResolvedValue([]);
      mockEsMethodResolvedValue(esClient.search, emptySearchResponse);

      const result = await tool.handler(
        { names: ['logs.ecs.nginx'], aspects: ['schema'] },
        context
      );

      expect(esClient.indices.getMapping).not.toHaveBeenCalled();
      const schema = getSchema(result, 'logs.ecs.nginx');
      expect(schema.dynamic_mapping).toBe('false');
      expect(schema.unmapped_fields_note).toBe(getUnmappedFieldsNote(false));
      expect(schema.unmapped_fields_note).toContain('not indexed');
    });

    it('reads dynamic_mapping from ES for classic streams', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(classicStreamDef('logs-nginx'));
      mockEsMethodResolvedValue(esClient.search, emptySearchResponse);
      mockEsMethodResolvedValue(esClient.fieldCaps, mockFieldCapsResponse({}));
      mockEsMethodResolvedValue(esClient.indices.getMapping, {
        '.ds-logs-nginx-000001': {
          mappings: { dynamic: 'true', properties: {} },
        },
      });

      const result = await tool.handler({ names: ['logs-nginx'], aspects: ['schema'] }, context);

      expect(esClient.indices.getMapping).toHaveBeenCalledWith({ index: 'logs-nginx' });
      const schema = getSchema(result, 'logs-nginx');
      expect(schema.dynamic_mapping).toBe('true');
      expect(schema.unmapped_fields_note).toBe(getUnmappedFieldsNote('true'));
    });

    it('returns correct note for classic streams with dynamic: false', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(classicStreamDef('logs-strict'));
      mockEsMethodResolvedValue(esClient.search, emptySearchResponse);
      mockEsMethodResolvedValue(esClient.fieldCaps, mockFieldCapsResponse({}));
      mockEsMethodResolvedValue(esClient.indices.getMapping, {
        '.ds-logs-strict-000001': {
          mappings: { dynamic: 'false', properties: {} },
        },
      });

      const result = await tool.handler({ names: ['logs-strict'], aspects: ['schema'] }, context);

      const schema = getSchema(result, 'logs-strict');
      expect(schema.dynamic_mapping).toBe('false');
      expect(schema.unmapped_fields_note).toContain('not indexed');
      expect(schema.unmapped_fields_note).toContain('Add explicit field mappings');
    });

    it('returns correct note for classic streams with dynamic: runtime', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(classicStreamDef('logs-runtime'));
      mockEsMethodResolvedValue(esClient.search, emptySearchResponse);
      mockEsMethodResolvedValue(esClient.fieldCaps, mockFieldCapsResponse({}));
      mockEsMethodResolvedValue(esClient.indices.getMapping, {
        '.ds-logs-runtime-000001': {
          mappings: { dynamic: 'runtime', properties: {} },
        },
      });

      const result = await tool.handler({ names: ['logs-runtime'], aspects: ['schema'] }, context);

      const schema = getSchema(result, 'logs-runtime');
      expect(schema.dynamic_mapping).toBe('runtime');
      expect(schema.unmapped_fields_note).toContain('runtime fields');
    });
  });

  it('wired type_context mentions dynamic: false', async () => {
    const { tool, context, streamsClient } = setup();
    streamsClient.getStream.mockResolvedValue(wiredStreamDef('logs.ecs.nginx'));
    streamsClient.getAncestors.mockResolvedValue([]);

    const result = await tool.handler(
      { names: ['logs.ecs.nginx'], aspects: ['overview'] },
      context
    );

    const data = getData(result);
    expect(data.streams['logs.ecs.nginx'].type_context).toContain('dynamic: false');
  });

  describe('lifecycle aspect', () => {
    const wiredStreamWithIlm = (name: string): Streams.WiredStream.Definition => ({
      type: 'wired',
      name,
      description: `${name} stream`,
      updated_at: '2026-04-10T00:00:00.000Z',
      ingest: {
        wired: { fields: {}, routing: [] },
        processing: { steps: [], updated_at: '2026-04-10T00:00:00.000Z' },
        lifecycle: { ilm: { policy: 'my-logs-policy' } },
        failure_store: { inherit: {} },
        settings: {},
      },
    });

    const wiredStreamWithDsl = (name: string): Streams.WiredStream.Definition => ({
      type: 'wired',
      name,
      description: `${name} stream`,
      updated_at: '2026-04-10T00:00:00.000Z',
      ingest: {
        wired: { fields: {}, routing: [] },
        processing: { steps: [], updated_at: '2026-04-10T00:00:00.000Z' },
        lifecycle: { dsl: { data_retention: '30d' } },
        failure_store: { inherit: {} },
        settings: {},
      },
    });

    const mockDataStreamValue = (name: string) => ({
      name,
      timestamp_field: { name: '@timestamp' },
      indices: [
        {
          index_name: `.ds-${name}-000001`,
          index_uuid: 'uuid1',
          managed_by: 'Data stream lifecycle',
        },
      ],
      generation: 1,
      status: 'GREEN',
      next_generation_managed_by: 'Data stream lifecycle',
    });

    const mockStatsResponse = {
      _all: {
        primaries: {
          store: { size_in_bytes: 1024000 },
          docs: { count: 5000 },
        },
      },
    };

    interface LifecycleResult {
      retention: Record<string, unknown>;
      storage_size_bytes: number;
      storage_size_human: string;
      document_count: number;
      error?: string;
    }

    const getLifecycle = (result: ToolHandlerReturn, streamName: string): LifecycleResult => {
      const data = getData(result);
      return data.streams[streamName].lifecycle as unknown as LifecycleResult;
    };

    it('includes policy_phases for ILM streams', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(wiredStreamWithIlm('logs.ecs.nginx'));
      mockEsMethodResolvedValue(streamsClient.getDataStream, mockDataStreamValue('logs.ecs.nginx'));
      mockEsMethodResolvedValue(esClient.indices.stats, mockStatsResponse);
      mockEsMethodResolvedValue(esClient.ilm.getLifecycle, {
        'my-logs-policy': {
          policy: {
            phases: {
              hot: { min_age: '0ms', actions: {} },
              warm: { min_age: '7d', actions: {} },
              delete: { min_age: '90d', actions: { delete: {} } },
            },
          },
        },
      });

      const result = await tool.handler(
        { names: ['logs.ecs.nginx'], aspects: ['lifecycle'] },
        context
      );

      const lifecycle = getLifecycle(result, 'logs.ecs.nginx');
      expect(lifecycle.retention.type).toBe('ilm');
      expect(lifecycle.retention.policy_name).toBe('my-logs-policy');
      expect(lifecycle.retention.policy_phases).toEqual(['hot', 'warm', 'delete']);
    });

    it('does not include policy_phases for DSL streams', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(wiredStreamWithDsl('logs.ecs.nginx'));
      mockEsMethodResolvedValue(streamsClient.getDataStream, mockDataStreamValue('logs.ecs.nginx'));
      mockEsMethodResolvedValue(esClient.indices.stats, mockStatsResponse);

      const result = await tool.handler(
        { names: ['logs.ecs.nginx'], aspects: ['lifecycle'] },
        context
      );

      const lifecycle = getLifecycle(result, 'logs.ecs.nginx');
      expect(lifecycle.retention.type).toBe('dsl');
      expect(lifecycle.retention.data_retention).toBe('30d');
      expect(lifecycle.retention.policy_phases).toBeUndefined();
      expect(esClient.ilm.getLifecycle).not.toHaveBeenCalled();
    });

    it('gracefully degrades when ILM policy fetch fails', async () => {
      const { tool, context, streamsClient, esClient } = setup();
      streamsClient.getStream.mockResolvedValue(wiredStreamWithIlm('logs.ecs.nginx'));
      mockEsMethodResolvedValue(streamsClient.getDataStream, mockDataStreamValue('logs.ecs.nginx'));
      mockEsMethodResolvedValue(esClient.indices.stats, mockStatsResponse);
      esClient.ilm.getLifecycle.mockRejectedValue(new Error('policy not found'));

      const result = await tool.handler(
        { names: ['logs.ecs.nginx'], aspects: ['lifecycle'] },
        context
      );

      const lifecycle = getLifecycle(result, 'logs.ecs.nginx');
      expect(lifecycle.retention.type).toBe('ilm');
      expect(lifecycle.retention.policy_name).toBe('my-logs-policy');
      expect(lifecycle.retention.policy_phases).toBeUndefined();
      expect(lifecycle.storage_size_bytes).toBe(1024000);
    });
  });
});
