/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import type { MemoryHistory } from 'history';
import { Router } from '@kbn/shared-ux-router';
import { ContentListProvider } from '../../context';
import { contentListQueryClient } from '../../query';
import { useContentListState } from '../../state';
import { CONTENT_LIST_ACTIONS } from '../../state';
import type { ContentListFeatures } from '../types';
import type { FindItemsParams, FindItemsResult } from '../../datasource';
import { parseSearch } from './url_codec';

describe('ContentListUrlSync', () => {
  const mockFindItems = jest.fn(
    async (_params: FindItemsParams): Promise<FindItemsResult> => ({
      items: [],
      total: 0,
    })
  );

  const createWrapper = ({
    history,
    features,
    id = 'test-list',
  }: {
    history?: MemoryHistory;
    features?: ContentListFeatures;
    id?: string;
  } = {}) => {
    const providerFeatures = features;

    return ({ children }: { children: React.ReactNode }) => {
      const content = (
        <ContentListProvider
          id={id}
          labels={{ entity: 'item', entityPlural: 'items' }}
          dataSource={{ findItems: mockFindItems }}
          features={providerFeatures}
        >
          {children}
        </ContentListProvider>
      );

      return history ? <Router history={history}>{content}</Router> : content;
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await contentListQueryClient.cancelQueries();
    contentListQueryClient.clear();
  });

  it('hydrates new-shape URL state on mount', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/app?sort=updatedAt%3Adesc&q=dashboard'],
    });

    const { result } = renderHook(() => useContentListState(), {
      wrapper: createWrapper({ history }),
    });

    await waitFor(() => {
      expect(result.current.state.queryText).toBe('dashboard');
      expect(result.current.state.sort).toEqual({ field: 'updatedAt', direction: 'desc' });
    });

    expect(history.location.search).toBe('?q=dashboard&sort=updatedAt:desc');
  });

  it('does not overwrite URL params with defaults before hydration state flushes', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/app?q=dashboard&sort=updatedAt%3Adesc'],
    });
    const replaceSpy = jest.spyOn(history, 'replace');
    const pushSpy = jest.spyOn(history, 'push');

    const { result } = renderHook(() => useContentListState(), {
      wrapper: createWrapper({ history }),
    });

    await waitFor(() => {
      expect(result.current.state.queryText).toBe('dashboard');
      expect(result.current.state.sort).toEqual({ field: 'updatedAt', direction: 'desc' });
    });

    expect(history.location.search).toBe('?q=dashboard&sort=updatedAt:desc');
    expect(replaceSpy).not.toHaveBeenCalledWith({ search: '' });
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('canonicalizes default sort with replace, not push', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/app?sort=title%3Aasc'],
    });
    const replaceSpy = jest.spyOn(history, 'replace');
    const pushSpy = jest.spyOn(history, 'push');

    renderHook(() => useContentListState(), {
      wrapper: createWrapper({ history }),
    });

    await waitFor(() => {
      expect(history.location.search).toBe('');
    });

    expect(replaceSpy).toHaveBeenCalledWith({ search: '' });
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('hydrates legacy URL state and rewrites to the canonical shape', async () => {
    const history = createMemoryHistory({
      initialEntries: [
        '/app?s=dashboard&created_by=jane@example.com&favorites=true&sort=updatedAt&sortdir=asc&space=default',
      ],
    });

    const { result } = renderHook(() => useContentListState(), {
      wrapper: createWrapper({ history }),
    });

    await waitFor(() => {
      expect(result.current.state.queryText).toBe(
        'dashboard createdBy:("jane@example.com") is:starred'
      );
      expect(result.current.state.sort).toEqual({ field: 'updatedAt', direction: 'asc' });
    });

    expect(parseSearch(history.location.search)).toEqual({
      q: 'dashboard createdBy:("jane@example.com") is:starred',
      sort: 'updatedAt:asc',
      space: 'default',
    });
  });

  it('treats new-shape params as canonical when both shapes are present', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/app?q=new&s=old'],
    });

    const { result } = renderHook(() => useContentListState(), {
      wrapper: createWrapper({ history }),
    });

    await waitFor(() => {
      expect(result.current.state.queryText).toBe('new');
    });

    expect(parseSearch(history.location.search)).toEqual({ q: 'new', s: 'old' });
  });

  it('layers decoded URL slices over configured initial search', async () => {
    const history = createMemoryHistory({
      initialEntries: ['/app?sort=updatedAt%3Adesc'],
    });

    const { result } = renderHook(() => useContentListState(), {
      wrapper: createWrapper({
        history,
        features: {
          search: { initialSearch: 'configured' },
          sorting: {
            initialSort: { field: 'title', direction: 'asc' },
            fields: [
              { field: 'title', name: 'Name' },
              { field: 'updatedAt', name: 'Last updated' },
            ],
          },
        },
      }),
    });

    await waitFor(() => {
      expect(result.current.state.queryText).toBe('configured');
      expect(result.current.state.sort).toEqual({ field: 'updatedAt', direction: 'desc' });
    });

    expect(history.location.search).toBe('?sort=updatedAt:desc');
  });

  it('writes query and sort changes to the URL via history.replace', async () => {
    const history = createMemoryHistory({ initialEntries: ['/app'] });
    const replaceSpy = jest.spyOn(history, 'replace');
    const pushSpy = jest.spyOn(history, 'push');

    const { result } = renderHook(() => useContentListState(), {
      wrapper: createWrapper({ history }),
    });

    await waitFor(() => {
      expect(result.current.state.queryText).toBe('');
    });
    replaceSpy.mockClear();
    pushSpy.mockClear();

    act(() => {
      result.current.dispatch({
        type: CONTENT_LIST_ACTIONS.SET_QUERY,
        payload: { queryText: 'dashboard' },
      });
    });

    await waitFor(() => {
      expect(history.location.search).toBe('?q=dashboard');
    });
    expect(replaceSpy).toHaveBeenLastCalledWith({ search: '?q=dashboard' });

    act(() => {
      result.current.dispatch({
        type: CONTENT_LIST_ACTIONS.SET_SORT,
        payload: { field: 'updatedAt', direction: 'desc' },
      });
    });

    await waitFor(() => {
      expect(history.location.search).toBe('?q=dashboard&sort=updatedAt:desc');
    });
    expect(replaceSpy).toHaveBeenLastCalledWith({
      search: '?q=dashboard&sort=updatedAt:desc',
    });

    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('rehydrates state from popstate URL changes', async () => {
    const history = createMemoryHistory({ initialEntries: ['/app?q=dashboard'] });

    const { result } = renderHook(() => useContentListState(), {
      wrapper: createWrapper({ history }),
    });

    await waitFor(() => {
      expect(result.current.state.queryText).toBe('dashboard');
    });

    act(() => {
      history.push({ search: '?q=dashboard&sort=updatedAt:desc' });
    });

    await waitFor(() => {
      expect(result.current.state.queryText).toBe('dashboard');
      expect(result.current.state.sort).toEqual({ field: 'updatedAt', direction: 'desc' });
    });

    act(() => {
      history.goBack();
    });

    await waitFor(() => {
      expect(result.current.state.queryText).toBe('dashboard');
      expect(result.current.state.sort).toEqual({ field: 'title', direction: 'asc' });
    });
  });

  it('does not hydrate when urlSync is disabled', async () => {
    const history = createMemoryHistory({ initialEntries: ['/app?q=dashboard'] });

    const { result } = renderHook(() => useContentListState(), {
      wrapper: createWrapper({ history, features: { urlSync: false } }),
    });

    await waitFor(() => {
      expect(result.current.state.queryText).toBe('');
    });
  });

  it('does not crash outside a router context', () => {
    const { result } = renderHook(() => useContentListState(), {
      wrapper: createWrapper(),
    });

    expect(result.current.state.queryText).toBe('');
  });

  it('does not rebind the history listener for equivalent inline sorting config', async () => {
    const history = createMemoryHistory({ initialEntries: ['/app'] });
    const listenSpy = jest.spyOn(history, 'listen');

    const InlineFeaturesWrapper = ({ children }: { children: React.ReactNode }) => (
      <Router history={history}>
        <ContentListProvider
          id="test-list"
          labels={{ entity: 'item', entityPlural: 'items' }}
          dataSource={{ findItems: mockFindItems }}
          features={{
            sorting: {
              fields: [
                { field: 'updatedAt', name: 'Last updated' },
                { field: 'title', name: 'Name' },
              ],
            },
          }}
        >
          {children}
        </ContentListProvider>
      </Router>
    );

    const { rerender } = renderHook(() => useContentListState(), {
      wrapper: InlineFeaturesWrapper,
    });

    await waitFor(() => {
      expect(listenSpy).toHaveBeenCalled();
    });
    const callsAfterMount = listenSpy.mock.calls.length;

    rerender();

    expect(listenSpy).toHaveBeenCalledTimes(callsAfterMount);
  });

  describe('with multiple URL-syncing lists on the same history', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(globalThis.console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('hydrates only the primary (first-mounted) list and warns about the secondary', async () => {
      const history = createMemoryHistory({ initialEntries: ['/app?q=primary'] });

      const primary = renderHook(() => useContentListState(), {
        wrapper: createWrapper({ history, id: 'dashboards' }),
      });

      await waitFor(() => {
        expect(primary.result.current.state.queryText).toBe('primary');
      });

      const secondary = renderHook(() => useContentListState(), {
        wrapper: createWrapper({ history, id: 'visualizations' }),
      });

      // Give the secondary's effect a tick to run and decide it is non-primary.
      await waitFor(() => {
        expect(warnSpy).toHaveBeenCalled();
      });

      expect(secondary.result.current.state.queryText).toBe('');
      expect(primary.result.current.state.queryText).toBe('primary');

      const warnMessage = warnSpy.mock.calls[0][0] as string;
      expect(warnMessage).toContain('"dashboards"');
      expect(warnMessage).toContain('"visualizations"');
      expect(warnMessage).toContain('features.urlSync: false');

      primary.unmount();
      secondary.unmount();
    });

    it('does not echo URL writes from the primary into the secondary state', async () => {
      const history = createMemoryHistory({ initialEntries: ['/app'] });

      const primary = renderHook(() => useContentListState(), {
        wrapper: createWrapper({ history, id: 'dashboards' }),
      });

      await waitFor(() => {
        expect(primary.result.current.state.queryText).toBe('');
      });

      const secondary = renderHook(() => useContentListState(), {
        wrapper: createWrapper({ history, id: 'visualizations' }),
      });

      await waitFor(() => {
        expect(warnSpy).toHaveBeenCalled();
      });

      act(() => {
        primary.result.current.dispatch({
          type: CONTENT_LIST_ACTIONS.SET_QUERY,
          payload: { queryText: 'primary' },
        });
      });

      await waitFor(() => {
        expect(history.location.search).toBe('?q=primary');
      });

      expect(secondary.result.current.state.queryText).toBe('');

      primary.unmount();
      secondary.unmount();
    });

    it('does not write to the URL from the secondary list', async () => {
      const history = createMemoryHistory({ initialEntries: ['/app'] });
      const replaceSpy = jest.spyOn(history, 'replace');

      const primary = renderHook(() => useContentListState(), {
        wrapper: createWrapper({ history, id: 'dashboards' }),
      });

      await waitFor(() => {
        expect(primary.result.current.state.queryText).toBe('');
      });

      const secondary = renderHook(() => useContentListState(), {
        wrapper: createWrapper({ history, id: 'visualizations' }),
      });

      await waitFor(() => {
        expect(warnSpy).toHaveBeenCalled();
      });
      replaceSpy.mockClear();

      act(() => {
        secondary.result.current.dispatch({
          type: CONTENT_LIST_ACTIONS.SET_QUERY,
          payload: { queryText: 'secondary-only' },
        });
      });

      // The secondary updates its own internal state but does not touch the URL.
      await waitFor(() => {
        expect(secondary.result.current.state.queryText).toBe('secondary-only');
      });

      expect(history.location.search).toBe('');
      expect(replaceSpy).not.toHaveBeenCalled();

      primary.unmount();
      secondary.unmount();
    });

    it('reclaims the primary slot when the original primary unmounts', async () => {
      const history = createMemoryHistory({ initialEntries: ['/app'] });

      const primary = renderHook(() => useContentListState(), {
        wrapper: createWrapper({ history, id: 'dashboards' }),
      });

      await waitFor(() => {
        expect(primary.result.current.state.queryText).toBe('');
      });

      primary.unmount();

      const reclaimer = renderHook(() => useContentListState(), {
        wrapper: createWrapper({ history, id: 'recents' }),
      });

      act(() => {
        reclaimer.result.current.dispatch({
          type: CONTENT_LIST_ACTIONS.SET_QUERY,
          payload: { queryText: 'reclaimed' },
        });
      });

      await waitFor(() => {
        expect(history.location.search).toBe('?q=reclaimed');
      });

      expect(warnSpy).not.toHaveBeenCalled();

      reclaimer.unmount();
    });

    it('does not warn or claim a slot when the secondary opts out via features.urlSync: false', async () => {
      const history = createMemoryHistory({ initialEntries: ['/app?q=primary'] });

      const primary = renderHook(() => useContentListState(), {
        wrapper: createWrapper({ history, id: 'dashboards' }),
      });

      await waitFor(() => {
        expect(primary.result.current.state.queryText).toBe('primary');
      });

      const secondary = renderHook(() => useContentListState(), {
        wrapper: createWrapper({
          history,
          id: 'visualizations',
          features: { urlSync: false },
        }),
      });

      // Give the secondary a chance to render before asserting the warn never fires.
      await waitFor(() => {
        expect(secondary.result.current.state.queryText).toBe('');
      });

      expect(warnSpy).not.toHaveBeenCalled();

      // The primary still owns URL writes after the opt-out secondary mounts.
      act(() => {
        primary.result.current.dispatch({
          type: CONTENT_LIST_ACTIONS.SET_QUERY,
          payload: { queryText: 'still-primary' },
        });
      });

      await waitFor(() => {
        expect(history.location.search).toBe('?q=still-primary');
      });

      primary.unmount();
      secondary.unmount();
    });
  });
});
