/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Streams } from '@kbn/streams-schema';
import { createUpdateStreamTool } from './update_stream';
import { STREAMS_UPDATE_STREAM_TOOL_ID } from '../tool_ids';
import { createMockGetScopedClients, createMockToolContext } from '../../utils/test_helpers';
import { StreamsWriteQueue } from '../../utils/write_queue';
import { DefinitionNotFoundError } from '../../../lib/streams/errors/definition_not_found_error';

const queryStreamDef = (
  name: string,
  overrides: Partial<Streams.QueryStream.Definition> = {}
): Streams.QueryStream.Definition => ({
  type: 'query',
  name,
  description: 'test',
  updated_at: '2026-04-10T00:00:00.000Z',
  query: { esql: '', view: `$.${name}` },
  ...overrides,
});

describe('update_stream tool', () => {
  it('has the expected tool id', () => {
    expect(STREAMS_UPDATE_STREAM_TOOL_ID).toBe('platform.streams.update_stream');
  });

  describe('query stream changes', () => {
    const setup = () => {
      const { getScopedClients, streamsClient, attachmentClient, uiSettingsClient } =
        createMockGetScopedClients();
      const writeQueue = new StreamsWriteQueue();
      const tool = createUpdateStreamTool({ getScopedClients, writeQueue });
      const context = createMockToolContext();
      return { tool, context, streamsClient, attachmentClient, uiSettingsClient };
    };

    const getData = (result: Awaited<ReturnType<ReturnType<typeof setup>['tool']['handler']>>) => {
      if (!('results' in result)) throw new Error('Expected results');
      return result.results[0];
    };

    it('confirmation title reflects query stream creation when changes.query is set', async () => {
      const { tool } = setup();

      const confirmation = await tool.confirmation!.getConfirmation!({
        toolParams: {
          name: 'logs.ecs.errors',
          changes: { query: { esql: 'FROM logs.ecs' } },
        },
      });

      expect(confirmation.title).toBe('Create or update query stream "logs.ecs.errors"');
    });

    it('confirmation title is the generic update title for ingest changes', async () => {
      const { tool } = setup();

      const confirmation = await tool.confirmation!.getConfirmation!({
        toolParams: {
          name: 'logs.ecs.nginx',
          changes: { description: 'updated' },
        },
      });

      expect(confirmation.title).toBe('Update stream "logs.ecs.nginx"');
    });

    it('creates a query stream when it does not exist yet', async () => {
      const { tool, context, streamsClient } = setup();

      streamsClient.getStream.mockRejectedValue(new DefinitionNotFoundError('not found'));

      const result = await tool.handler(
        {
          name: 'logs.ecs.errors',
          changes: {
            query: {
              esql: 'FROM logs.ecs | WHERE log.level == "error"',
              field_descriptions: { 'error.message': 'The error text' },
            },
          },
        },
        context
      );

      // Parent is ensured so a stored definition exists to attach the query stream under.
      expect(streamsClient.ensureStream).toHaveBeenCalledWith('logs.ecs');
      expect(streamsClient.createQueryStream).toHaveBeenCalledWith({
        name: 'logs.ecs.errors',
        query: { view: '$.logs.ecs.errors', esql: 'FROM logs.ecs | WHERE log.level == "error"' },
        field_descriptions: { 'error.message': 'The error text' },
      });
      expect(streamsClient.upsertStream).not.toHaveBeenCalled();

      const entry = getData(result);
      expect(entry.type).toBe('other');
      const data = entry.data as Record<string, unknown>;
      expect(data.success).toBe(true);
      expect(data.stream_type).toBe('query');
      expect(data.applied_changes).toEqual(['query']);
      expect(data.result).toBe('created');
    });

    it('creates a query stream with a description when both are provided', async () => {
      const { tool, context, streamsClient } = setup();

      streamsClient.getStream.mockRejectedValue(new DefinitionNotFoundError('not found'));

      const result = await tool.handler(
        {
          name: 'logs.ecs.errors',
          changes: {
            query: { esql: 'FROM logs.ecs | WHERE log.level == "error"' },
            description: 'Error-level logs from the ECS stream',
          },
        },
        context
      );

      expect(streamsClient.createQueryStream).toHaveBeenCalledWith({
        name: 'logs.ecs.errors',
        query: { view: '$.logs.ecs.errors', esql: 'FROM logs.ecs | WHERE log.level == "error"' },
        description: 'Error-level logs from the ECS stream',
      });

      const data = getData(result).data as Record<string, unknown>;
      expect(data.applied_changes).toEqual(['query', 'description']);
    });

    it('updates the ES|QL of an existing query stream', async () => {
      const { tool, context, streamsClient } = setup();

      streamsClient.getStream.mockResolvedValue(queryStreamDef('logs.ecs.errors'));
      streamsClient.upsertStream.mockResolvedValue({ acknowledged: true, result: 'updated' });

      const result = await tool.handler(
        {
          name: 'logs.ecs.errors',
          changes: { query: { esql: 'FROM logs.ecs | WHERE log.level == "warn"' } },
        },
        context
      );

      expect(streamsClient.createQueryStream).not.toHaveBeenCalled();
      expect(streamsClient.upsertStream).toHaveBeenCalledWith({
        name: 'logs.ecs.errors',
        request: expect.objectContaining({
          stream: expect.objectContaining({
            query: { view: '$.logs.ecs.errors', esql: 'FROM logs.ecs | WHERE log.level == "warn"' },
          }),
        }),
      });

      const data = getData(result).data as Record<string, unknown>;
      expect(data.result).toBe('updated');
      expect(data.applied_changes).toEqual(['query']);
    });

    it('updates the description of an existing query stream alongside its ES|QL', async () => {
      const { tool, context, streamsClient } = setup();

      streamsClient.getStream.mockResolvedValue(queryStreamDef('logs.ecs.errors'));
      streamsClient.upsertStream.mockResolvedValue({ acknowledged: true, result: 'updated' });

      await tool.handler(
        {
          name: 'logs.ecs.errors',
          changes: {
            query: { esql: 'FROM logs.ecs | WHERE log.level == "warn"' },
            description: 'Warn-level logs',
          },
        },
        context
      );

      expect(streamsClient.upsertStream).toHaveBeenCalledWith({
        name: 'logs.ecs.errors',
        request: expect.objectContaining({
          stream: expect.objectContaining({
            description: 'Warn-level logs',
          }),
        }),
      });
    });

    it('returns an error when query streams are not enabled', async () => {
      const { tool, context, streamsClient, uiSettingsClient } = setup();

      uiSettingsClient.get.mockResolvedValue(false);

      const result = await tool.handler(
        { name: 'logs.ecs.errors', changes: { query: { esql: 'FROM logs.ecs' } } },
        context
      );

      const entry = getData(result);
      expect(entry.type).toBe('error');
      const data = entry.data as Record<string, unknown>;
      expect(data.message).toContain('not enabled');
      expect(streamsClient.createQueryStream).not.toHaveBeenCalled();
      expect(streamsClient.upsertStream).not.toHaveBeenCalled();
    });

    it('rejects combining changes.query with ingest-only change types', async () => {
      const { tool, context, streamsClient } = setup();

      const result = await tool.handler(
        {
          name: 'logs.ecs.errors',
          changes: {
            query: { esql: 'FROM logs.ecs' },
            processing: [{ action: 'grok', from: 'message', patterns: ['%{GREEDYDATA}'] }],
          },
        },
        context
      );

      const entry = getData(result);
      expect(entry.type).toBe('error');
      const data = entry.data as Record<string, unknown>;
      expect(data.message).toContain('processing');
      expect(streamsClient.getStream).not.toHaveBeenCalled();
      expect(streamsClient.createQueryStream).not.toHaveBeenCalled();
    });
  });
});
