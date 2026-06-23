/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { KibanaRequest } from '@kbn/core/server';
import {
  hashContent,
  type VersionedAttachmentWithOrigin,
} from '@kbn/agent-builder-common/attachments';
import type { AttachmentResolveContext } from '@kbn/agent-builder-server/attachments';
import type { SigEvent } from '@kbn/streams-schema';
import { SIGNIFICANT_EVENT_ATTACHMENT_TYPE } from '../../../common';
import type { GetScopedClients, RouteHandlerScopedClients } from '../../routes/types';
import {
  createSignificantEventAttachmentType,
  formatSignificantEventAsText,
} from './significant_event_attachment_type';

const event: SigEvent = {
  '@timestamp': '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  event_id: 'event-1',
  discovery_id: 'discovery-1',
  discovery_slug: 'payment-outage',
  status: 'promoted',
  workflow_execution_id: 'workflow-1',
  rule_names: ['Payment errors'],
  stream_names: ['logs.payment'],
  title: 'Payment outage',
  summary: 'Payments are failing.',
  root_cause: 'Payment gateway timeout.',
  criticality: 90,
  confidence: 0.8,
  impact: 'high',
  recommendations: ['Restart gateway client'],
};

const createContext = (): AttachmentResolveContext => ({
  request: {} as KibanaRequest,
  spaceId: 'default',
});

const createGetScopedClients = (events: SigEvent[]): jest.MockedFunction<GetScopedClients> => {
  const getEventClient = jest.fn(() => ({
    findByDiscoverySlug: jest.fn().mockResolvedValue({ hits: events }),
  }));

  return jest.fn().mockResolvedValue({
    getEventClient,
  } as unknown as RouteHandlerScopedClients) as jest.MockedFunction<GetScopedClients>;
};

const createVersionedAttachment = (
  data: SigEvent
): VersionedAttachmentWithOrigin<typeof SIGNIFICANT_EVENT_ATTACHMENT_TYPE, SigEvent> => ({
  id: 'attachment-1',
  type: SIGNIFICANT_EVENT_ATTACHMENT_TYPE,
  origin: data.discovery_slug,
  current_version: 1,
  versions: [
    {
      version: 1,
      data,
      created_at: '2026-01-01T00:00:00.000Z',
      content_hash: hashContent(data),
    },
  ],
});

describe('createSignificantEventAttachmentType', () => {
  it('validates a significant event payload', async () => {
    const type = createSignificantEventAttachmentType({
      logger: loggingSystemMock.createLogger(),
      getScopedClients: createGetScopedClients([]),
    });

    await expect(Promise.resolve(type.validate(event))).resolves.toEqual({
      valid: true,
      data: event,
    });
    await expect(
      Promise.resolve(type.validate({ title: 'Missing required fields' }))
    ).resolves.toEqual(expect.objectContaining({ valid: false }));
  });

  it('resolves the latest event by discovery slug', async () => {
    const updatedEvent = { ...event, event_id: 'event-2', status: 'acknowledged' as const };
    const type = createSignificantEventAttachmentType({
      logger: loggingSystemMock.createLogger(),
      getScopedClients: createGetScopedClients([event, updatedEvent]),
    });

    await expect(type.resolve?.('payment-outage', createContext())).resolves.toEqual(updatedEvent);
  });

  it('reports stale when the latest event differs from the stored snapshot', async () => {
    const updatedEvent = { ...event, event_id: 'event-2', status: 'acknowledged' as const };
    const type = createSignificantEventAttachmentType({
      logger: loggingSystemMock.createLogger(),
      getScopedClients: createGetScopedClients([updatedEvent]),
    });

    await expect(type.isStale?.(createVersionedAttachment(event), createContext())).resolves.toBe(
      true
    );
  });

  it('reports stale when the latest event timestamp differs from the stored snapshot', async () => {
    const updatedEvent = { ...event, '@timestamp': '2026-01-01T00:01:00.000Z' };
    const type = createSignificantEventAttachmentType({
      logger: loggingSystemMock.createLogger(),
      getScopedClients: createGetScopedClients([updatedEvent]),
    });

    await expect(type.isStale?.(createVersionedAttachment(event), createContext())).resolves.toBe(
      true
    );
  });

  it('does not report stale when event identity and timestamp match', async () => {
    const updatedEvent = { ...event, summary: 'Updated summary.' };
    const type = createSignificantEventAttachmentType({
      logger: loggingSystemMock.createLogger(),
      getScopedClients: createGetScopedClients([updatedEvent]),
    });

    await expect(type.isStale?.(createVersionedAttachment(event), createContext())).resolves.toBe(
      false
    );
  });

  it('formats useful LLM text and exposes attachment metadata', async () => {
    const type = createSignificantEventAttachmentType({
      logger: loggingSystemMock.createLogger(),
      getScopedClients: createGetScopedClients([]),
    });

    expect(formatSignificantEventAsText(event)).toContain('Payment outage');
    expect(formatSignificantEventAsText(event)).toContain('Payment gateway timeout.');
    expect(type.isReadonly).toBe(true);
    expect(type.getTools?.()).toEqual([]);
    expect(type.getAgentDescription?.()).toContain('significant event attachment');
  });
});
