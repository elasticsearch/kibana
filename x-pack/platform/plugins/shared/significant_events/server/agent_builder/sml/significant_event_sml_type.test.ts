/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { KibanaRequest } from '@kbn/core/server';
import type { SignificantEvent } from '@kbn/significant-events-schema';
import { SIGNIFICANT_EVENT_KI_TYPE } from '@kbn/agent-builder-elastic-ai-index-ki-types';
import { SIGNIFICANT_EVENT_ATTACHMENT_TYPE } from '../../../common';
import type { GetScopedClients, RouteHandlerScopedClients } from '../../routes/types';
import { EventService } from '../../lib/significant_events/events/event_service';
import { createSignificantEventSmlType } from './significant_event_sml_type';

jest.mock('../../lib/significant_events/events/event_service', () => ({
  EventService: jest.fn(),
}));

const event: SignificantEvent = {
  '@timestamp': '2026-01-01T00:00:00.000Z',
  event_uuid: 'event-1',
  event_id: 'payment-outage',
  workflow_execution_id: 'workflow-1',
  status: 'open',
  stream_names: ['logs.payment'],
  title: 'Payment outage',
  symptom_hypothesis: 'Payment gateway timeout.',
  summary: 'Payments are failing.',
  severity: '60-high',
  confidence: 0.8,
};

const findLatestPaginated = jest.fn();
const findByEventId = jest.fn();

const createGetScopedClients = (
  events: SignificantEvent[]
): jest.MockedFunction<GetScopedClients> => {
  const getEventClient = jest.fn(() => ({
    findByEventId: jest.fn().mockResolvedValue({ hits: events }),
  }));

  return jest.fn().mockResolvedValue({
    getEventClient,
  } as unknown as RouteHandlerScopedClients) as jest.MockedFunction<GetScopedClients>;
};

describe('createSignificantEventSmlType', () => {
  beforeEach(() => {
    findLatestPaginated.mockReset();
    findByEventId.mockReset();
    jest.mocked(EventService).mockImplementation(
      () =>
        ({
          getClient: jest.fn(() => ({
            findLatestPaginated,
            findByEventId,
          })),
        } as unknown as EventService)
    );
  });

  it('equals SIGNIFICANT_EVENT_KI_TYPE', () => {
    const smlType = createSignificantEventSmlType({
      getScopedClients: createGetScopedClients([]),
    });

    expect(smlType.id).toBe(SIGNIFICANT_EVENT_KI_TYPE);
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
    findByEventId.mockResolvedValue({ hits: [event] });
    const smlType = createSignificantEventSmlType({
      getScopedClients: createGetScopedClients([]),
    });

    const result = await smlType.getSmlEntry('payment-outage', {
      esClient: {} as never,
      savedObjectsClient: {} as never,
      logger: loggingSystemMock.createLogger(),
    });

    expect(result).toEqual(
      expect.objectContaining({
        type: SIGNIFICANT_EVENT_KI_TYPE,
        title: 'Payment outage',
      })
    );
    expect(result).not.toHaveProperty('permissions');
    expect(result?.content).toContain('Payment gateway timeout.');
    expect(findByEventId).toHaveBeenCalledWith('payment-outage');
  });

  it('getPermissions returns the streams read API privilege', () => {
    const smlType = createSignificantEventSmlType({
      getScopedClients: createGetScopedClients([]),
    });
    const permissions = smlType.getPermissions!('payment-outage', {
      esClient: {} as never,
      savedObjectsClient: {} as never,
      logger: loggingSystemMock.createLogger(),
    });
    expect(permissions).toEqual({
      kibana: { privileges: { name: [`ai_index:${SIGNIFICANT_EVENT_KI_TYPE}/read`] } },
    });
  });

  it('converts an SML document into an attachment', async () => {
    const smlType = createSignificantEventSmlType({
      getScopedClients: createGetScopedClients([event]),
    });

    await expect(
      smlType.toAttachment(
        {
          type: SIGNIFICANT_EVENT_KI_TYPE,
          title: 'Payment outage',
          content: 'Payment outage',
          attributes: {
            id: 'chunk-1',
            origin: { uri: `${SIGNIFICANT_EVENT_KI_TYPE}://payment-outage` },
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            ingestion_method: 'manual',
          },
          permissions: {
            kibana: {
              privileges: [
                {
                  space: 'default',
                  name: [`ai_index:${SIGNIFICANT_EVENT_KI_TYPE}/read`],
                  count: 1,
                },
              ],
            },
          },
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
