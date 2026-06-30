/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { solutionFormatter } from './deep_links';
import type { NavigationTreeDefinition } from '@kbn/core-chrome-browser';
import type { NormalizedLinks, LinkItem } from '../../common/links/types';
import type { SecurityGroupName, SecurityPageName } from '@kbn/security-solution-navigation';
import { SecurityLinkGroup } from '@kbn/security-solution-navigation/links';

const createMockLink = (id: SecurityPageName, overrides: Partial<LinkItem> = {}): LinkItem => ({
  id,
  path: `/path/${id}`,
  title: `Title for ${id}`,
  globalSearchDisabled: false,
  sideNavDisabled: false,
  ...overrides,
});

describe('solutionFormatter', () => {
  it('should convert a flat navItem using normalizedLinks', () => {
    const id = 'page-1' as SecurityPageName;
    const tree: NavigationTreeDefinition = {
      body: [{ id }],
    };

    const normalizedLinks: NormalizedLinks = {
      [id]: createMockLink(id),
    };

    const result = solutionFormatter(tree, normalizedLinks);
    expect(result).toEqual([
      {
        id,
        path: `/path/${id}`,
        title: `Title for ${id}`,
        visibleIn: ['globalSearch', 'projectSideNav'],
      },
    ]);
  });

  it('should not include missing links', () => {
    const id = 'page-1' as SecurityPageName;
    const id2 = 'page-2' as SecurityPageName;
    const tree: NavigationTreeDefinition = {
      body: [{ id }, { id: id2 }],
    };

    const normalizedLinks: NormalizedLinks = {
      [id]: createMockLink(id),
    };

    const result = solutionFormatter(tree, normalizedLinks);
    expect(result).toEqual([
      {
        id,
        path: `/path/${id}`,
        title: `Title for ${id}`,
        visibleIn: ['globalSearch', 'projectSideNav'],
      },
    ]);
  });

  it('should not include unauthorized links', () => {
    const id = 'page-1' as SecurityPageName;
    const id2 = 'page-2' as SecurityPageName;
    const tree: NavigationTreeDefinition = {
      body: [{ id }, { id: id2 }],
    };

    const normalizedLinks: NormalizedLinks = {
      [id]: createMockLink(id),
      [id2]: createMockLink(id2, { unauthorized: true }),
    };

    const result = solutionFormatter(tree, normalizedLinks);
    expect(result).toEqual([
      {
        id,
        path: `/path/${id}`,
        title: `Title for ${id}`,
        visibleIn: ['globalSearch', 'projectSideNav'],
      },
    ]);
  });

  it('should include unavailable links with projectSideNav visibility only', () => {
    const id = 'page-1' as SecurityPageName;
    const id2 = 'page-2' as SecurityPageName;
    const tree: NavigationTreeDefinition = {
      body: [{ id }, { id: id2 }],
    };

    const normalizedLinks: NormalizedLinks = {
      [id]: createMockLink(id),
      [id2]: createMockLink(id2, { unavailable: true }),
    };

    const result = solutionFormatter(tree, normalizedLinks);
    expect(result).toEqual([
      {
        id,
        path: `/path/${id}`,
        title: `Title for ${id}`,
        visibleIn: ['globalSearch', 'projectSideNav'],
      },
      {
        id: id2,
        path: `/path/${id2}`,
        title: `Title for ${id2}`,
        visibleIn: ['projectSideNav'],
      },
    ]);
  });

  it('should handle navGroup and include its children', () => {
    const id = 'page-2' as SecurityPageName;
    const tree: NavigationTreeDefinition = {
      body: [
        {
          id: 'group-1',
          children: [{ id }],
        },
      ],
    };

    const normalizedLinks: NormalizedLinks = {
      [id]: createMockLink(id),
    };

    const result = solutionFormatter(tree, normalizedLinks);
    expect(result).toEqual([
      {
        id,
        path: `/path/${id}`,
        title: `Title for ${id}`,
        visibleIn: ['globalSearch', 'projectSideNav'],
      },
    ]);
  });

  it('should flatten nodes with no id and children', () => {
    const id = 'page-3' as SecurityPageName;
    const tree: NavigationTreeDefinition = {
      body: [
        {
          // No id — should recurse into children
          title: 'Group 1',
          children: [{ id }],
        },
      ],
    };

    const normalizedLinks: NormalizedLinks = {
      [id]: createMockLink(id),
    };

    const result = solutionFormatter(tree, normalizedLinks);
    expect(result).toEqual([
      {
        id,
        path: `/path/${id}`,
        title: `Title for ${id}`,
        visibleIn: ['globalSearch', 'projectSideNav'],
      },
    ]);
  });

  it('should handle top-level SecurityLinkGroup node', () => {
    const groupId = Object.keys(SecurityLinkGroup)[0] as SecurityGroupName;
    const childId = 'page-4' as SecurityPageName;

    const tree: NavigationTreeDefinition = {
      body: [
        {
          children: [
            {
              id: groupId,
              children: [{ id: childId }],
            },
          ],
        },
      ],
    };

    const normalizedLinks: NormalizedLinks = {
      [childId]: createMockLink(childId),
    };

    const result = solutionFormatter(tree, normalizedLinks);
    expect(result).toEqual([
      {
        id: groupId,
        title: SecurityLinkGroup[groupId].title,
        deepLinks: [
          expect.objectContaining({
            id: childId,
          }),
        ],
      },
    ]);
  });

  it('should handle nested children recursively', () => {
    const parentId = 'page-parent' as SecurityPageName;
    const childId = 'page-child' as SecurityPageName;
    const greatGrandChildId = 'page-great-grandchild' as SecurityPageName;

    const tree: NavigationTreeDefinition = {
      body: [
        {
          children: [
            {
              id: parentId,
              children: [
                {
                  id: childId,
                  children: [
                    {
                      title: 'Grand Group',
                      children: [
                        {
                          id: greatGrandChildId,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const normalizedLinks: NormalizedLinks = {
      [parentId]: createMockLink(parentId),
      [childId]: createMockLink(childId),
      [greatGrandChildId]: createMockLink(greatGrandChildId),
    };

    const result = solutionFormatter(tree, normalizedLinks);
    expect(result).toEqual([
      expect.objectContaining({
        id: parentId,
        deepLinks: [
          expect.objectContaining({
            id: childId,
            deepLinks: [
              expect.objectContaining({
                id: greatGrandChildId,
              }),
            ],
          }),
        ],
      }),
    ]);
  });

  it('should skip nodes that are not in normalizedLinks or SecurityLinkGroup', () => {
    const tree: NavigationTreeDefinition = {
      body: [{ id: 'unknown-id' }],
    };

    const normalizedLinks: NormalizedLinks = {};

    const result = solutionFormatter(tree, normalizedLinks);
    expect(result).toEqual([]); // nothing matched
  });

  it('should skip extension nodes', () => {
    const tree = {
      body: [
        {
          renderAs: 'panelOpener',
          children: [
            {
              slotId: 'extension-slot',
              // extension value here must be recentlyAccessedDashboards,
              // as it's the only configured extension at this point in time
              extensionId: 'recentlyAccessedDashboards',
              renderAs: 'extension',
            },
          ],
        },
      ],
    } satisfies NavigationTreeDefinition;

    const normalizedLinks: NormalizedLinks = {};

    const result = solutionFormatter(tree, normalizedLinks);
    expect(result).toEqual([]);
  });
});
