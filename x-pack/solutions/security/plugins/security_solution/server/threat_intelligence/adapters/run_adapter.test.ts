/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { __getRegisteredAdapterTypesForTest, runAdapter, UnknownAdapterError } from './run_adapter';
import type { AdapterRunContext, SourceHit } from './types';

const buildContext = (): AdapterRunContext => ({
  esClient: elasticsearchServiceMock.createElasticsearchClient(),
  logger: loggingSystemMock.createLogger(),
  abortSignal: new AbortController().signal,
  now: () => new Date('2026-05-16T12:00:00.000Z'),
  fetchFn: jest.fn() as unknown as typeof fetch,
});

describe('runAdapter', () => {
  it('registers exactly the network-pulled adapter types', () => {
    // `email`, `manual`, and `telemetry` are intentionally absent —
    // they are handled by other code paths and registering them here
    // would suggest the source-ingestion workflow could pull them.
    expect(__getRegisteredAdapterTypesForTest().sort()).toEqual(
      ['rss', 'stix', 'taxii', 'vendor_api'].sort()
    );
  });

  it('throws UnknownAdapterError for unsupported adapter_type values', async () => {
    const source: SourceHit = {
      _id: 'manual:1',
      _source: {
        adapter_type: 'manual',
        name: 'Analyst paste',
        config: {},
      },
    };
    await expect(runAdapter(source, buildContext())).rejects.toBeInstanceOf(UnknownAdapterError);
  });
});
