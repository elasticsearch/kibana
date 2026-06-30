/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { taxiiAdapter } from './taxii_adapter';
import type { AdapterRunContext, ScopedActionsClient, SourceHit } from '../types';

const COLLECTION_URL =
  'https://taxii.example/api1/collections/aabbccdd-1234-4abc-9def-000000000001/objects/';
const NOW = new Date('2026-05-16T12:00:00.000Z');

const buildSource = (overrides?: Partial<SourceHit['_source']['config']>): SourceHit => ({
  _id: 'taxii:vendor',
  _source: {
    adapter_type: 'taxii',
    name: 'Vendor TAXII',
    config: { url: COLLECTION_URL, ...overrides },
  },
});

const buildContext = (overrides?: {
  fetchImpl?: jest.Mock<Promise<Response>, [string | URL | Request, RequestInit?]>;
  getActionsClient?: () => Promise<ScopedActionsClient | undefined>;
}): AdapterRunContext => ({
  esClient: elasticsearchServiceMock.createElasticsearchClient(),
  logger: loggingSystemMock.createLogger(),
  abortSignal: new AbortController().signal,
  now: () => NOW,
  fetchFn: overrides?.fetchImpl as unknown as typeof fetch,
  getActionsClient: overrides?.getActionsClient,
});

describe('taxiiAdapter', () => {
  describe('anonymous transport (no connector_id)', () => {
    it('derives the collection id from the URL and emits per-SDO reports', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            objects: [
              {
                type: 'indicator',
                id: 'indicator--1',
                name: 'Bad IP',
                modified: '2026-05-15T00:00:00Z',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/taxii+json;version=2.1' },
          }
        )
      );
      const reports = await taxiiAdapter.run(buildSource(), buildContext({ fetchImpl: fetchMock }));
      expect(reports).toHaveLength(1);
      expect(reports[0].provenance.source_doc_ref).toEqual({
        index: 'taxii:collection:aabbccdd-1234-4abc-9def-000000000001',
        id: 'indicator--1',
      });
      expect(reports[0].source).toMatchObject({
        type: 'taxii',
        adapter_id: 'taxii:taxii:vendor',
        url: COLLECTION_URL,
      });
    });

    it('falls back to "unknown" when the URL has no /collections/ segment', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ objects: [{ type: 'indicator', id: 'indicator--1', name: 'x' }] }),
            { status: 200 }
          )
        );
      const odd: SourceHit = {
        _id: 'taxii:weird',
        _source: {
          adapter_type: 'taxii',
          name: 'Weird',
          config: { url: 'https://taxii.example/feed' },
        },
      };
      const reports = await taxiiAdapter.run(odd, buildContext({ fetchImpl: fetchMock }));
      expect(reports[0].provenance.source_doc_ref?.index).toBe('taxii:collection:unknown');
    });
  });

  describe('credentialed transport (config.connector_id set)', () => {
    it('invokes the .taxii connector pollCollection sub-action and reuses splitStixBundle', async () => {
      const execute = jest.fn().mockResolvedValue({
        actionId: 'connector-1',
        status: 'ok',
        data: {
          objects: [
            {
              type: 'indicator',
              id: 'indicator--cred-1',
              name: 'Credentialed IOC',
              modified: '2026-05-15T00:00:00Z',
            },
          ],
          more: false,
        },
      });
      const fakeActionsClient = { execute } as unknown as ScopedActionsClient;

      const reports = await taxiiAdapter.run(
        buildSource({ connector_id: 'connector-1' }),
        buildContext({ getActionsClient: async () => fakeActionsClient })
      );

      expect(execute).toHaveBeenCalledWith({
        actionId: 'connector-1',
        params: {
          subAction: 'pollCollection',
          subActionParams: { collectionUrl: COLLECTION_URL },
        },
      });
      expect(reports).toHaveLength(1);
      expect(reports[0].source).toMatchObject({
        type: 'taxii',
        url: COLLECTION_URL,
      });
      expect(reports[0].provenance.source_doc_ref?.id).toBe('indicator--cred-1');
    });

    it('throws when the connector returns status: error', async () => {
      const execute = jest.fn().mockResolvedValue({
        actionId: 'connector-1',
        status: 'error',
        message: 'Unauthorized',
      });
      const fakeActionsClient = { execute } as unknown as ScopedActionsClient;

      await expect(
        taxiiAdapter.run(
          buildSource({ connector_id: 'connector-1' }),
          buildContext({ getActionsClient: async () => fakeActionsClient })
        )
      ).rejects.toThrow(/connector "connector-1" pollCollection failed: Unauthorized/);
    });

    it('throws when connector_id is set but no actions factory is available in the context', async () => {
      await expect(
        taxiiAdapter.run(buildSource({ connector_id: 'connector-1' }), buildContext({}))
      ).rejects.toThrow(/actions plugin is not available/);
    });

    it('throws when the actions factory resolves to undefined', async () => {
      await expect(
        taxiiAdapter.run(
          buildSource({ connector_id: 'connector-1' }),
          buildContext({ getActionsClient: async () => undefined })
        )
      ).rejects.toThrow(/no ActionsClient could be resolved/);
    });
  });
});
