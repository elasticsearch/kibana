/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { KibanaRequest } from '@kbn/core/server';
import type { SigEvent } from '@kbn/streams-schema';
import { SIGNIFICANT_EVENT_ATTACHMENT_TYPE, SIGNIFICANT_EVENT_SML_TYPE } from '../../../common';
import type { GetScopedClients, RouteHandlerScopedClients } from '../../routes/types';
import { EventService } from '../../lib/sig_events/events/event_service';
import { createSignificantEventSmlType } from './significant_event_sml_type';

jest.mock('../../lib/sig_events/events/event_service', () => ({
  EventService: jest.fn(),
}));

const event: SigEvent = {
  '@timestamp': '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  event_id: 'event-1',
  discovery_id: 'discovery-1',
  discovery_slug: 'payment-outage',
  workflow_execution_id: 'workflow-1',
  rule_names: [],
  status: 'promoted',
  stream_names: ['logs.payment'],
  title: 'Payment outage',
  summary: 'Payments are failing.',
  root_cause: 'Payment gateway timeout.',
  criticality: 90,
  confidence: 0.8,
  impact: 'high',
  recommendations: ['Restart gateway client'],
};

const findLatestPaginated = jest.fn();
const findByDiscoverySlug = jest.fn();

const createGetScopedClients = (events: SigEvent[]): jest.MockedFunction<GetScopedClients> => {
  const getEventClient = jest.fn(() => ({
    findByDiscoverySlug: jest.fn().mockResolvedValue({ hits: events }),
  }));

  return jest.fn().mockResolvedValue({
    getEventClient,
  } as unknown as RouteHandlerScopedClients) as jest.MockedFunction<GetScopedClients>;
};

describe('createSignificantEventSmlType', () => {
  beforeEach(() => {
    findLatestPaginated.mockReset();
    findByDiscoverySlug.mockReset();
    jest.mocked(EventService).mockImplementation(
      () =>
        ({
          getClient: jest.fn(() => ({
            findLatestPaginated,
            findByDiscoverySlug,
          })),
        } as unknown as EventService)
    );
  });

  it('lists significant events for SML indexing', async () => {
    findLatestPaginated.mockResolvedValue({ hits: [event] });
    const smlType = createSignificantEventSmlType({
      getScopedClients: createGetScopedClients([]),
    });

    const iterator = smlType.list({
      esClient: {} as never,
      savedObjectsClient: {} as never,
      logger: loggingSystemMock.createLogger(),
    });

    await expect(iterator[Symbol.asyncIterator]().next()).resolves.toEqual({
      done: false,
      value: [
        {
          id: 'payment-outage',
          updatedAt: '2026-01-01T00:00:00.000Z',
          spaces: ['*'],
        },
      ],
    });
    expect(findLatestPaginated).toHaveBeenCalledWith({ page: 1, perPage: 100 });
  });

  it('indexes a significant event chunk', async () => {
    findByDiscoverySlug.mockResolvedValue({ hits: [event] });
    const smlType = createSignificantEventSmlType({
      getScopedClients: createGetScopedClients([]),
    });

    const result = await smlType.getSmlData('payment-outage', {
      esClient: {} as never,
      savedObjectsClient: {} as never,
      logger: loggingSystemMock.createLogger(),
    });

    expect(result).toEqual({
      chunks: [
        expect.objectContaining({
          type: SIGNIFICANT_EVENT_SML_TYPE,
          title: 'Payment outage',
          permissions: {
            kibana: { privileges: [{ name: 'api:read_stream' }] },
            elasticsearch: { indices: [] },
          },
        }),
      ],
    });
    expect(result?.chunks[0].content).toContain('Payment gateway timeout.');
    expect(findByDiscoverySlug).toHaveBeenCalledWith('payment-outage');
  });

  it('converts an SML document into an attachment', async () => {
    const smlType = createSignificantEventSmlType({
      getScopedClients: createGetScopedClients([event]),
    });

    await expect(
      smlType.toAttachment(
        {
          id: 'chunk-1',
          type: SIGNIFICANT_EVENT_SML_TYPE,
          title: 'Payment outage',
          origin_id: 'payment-outage',
          origin: { uri: `${SIGNIFICANT_EVENT_SML_TYPE}://payment-outage` },
          content: 'Payment outage',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          spaces: ['default'],
          permissions: {
            kibana: { privileges: [{ name: 'api:read_stream' }] },
            elasticsearch: { indices: [] },
          },
          ingestion_method: 'manual',
        },
        {
          request: {} as KibanaRequest,
          savedObjectsClient: {} as never,
          spaceId: 'default',
        }
      )
    ).resolves.toEqual({
      type: SIGNIFICANT_EVENT_ATTACHMENT_TYPE,
      origin: 'payment-outage',
      data: event,
    });
  });
});
