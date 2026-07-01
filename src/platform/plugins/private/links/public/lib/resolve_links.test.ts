/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DEFAULT_DASHBOARD_NAVIGATION_OPTIONS } from '@kbn/dashboard-navigation-options-common';

import { resolveLinkInfo, resolveLinks, serializeResolvedLinks } from './resolve_links';
import type { Link } from '../../server';
import type { ResolvedLink } from '../types';
import { DASHBOARD_LINK_TYPE } from '../../common/constants';

jest.mock('../components/dashboard_link/dashboard_link_tools', () => ({
  fetchDashboard: async (id: string) => {
    if (id === '404') {
      const error = new Error('Dashboard not found');
      throw error;
    }
    return {
      id,
      title: `Dashboard ${id}`,
      description: 'Some descriptive text.',
    };
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValueOnce('generated-id-1').mockReturnValueOnce('generated-id-2'),
}));

describe('resolveLinkInfo', () => {
  it('resolves a dashboard link with no label', async () => {
    const link: Link = {
      type: DASHBOARD_LINK_TYPE,
      destination: '001',
      options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
    };
    const resolvedLink = await resolveLinkInfo(link);
    expect(resolvedLink).toEqual({
      title: 'Dashboard 001',
      description: 'Some descriptive text.',
      label: undefined,
    });
  });

  it('resolves a dashboard link with a label', async () => {
    const link: Link = {
      type: DASHBOARD_LINK_TYPE,
      destination: '001',
      label: 'My Dashboard',
      options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
    };
    const resolvedLink = await resolveLinkInfo(link);
    expect(resolvedLink).toEqual({
      title: 'Dashboard 001',
      description: 'Some descriptive text.',
      label: 'My Dashboard',
    });
  });

  it('adds an error for missing dashboard', async () => {
    const link: Link = {
      type: DASHBOARD_LINK_TYPE,
      destination: '404',
      options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
    };
    const resolvedLink = await resolveLinkInfo(link);
    expect(resolvedLink).toEqual({
      title: 'Error fetching dashboard',
      description: 'Dashboard not found',
      error: new Error('Dashboard not found'),
    });
  });
});

describe('resolveLinks', () => {
  it('generates uuids for links', async () => {
    const links: Link[] = [
      {
        type: DASHBOARD_LINK_TYPE,
        destination: '404',
        options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
      },
      {
        type: DASHBOARD_LINK_TYPE,
        destination: '404',
        options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
      },
    ];
    const resolvedLinks = await resolveLinks(links);
    expect(resolvedLinks[0].id).toEqual('generated-id-1');
    expect(resolvedLinks[1].id).toEqual('generated-id-2');
  });
});

describe('serializeResolvedLinks', () => {
  it('strips uuids from links before saving', async () => {
    const links: ResolvedLink[] = [
      {
        type: DASHBOARD_LINK_TYPE,
        destination: '404',
        id: '1',
        title: 'Link 1',
        options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
      },
    ];
    const serializedLinks = serializeResolvedLinks(links);
    expect('id' in serializedLinks[0]).toBe(false);
  });
});
