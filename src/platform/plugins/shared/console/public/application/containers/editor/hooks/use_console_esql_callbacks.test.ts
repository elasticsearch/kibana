/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook } from '@testing-library/react';
import type { ESQLSourceResult } from '@kbn/esql-types';
import { getESQLSources, getEsqlColumns } from '@kbn/esql-utils';
import { serviceContextMock } from '../../../contexts/services_context.mock';
import {
  CONSOLE_ESQL_SOURCES_CACHE_INVALIDATE_DELAY,
  useConsoleEsqlCallbacks,
} from './use_console_esql_callbacks';

jest.mock('@kbn/esql-utils', () => ({
  getESQLSources: jest.fn(),
  getEsqlColumns: jest.fn(),
}));

const mockGetESQLSources = getESQLSources as jest.MockedFunction<typeof getESQLSources>;
const mockGetEsqlColumns = getEsqlColumns as jest.MockedFunction<typeof getEsqlColumns>;

const createParams = () => {
  const {
    services: { application, http, licensing, data },
  } = serviceContextMock.create();

  return { application, http, licensing, data };
};

describe('useConsoleEsqlCallbacks', () => {
  const sources = [{ name: 'logs', hidden: false, type: 'index' } as ESQLSourceResult];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    mockGetESQLSources.mockResolvedValue(sources);
    mockGetEsqlColumns.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reuses the same sources request while the cache is fresh', async () => {
    const { result } = renderHook(() => useConsoleEsqlCallbacks(createParams()));

    const firstRequest = result.current.getSources!();
    const secondRequest = result.current.getSources!();

    expect(mockGetESQLSources).toHaveBeenCalledTimes(1);
    await expect(firstRequest).resolves.toBe(sources);
    await expect(secondRequest).resolves.toBe(sources);

    await result.current.getSources!();

    expect(mockGetESQLSources).toHaveBeenCalledTimes(1);
  });

  it('fetches sources again after the cache expires', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const { result } = renderHook(() => useConsoleEsqlCallbacks(createParams()));

    await result.current.getSources!();
    nowSpy.mockReturnValue(1000 + CONSOLE_ESQL_SOURCES_CACHE_INVALIDATE_DELAY + 1);
    await result.current.getSources!();

    expect(mockGetESQLSources).toHaveBeenCalledTimes(2);
  });

  it('does not cache rejected sources requests', async () => {
    const error = new Error('failed to fetch sources');
    mockGetESQLSources.mockRejectedValueOnce(error).mockResolvedValueOnce(sources);
    const { result } = renderHook(() => useConsoleEsqlCallbacks(createParams()));

    await expect(result.current.getSources!()).rejects.toThrow(error);
    await expect(result.current.getSources!()).resolves.toBe(sources);

    expect(mockGetESQLSources).toHaveBeenCalledTimes(2);
  });

  it('rejects concurrent callers sharing an in-flight request that fails and refetches afterwards', async () => {
    const error = new Error('failed to fetch sources');
    let rejectInFlight: (reason: Error) => void;
    mockGetESQLSources
      .mockImplementationOnce(
        () =>
          new Promise<ESQLSourceResult[]>((_resolve, reject) => {
            rejectInFlight = reject;
          })
      )
      .mockResolvedValueOnce(sources);
    const { result } = renderHook(() => useConsoleEsqlCallbacks(createParams()));

    const firstRequest = result.current.getSources!();
    const secondRequest = result.current.getSources!();

    expect(mockGetESQLSources).toHaveBeenCalledTimes(1);

    rejectInFlight!(error);

    await expect(firstRequest).rejects.toThrow(error);
    await expect(secondRequest).rejects.toThrow(error);

    await expect(result.current.getSources!()).resolves.toBe(sources);
    expect(mockGetESQLSources).toHaveBeenCalledTimes(2);
  });

  it('keeps a fresh cache when a stale request rejects after the cache was refreshed', async () => {
    const staleError = new Error('stale sources request');
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    let rejectStale: (reason: Error) => void;
    mockGetESQLSources
      .mockImplementationOnce(
        () =>
          new Promise<ESQLSourceResult[]>((_resolve, reject) => {
            rejectStale = reject;
          })
      )
      .mockResolvedValueOnce(sources);
    const { result } = renderHook(() => useConsoleEsqlCallbacks(createParams()));

    const staleRequest = Promise.resolve(result.current.getSources!());
    staleRequest.catch(() => {});

    nowSpy.mockReturnValue(1000 + CONSOLE_ESQL_SOURCES_CACHE_INVALIDATE_DELAY + 1);
    await expect(result.current.getSources!()).resolves.toBe(sources);
    expect(mockGetESQLSources).toHaveBeenCalledTimes(2);

    rejectStale!(staleError);
    await expect(staleRequest).rejects.toThrow(staleError);

    await expect(result.current.getSources!()).resolves.toBe(sources);
    expect(mockGetESQLSources).toHaveBeenCalledTimes(2);
  });

  it('starts a fresh sources cache when dependencies change', async () => {
    const { result, rerender } = renderHook((props) => useConsoleEsqlCallbacks(props), {
      initialProps: createParams(),
    });

    await result.current.getSources!();
    rerender(createParams());
    await result.current.getSources!();

    expect(mockGetESQLSources).toHaveBeenCalledTimes(2);
  });

  it('delegates column requests without caching them', async () => {
    const params = createParams();
    const { result } = renderHook(() => useConsoleEsqlCallbacks(params));

    await result.current.getColumnsFor!({ query: 'FROM logs' });
    await result.current.getColumnsFor!({ query: 'FROM logs' });

    expect(mockGetEsqlColumns).toHaveBeenCalledWith({
      esqlQuery: 'FROM logs',
      search: params.data.search.search,
    });
    expect(mockGetEsqlColumns).toHaveBeenCalledTimes(2);
  });
});
