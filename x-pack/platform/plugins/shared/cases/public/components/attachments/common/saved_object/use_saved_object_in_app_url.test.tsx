/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { waitFor, renderHook } from '@testing-library/react';
import { TestProviders } from '../../../../common/mock';
import { useKibana } from '../../../../common/lib/kibana';
import { useSavedObjectInAppUrl, useSavedObjectInAppUrls } from './use_saved_object_in_app_url';

jest.mock('../../../../common/lib/kibana');

const useKibanaMock = useKibana as jest.Mock;

const buildHttp = (post: jest.Mock, prepend: (p: string) => string = (p) => `/base${p}`) => ({
  services: { http: { post, basePath: { prepend } } },
});

describe('useSavedObjectInAppUrls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls _bulk_get with the requested type+ids and returns prepended hrefs', async () => {
    const post = jest.fn().mockResolvedValue([
      { id: 'a', type: 'dashboard', meta: { inAppUrl: { path: '/app/dashboards#/a' } } },
      { id: 'b', type: 'dashboard', meta: { inAppUrl: { path: '/app/dashboards#/b' } } },
    ]);
    useKibanaMock.mockReturnValue(buildHttp(post));

    const { result } = renderHook(() => useSavedObjectInAppUrls('dashboard', ['a', 'b']), {
      wrapper: TestProviders,
    });

    await waitFor(() =>
      expect(result.current).toEqual({
        a: '/base/app/dashboards#/a',
        b: '/base/app/dashboards#/b',
      })
    );
    expect(post).toHaveBeenCalledWith(
      '/api/kibana/management/saved_objects/_bulk_get',
      expect.objectContaining({
        body: JSON.stringify([
          { type: 'dashboard', id: 'a' },
          { type: 'dashboard', id: 'b' },
        ]),
      })
    );
  });

  it('maps an entry to undefined when the SO has no inAppUrl', async () => {
    const post = jest.fn().mockResolvedValue([{ id: 'a', type: 'dashboard', meta: {} }]);
    useKibanaMock.mockReturnValue(buildHttp(post));

    const { result } = renderHook(() => useSavedObjectInAppUrls('dashboard', ['a']), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current).toEqual({ a: undefined }));
  });

  it('does not refetch when the id set is unchanged (order ignored)', async () => {
    const post = jest.fn().mockResolvedValue([]);
    useKibanaMock.mockReturnValue(buildHttp(post));

    const { rerender } = renderHook(({ ids }) => useSavedObjectInAppUrls('dashboard', ids), {
      wrapper: TestProviders,
      initialProps: { ids: ['a', 'b'] },
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    rerender({ ids: ['b', 'a'] });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('refetches when a new id appears', async () => {
    const post = jest.fn().mockResolvedValue([]);
    useKibanaMock.mockReturnValue(buildHttp(post));

    const { rerender } = renderHook(({ ids }) => useSavedObjectInAppUrls('dashboard', ids), {
      wrapper: TestProviders,
      initialProps: { ids: ['a'] },
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    rerender({ ids: ['a', 'b'] });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  });

  it('swallows fetch errors and leaves the map empty', async () => {
    const post = jest.fn().mockRejectedValue(new Error('nope'));
    useKibanaMock.mockReturnValue(buildHttp(post));

    const { result } = renderHook(() => useSavedObjectInAppUrls('dashboard', ['a']), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });
});

describe('useSavedObjectInAppUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the resolved URL for a single id', async () => {
    const post = jest
      .fn()
      .mockResolvedValue([
        { id: 'a', type: 'dashboard', meta: { inAppUrl: { path: '/app/dashboards#/a' } } },
      ]);
    useKibanaMock.mockReturnValue(buildHttp(post));

    const { result } = renderHook(() => useSavedObjectInAppUrl('dashboard', 'a'), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current).toBe('/base/app/dashboards#/a'));
  });

  it('returns undefined for a falsy id without making a request', () => {
    const post = jest.fn();
    useKibanaMock.mockReturnValue(buildHttp(post));

    const { result } = renderHook(() => useSavedObjectInAppUrl('dashboard', undefined), {
      wrapper: TestProviders,
    });
    expect(result.current).toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });
});
