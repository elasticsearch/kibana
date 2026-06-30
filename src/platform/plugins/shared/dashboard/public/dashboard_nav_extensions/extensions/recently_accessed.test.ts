/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ChromeRecentlyAccessedHistoryItem } from '@kbn/core/public';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import {
  createRecentItemsData$,
  RECENTLY_ACCESSED_DASHBOARDS_EXTENSION_ID,
  recentlyAccessedNavExtensionDefinition,
} from './recently_accessed';

const createRecentlyAccessedMock = (items: ChromeRecentlyAccessedHistoryItem[] = []) => ({
  get$: jest.fn().mockReturnValue(new BehaviorSubject(items)),
});

const createBasePathMock = (basePath = '/s/default') => ({
  prepend: jest.fn((path: string) => `${basePath}${path}`),
});

describe('recentlyAccessedNavExtensionDefinition', () => {
  it('registers the recently accessed dashboards list extension', () => {
    expect(recentlyAccessedNavExtensionDefinition).toEqual({
      id: RECENTLY_ACCESSED_DASHBOARDS_EXTENSION_ID,
      templateId: 'list',
      config: {
        max: 5,
      },
    });
  });
});

describe('createRecentItemsData$', () => {
  it('maps recently accessed dashboard items to recent item rows', async () => {
    const recentlyAccessed = createRecentlyAccessedMock([
      { id: 'dash-1', label: 'Sales overview', link: '/app/dashboards#/view/dash-1' },
      { id: 'dash-2', label: 'Ops metrics', link: '/app/dashboards#/view/dash-2' },
    ]);
    const basePath = createBasePathMock();

    const result = await firstValueFrom(createRecentItemsData$(recentlyAccessed, basePath));

    expect(result).toEqual([
      {
        id: 'recent-dash-1',
        label: 'Sales overview',
        href: '/s/default/app/dashboards#/view/dash-1',
      },
      {
        id: 'recent-dash-2',
        label: 'Ops metrics',
        href: '/s/default/app/dashboards#/view/dash-2',
      },
    ]);
    expect(basePath.prepend).toHaveBeenCalledWith('/app/dashboards#/view/dash-1');
    expect(basePath.prepend).toHaveBeenCalledWith('/app/dashboards#/view/dash-2');
  });

  it('filters out items that do not match the dashboard link pattern', async () => {
    const recentlyAccessed = createRecentlyAccessedMock([
      { id: 'dash-1', label: 'Sales overview', link: '/app/dashboards#/view/dash-1' },
      { id: 'discover-1', label: 'Discover search', link: '/app/discover#/view/discover-1' },
    ]);
    const basePath = createBasePathMock();

    const result = await firstValueFrom(createRecentItemsData$(recentlyAccessed, basePath));

    expect(result).toEqual([
      {
        id: 'recent-dash-1',
        label: 'Sales overview',
        href: '/s/default/app/dashboards#/view/dash-1',
      },
    ]);
  });

  it('caps the number of items using the default max', async () => {
    const recentlyAccessed = createRecentlyAccessedMock(
      Array.from({ length: 7 }, (_, index) => ({
        id: `dash-${index}`,
        label: `Dashboard ${index}`,
        link: `/app/dashboards#/view/dash-${index}`,
      }))
    );
    const basePath = createBasePathMock();

    const result = await firstValueFrom(createRecentItemsData$(recentlyAccessed, basePath));

    expect(result).toHaveLength(5);
    expect(result[0]?.id).toBe('recent-dash-0');
    expect(result[4]?.id).toBe('recent-dash-4');
  });

  it('respects a custom max', async () => {
    const recentlyAccessed = createRecentlyAccessedMock([
      { id: 'dash-1', label: 'Sales overview', link: '/app/dashboards#/view/dash-1' },
      { id: 'dash-2', label: 'Ops metrics', link: '/app/dashboards#/view/dash-2' },
    ]);
    const basePath = createBasePathMock('/base');

    const result = await firstValueFrom(
      createRecentItemsData$(recentlyAccessed, basePath, {
        max: 1,
      })
    );

    expect(result).toEqual([
      {
        id: 'recent-dash-1',
        label: 'Sales overview',
        href: '/base/app/dashboards#/view/dash-1',
      },
    ]);
  });

  it('emits an empty array when there are no matching items', async () => {
    const recentlyAccessed = createRecentlyAccessedMock([
      { id: 'discover-1', label: 'Discover search', link: '/app/discover#/view/discover-1' },
    ]);
    const basePath = createBasePathMock();

    const result = await firstValueFrom(createRecentItemsData$(recentlyAccessed, basePath));

    expect(result).toEqual([]);
  });

  it('emits updated rows when recently accessed history changes', async () => {
    const history$ = new BehaviorSubject<ChromeRecentlyAccessedHistoryItem[]>([
      { id: 'dash-1', label: 'Sales overview', link: '/app/dashboards#/view/dash-1' },
    ]);
    const recentlyAccessed = { get$: jest.fn().mockReturnValue(history$) };
    const basePath = createBasePathMock();
    const recentItemsData$ = createRecentItemsData$(recentlyAccessed, basePath);

    expect(await firstValueFrom(recentItemsData$)).toEqual([
      {
        id: 'recent-dash-1',
        label: 'Sales overview',
        href: '/s/default/app/dashboards#/view/dash-1',
      },
    ]);

    history$.next([{ id: 'dash-2', label: 'Ops metrics', link: '/app/dashboards#/view/dash-2' }]);

    expect(await firstValueFrom(recentItemsData$)).toEqual([
      {
        id: 'recent-dash-2',
        label: 'Ops metrics',
        href: '/s/default/app/dashboards#/view/dash-2',
      },
    ]);
  });
});
