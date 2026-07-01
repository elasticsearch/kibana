/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { transformLinksIn, transformLinksOut } from './transform_links';
import { DEFAULT_DASHBOARD_NAVIGATION_OPTIONS } from '@kbn/dashboard-navigation-options-common';
import { DEFAULT_EXTERNAL_LINK_OPTIONS } from '../../constants';
import { DASHBOARD_LINK_TYPE, EXTERNAL_LINK_TYPE } from '../../constants';

jest.mock('uuid', () => ({
  v4: jest
    .fn()
    .mockReturnValueOnce('fb1b3fc7-6e12-4542-bcf5-c61ad77241c5')
    .mockReturnValueOnce('1409fabb-1d2b-49c2-a2dc-705bd8fabd0c'),
}));

describe('extractReferences', () => {
  test('should extract dashboard references from dashboard links', () => {
    const links = [
      {
        type: DASHBOARD_LINK_TYPE as typeof DASHBOARD_LINK_TYPE,
        destination: '19e149f0-e95e-404b-b6f8-fc751317c6be',
        options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
      },
      {
        type: EXTERNAL_LINK_TYPE as typeof EXTERNAL_LINK_TYPE,
        destination: 'https://example.com',
        options: DEFAULT_EXTERNAL_LINK_OPTIONS,
      },
      {
        type: DASHBOARD_LINK_TYPE as typeof DASHBOARD_LINK_TYPE,
        destination: '39555f99-a3b8-4210-b1ef-fa0fa86fa3da',
        options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
      },
    ];
    expect(transformLinksIn(links)).toEqual({
      links: [
        {
          type: 'dashboardLink',
          destinationRefName: 'link_fb1b3fc7-6e12-4542-bcf5-c61ad77241c5_dashboard',
          options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
        },
        {
          type: 'externalLink',
          destination: 'https://example.com',
          options: DEFAULT_EXTERNAL_LINK_OPTIONS,
        },
        {
          type: 'dashboardLink',
          destinationRefName: 'link_1409fabb-1d2b-49c2-a2dc-705bd8fabd0c_dashboard',
          options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
        },
      ],
      references: [
        {
          id: '19e149f0-e95e-404b-b6f8-fc751317c6be',
          name: 'link_fb1b3fc7-6e12-4542-bcf5-c61ad77241c5_dashboard',
          type: 'dashboard',
        },
        {
          id: '39555f99-a3b8-4210-b1ef-fa0fa86fa3da',
          name: 'link_1409fabb-1d2b-49c2-a2dc-705bd8fabd0c_dashboard',
          type: 'dashboard',
        },
      ],
    });
  });
});

describe('injectReferences', () => {
  test('should inject dashboard references into dashboard links', () => {
    const links = [
      {
        type: DASHBOARD_LINK_TYPE as typeof DASHBOARD_LINK_TYPE,
        destinationRefName: 'link_fb1b3fc7-6e12-4542-bcf5-c61ad77241c5_dashboard',
        options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
      },
      {
        type: EXTERNAL_LINK_TYPE as typeof EXTERNAL_LINK_TYPE,
        destination: 'https://example.com',
        options: DEFAULT_EXTERNAL_LINK_OPTIONS,
      },
      {
        type: DASHBOARD_LINK_TYPE as typeof DASHBOARD_LINK_TYPE,
        destinationRefName: 'link_1409fabb-1d2b-49c2-a2dc-705bd8fabd0c_dashboard',
        options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
      },
    ];
    const references = [
      {
        id: '19e149f0-e95e-404b-b6f8-fc751317c6be',
        name: 'link_fb1b3fc7-6e12-4542-bcf5-c61ad77241c5_dashboard',
        type: 'dashboard',
      },
      {
        id: '39555f99-a3b8-4210-b1ef-fa0fa86fa3da',
        name: 'link_1409fabb-1d2b-49c2-a2dc-705bd8fabd0c_dashboard',
        type: 'dashboard',
      },
    ];
    expect(transformLinksOut(links, references)).toEqual([
      {
        type: 'dashboardLink',
        destination: '19e149f0-e95e-404b-b6f8-fc751317c6be',
        options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
      },
      {
        type: 'externalLink',
        destination: 'https://example.com',
        options: DEFAULT_EXTERNAL_LINK_OPTIONS,
      },
      {
        type: 'dashboardLink',
        destination: '39555f99-a3b8-4210-b1ef-fa0fa86fa3da',
        options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
      },
    ]);
  });
});
