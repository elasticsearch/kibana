/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { StreamsRepositoryClient } from '@kbn/streams-plugin/public/api';
import {
  adaptDocToResolverInputs,
  useResolvedDefinitionName,
} from './use_resolved_definition_name';

const buildClient = (fetchImpl: jest.Mock): StreamsRepositoryClient =>
  ({ fetch: fetchImpl } as unknown as StreamsRepositoryClient);

describe('adaptDocToResolverInputs', () => {
  const buildDoc = (raw: Record<string, unknown>, flattened: Record<string, unknown>) =>
    ({ raw, flattened } as unknown as DataTableRecord);

  it('extracts the index from the raw record', () => {
    expect(adaptDocToResolverInputs(buildDoc({ _index: 'logs-foo-default' }, {}))).toEqual({
      index: 'logs-foo-default',
      fallbackStreamName: undefined,
    });
  });

  it('prefers the wired stream.name as fallback', () => {
    expect(
      adaptDocToResolverInputs(
        buildDoc(
          { _index: 'idx' },
          {
            'stream.name': 'logs.my-stream',
            'data_stream.type': 'logs',
            'data_stream.dataset': 'foo',
            'data_stream.namespace': 'default',
          }
        )
      )
    ).toEqual({ index: 'idx', fallbackStreamName: 'logs.my-stream' });
  });

  it('falls back to the DSNS triplet when stream.name is absent', () => {
    expect(
      adaptDocToResolverInputs(
        buildDoc(
          {},
          {
            'data_stream.type': 'logs',
            'data_stream.dataset': 'foo',
            'data_stream.namespace': 'default',
          }
        )
      )
    ).toEqual({ index: undefined, fallbackStreamName: 'logs-foo-default' });
  });

  it('returns no fallback when neither stream.name nor full DSNS triplet are present', () => {
    expect(
      adaptDocToResolverInputs(
        buildDoc({}, { 'data_stream.type': 'logs', 'data_stream.dataset': 'foo' })
      )
    ).toEqual({ index: undefined, fallbackStreamName: undefined });
  });
});

describe('useResolvedDefinitionName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves the definition via _resolve_index when an index is provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ stream: { name: 'logs.resolved' } });
    const streamsRepositoryClient = buildClient(fetchMock);
    const { result } = renderHook(() =>
      useResolvedDefinitionName({
        streamsRepositoryClient,
        index: 'logs-foo-default',
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(
      'GET /internal/streams/_resolve_index',
      expect.objectContaining({
        params: { query: { index: 'logs-foo-default' } },
      })
    );
    expect(result.current.value).toEqual({ name: 'logs.resolved', existsLocally: true });
  });

  it('returns the fallback name without probing when CPS is disabled', async () => {
    const fetchMock = jest.fn();
    const streamsRepositoryClient = buildClient(fetchMock);
    const { result } = renderHook(() =>
      useResolvedDefinitionName({
        streamsRepositoryClient,
        fallbackStreamName: 'logs.fallback',
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.value).toEqual({ name: 'logs.fallback', existsLocally: true });
  });

  it('marks the stream as locally existing when CPS probe succeeds', async () => {
    const fetchMock = jest.fn().mockResolvedValue({});
    const streamsRepositoryClient = buildClient(fetchMock);
    const { result } = renderHook(() =>
      useResolvedDefinitionName({
        streamsRepositoryClient,
        fallbackStreamName: 'logs.fallback',
        cpsHasLinkedProjects: true,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(
      'GET /api/streams/{name} 2023-10-31',
      expect.objectContaining({
        params: { path: { name: 'logs.fallback' } },
      })
    );
    expect(result.current.value).toEqual({ name: 'logs.fallback', existsLocally: true });
  });

  it('marks the stream as remote when CPS probe fails', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('not found'));
    const streamsRepositoryClient = buildClient(fetchMock);
    const { result } = renderHook(() =>
      useResolvedDefinitionName({
        streamsRepositoryClient,
        fallbackStreamName: 'logs.fallback',
        cpsHasLinkedProjects: true,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.value).toEqual({
      name: 'logs.fallback',
      existsLocally: false,
      remoteProject: 'unknown',
    });
  });

  it('returns undefined when neither index nor fallback are provided', async () => {
    const fetchMock = jest.fn();
    const streamsRepositoryClient = buildClient(fetchMock);
    const { result } = renderHook(() =>
      useResolvedDefinitionName({
        streamsRepositoryClient,
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.value).toBeUndefined();
  });
});
