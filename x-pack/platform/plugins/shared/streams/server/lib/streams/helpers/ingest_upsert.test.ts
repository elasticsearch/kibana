/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Streams } from '@kbn/streams-schema';
import { getStreamAttachmentIds, updateClassicIngest, updateWiredIngest } from './ingest_upsert';

const now = '2026-06-15T12:14:50.416Z';
const queryStreams = [{ name: 'logs.ecs.android.pixel1qs' }];

const createMockClients = (definition: Streams.ingest.all.Definition) => {
  const upsertStream = jest.fn().mockResolvedValue({ acknowledged: true, result: 'updated' });

  return {
    streamsClient: {
      getStream: jest.fn().mockResolvedValue(definition),
      upsertStream,
    },
    attachmentClient: {
      getAttachments: jest.fn().mockResolvedValue([]),
    },
    upsertStream,
  };
};

describe('ingest_upsert', () => {
  it('preserves query_streams when updating wired ingest', async () => {
    const definition: Streams.WiredStream.Definition = {
      type: 'wired',
      name: 'logs.ecs.android',
      description: '',
      updated_at: now,
      query_streams: queryStreams,
      ingest: {
        lifecycle: { inherit: {} },
        processing: { steps: [], updated_at: now },
        settings: {},
        wired: {
          fields: {},
          routing: [],
        },
        failure_store: { inherit: {} },
      },
    };
    const { streamsClient, attachmentClient, upsertStream } = createMockClients(definition);

    await updateWiredIngest({
      streamsClient: streamsClient as never,
      attachmentClient: attachmentClient as never,
      name: definition.name,
      ingest: {
        ...definition.ingest,
        processing: { steps: [] },
      },
    });

    expect(upsertStream).toHaveBeenCalledWith({
      name: definition.name,
      request: expect.objectContaining({
        stream: expect.objectContaining({
          query_streams: queryStreams,
        }),
      }),
    });
  });

  it('preserves query_streams when updating classic ingest', async () => {
    const definition: Streams.ClassicStream.Definition = {
      type: 'classic',
      name: 'logs-classic-android',
      description: '',
      updated_at: now,
      query_streams: queryStreams,
      ingest: {
        lifecycle: { inherit: {} },
        processing: { steps: [], updated_at: now },
        settings: {},
        classic: {},
        failure_store: { inherit: {} },
      },
    };
    const { streamsClient, attachmentClient, upsertStream } = createMockClients(definition);

    await updateClassicIngest({
      streamsClient: streamsClient as never,
      attachmentClient: attachmentClient as never,
      name: definition.name,
      ingest: {
        ...definition.ingest,
        processing: { steps: [] },
      },
    });

    expect(upsertStream).toHaveBeenCalledWith({
      name: definition.name,
      request: expect.objectContaining({
        stream: expect.objectContaining({
          query_streams: queryStreams,
        }),
      }),
    });
  });

  describe('getStreamAttachmentIds', () => {
    it('partitions attachments into dashboard and rule ids', async () => {
      const attachmentClient = {
        getAttachments: jest.fn().mockResolvedValue([
          { type: 'dashboard', id: 'dashboard-1' },
          { type: 'rule', id: 'rule-1' },
          { type: 'dashboard', id: 'dashboard-2' },
          { type: 'rule', id: 'rule-2' },
        ]),
      };

      const result = await getStreamAttachmentIds({
        name: 'logs.otel',
        attachmentClient: attachmentClient as never,
      });

      expect(attachmentClient.getAttachments).toHaveBeenCalledWith('logs.otel');
      expect(result).toEqual({
        dashboards: ['dashboard-1', 'dashboard-2'],
        rules: ['rule-1', 'rule-2'],
      });
    });

    it('returns empty arrays when the stream has no attachments', async () => {
      const attachmentClient = { getAttachments: jest.fn().mockResolvedValue([]) };

      const result = await getStreamAttachmentIds({
        name: 'logs.otel',
        attachmentClient: attachmentClient as never,
      });

      expect(result).toEqual({ dashboards: [], rules: [] });
    });
  });
});
