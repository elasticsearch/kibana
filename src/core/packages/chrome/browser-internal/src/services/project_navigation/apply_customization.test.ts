/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CloudLinks, ChromeNavLink, NavigationCustomization } from '@kbn/core-chrome-browser';
import { applyCustomization, type ParsedNavigation } from './apply_customization';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOLUTION_ID = 'es' as const;
const EMPTY_DEEP_LINKS: Record<string, ChromeNavLink> = {};
const EMPTY_CLOUD_LINKS: CloudLinks = {};

/**
 * Build a minimal NavigationTreeDefinition from an ordered list of IDs.
 * Each item is given an absolute `href` so it counts as a "visible leaf" and is
 * therefore retained by `getRenderableNodes` (a leaf with no href is pruned).
 */
const buildDef = (ids: string[]) => ({
  id: SOLUTION_ID,
  body: ids.map((id) => ({ id, title: id.toUpperCase(), href: `https://localhost/app/${id}` })),
});

/** Extract the render-ready IDs (home, definition-hidden, and no-leaf nodes pruned). */
const renderableIds = (result: ParsedNavigation): string[] =>
  result.renderableNodes.map((n) => n.id);

/** Build a minimal NavigationCustomization. */
const customization = (
  moves: NavigationCustomization['moves'],
  hidden: NavigationCustomization['hidden'] = []
): NavigationCustomization => ({ moves, hidden });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyCustomization', () => {
  describe('no customization', () => {
    it('returns the tree in original order', () => {
      const result = applyCustomization(
        SOLUTION_ID,
        buildDef(['a', 'b', 'c']),
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        undefined
      );

      expect(renderableIds(result)).toEqual(['a', 'b', 'c']);
    });

    it('sets overflowItemIds to an empty array', () => {
      const result = applyCustomization(
        SOLUTION_ID,
        buildDef(['a', 'b']),
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        undefined
      );

      expect(result.overflowItemIds).toEqual([]);
    });

    it('sets defaultItemIds to all body ids in original order', () => {
      const result = applyCustomization(
        SOLUTION_ID,
        buildDef(['a', 'b', 'c']),
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        undefined
      );

      expect(result.defaultItemIds).toEqual(['a', 'b', 'c']);
    });
  });

  describe('defaultItemIds', () => {
    it('excludes items with renderAs === "home"', () => {
      const def = {
        id: SOLUTION_ID,
        body: [
          { id: 'home_node', title: 'HOME', renderAs: 'home' as const },
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
        ],
      };

      const result = applyCustomization(
        SOLUTION_ID,
        def,
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        undefined
      );

      expect(result.defaultItemIds).toEqual(['a', 'b']);
    });

    it('captures ids from items that use the `link` field instead of `id`', () => {
      const def = {
        id: SOLUTION_ID,
        body: [
          { link: 'discover' as any, title: 'Discover' },
          { id: 'b', title: 'B' },
        ],
      };

      const result = applyCustomization(
        SOLUTION_ID,
        def,
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        undefined
      );

      expect(result.defaultItemIds).toEqual(['discover', 'b']);
    });

    it('reflects the original order even when moves are applied', () => {
      const result = applyCustomization(
        SOLUTION_ID,
        buildDef(['a', 'b', 'c']),
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        customization([{ id: 'c', afterId: null }]) // move c to front
      );

      // defaultItemIds should still be the pre-move order
      expect(result.defaultItemIds).toEqual(['a', 'b', 'c']);
      // but the rendered order should be reordered
      expect(renderableIds(result)).toEqual(['c', 'a', 'b']);
    });
  });

  describe('hidden items (overflowItemIds)', () => {
    it('sets overflowItemIds from customization.hidden', () => {
      const result = applyCustomization(
        SOLUTION_ID,
        buildDef(['a', 'b', 'c']),
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        customization([], ['b' as any, 'c' as any])
      );

      expect(result.overflowItemIds).toEqual(['b', 'c']);
    });

    it('does not alter the rendered order when only hidden is set', () => {
      const result = applyCustomization(
        SOLUTION_ID,
        buildDef(['a', 'b', 'c']),
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        customization([], ['a' as any])
      );

      expect(renderableIds(result)).toEqual(['a', 'b', 'c']);
    });

    it('keeps customization-hidden items in renderableNodes (hiding is signalled via overflowItemIds, not pruning)', () => {
      // `hidden` only populates overflowItemIds; the consumer moves those items to
      // the "More" menu. The node itself must still be present in the render-ready list.
      const result = applyCustomization(
        SOLUTION_ID,
        buildDef(['a', 'b', 'c']),
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        customization([], ['b' as any])
      );

      expect(renderableIds(result)).toEqual(['a', 'b', 'c']);
      expect(result.overflowItemIds).toEqual(['b']);
    });
  });

  describe('moves (integration smoke tests — full coverage in replay_moves.test.ts)', () => {
    it('moves an item to the front when afterId is null', () => {
      const result = applyCustomization(
        SOLUTION_ID,
        buildDef(['a', 'b', 'c']),
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        customization([{ id: 'c', afterId: null }])
      );

      expect(renderableIds(result)).toEqual(['c', 'a', 'b']);
    });
  });

  describe('result shape', () => {
    it('sets the solutionId on the result', () => {
      const result = applyCustomization(
        SOLUTION_ID,
        buildDef(['a']),
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        undefined
      );

      expect(result.id).toBe(SOLUTION_ID);
    });

    it('populates the flattened map with one entry per top-level node', () => {
      const result = applyCustomization(
        SOLUTION_ID,
        buildDef(['a', 'b', 'c']),
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        undefined
      );

      // flattenNav keys by index-based path ('[0]', '[1]', …), not by id.
      // Verify that there is one entry per node and each entry has the expected id.
      expect(Object.keys(result.flattened)).toHaveLength(3);
      const ids = Object.values(result.flattened).map((n) => n.id);
      expect(ids).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    });
  });

  describe('renderableNodes (pruning rules)', () => {
    it('excludes the home node from renderableNodes', () => {
      const def = {
        id: SOLUTION_ID,
        body: [
          { id: 'home_node', title: 'HOME', renderAs: 'home' as const },
          { id: 'a', title: 'A', href: 'https://localhost/app/a' },
          { id: 'b', title: 'B', href: 'https://localhost/app/b' },
        ],
      };

      const result = applyCustomization(
        SOLUTION_ID,
        def,
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        undefined
      );

      expect(renderableIds(result)).toEqual(['a', 'b']);
    });

    it('excludes nodes flagged with sideNavStatus "hidden" in the definition', () => {
      const def = {
        id: SOLUTION_ID,
        body: [
          { id: 'a', title: 'A', href: 'https://localhost/app/a' },
          {
            id: 'b',
            title: 'B',
            href: 'https://localhost/app/b',
            sideNavStatus: 'hidden' as const,
          },
          { id: 'c', title: 'C', href: 'https://localhost/app/c' },
        ],
      };

      const result = applyCustomization(
        SOLUTION_ID,
        def,
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        undefined
      );

      expect(renderableIds(result)).toEqual(['a', 'c']);
    });

    it('excludes a group/panel-opener that has no visible leaf', () => {
      const def = {
        id: SOLUTION_ID,
        body: [
          { id: 'a', title: 'A', href: 'https://localhost/app/a' },
          // group with no href and no children → no visible leaf → pruned
          { id: 'empty_group', title: 'Empty group' },
        ],
      };

      const result = applyCustomization(
        SOLUTION_ID,
        def,
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        undefined
      );

      expect(renderableIds(result)).toEqual(['a']);
    });

    it('retains a group that has at least one visible leaf among its children', () => {
      const def = {
        id: SOLUTION_ID,
        body: [
          { id: 'a', title: 'A', href: 'https://localhost/app/a' },
          {
            id: 'group',
            title: 'Group',
            children: [{ id: 'leaf', title: 'Leaf', href: 'https://localhost/app/leaf' }],
          },
        ],
      };

      const result = applyCustomization(
        SOLUTION_ID,
        def,
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        undefined
      );

      expect(renderableIds(result)).toEqual(['a', 'group']);
    });

    it('reflects the customized order in renderableNodes', () => {
      const result = applyCustomization(
        SOLUTION_ID,
        buildDef(['a', 'b', 'c', 'd']),
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        customization([{ id: 'd', afterId: 'a' }])
      );

      expect(renderableIds(result)).toEqual(['a', 'd', 'b', 'c']);
    });
  });

  describe('isHomeCustomizable=true', () => {
    const homeDef = {
      id: SOLUTION_ID,
      body: [
        {
          id: 'home_node',
          title: 'My solution',
          icon: 'logoElastic',
          renderAs: 'home' as const,
          href: 'https://localhost/app/home',
        },
        { id: 'a', title: 'A', href: 'https://localhost/app/a' },
        { id: 'b', title: 'B', href: 'https://localhost/app/b' },
      ],
    };

    const applyHome = (customizationArg?: NavigationCustomization) =>
      applyCustomization(
        SOLUTION_ID,
        homeDef,
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        customizationArg,
        true
      );

    it('includes the home node in defaultItemIds', () => {
      expect(applyHome().defaultItemIds).toEqual(['home_node', 'a', 'b']);
    });

    it('includes the home node in renderableNodes', () => {
      expect(renderableIds(applyHome())).toEqual(['home_node', 'a', 'b']);
    });

    it('normalizes the home node title and icon to "Home"/"home" in both treeUI and renderableNodes', () => {
      const result = applyHome();

      const homeRenderable = result.renderableNodes.find((n) => n.id === 'home_node');
      expect(homeRenderable?.title).toBe('Home');
      expect(homeRenderable?.icon).toBe('home');

      const homeInTree = result.treeUI.body.find((n) => n.id === 'home_node');
      expect(homeInTree?.title).toBe('Home');
      expect(homeInTree?.icon).toBe('home');
    });

    it('allows hiding the home node (signalled via overflowItemIds, still present in renderableNodes)', () => {
      const result = applyHome(customization([], ['home_node' as any]));

      expect(result.overflowItemIds).toEqual(['home_node']);
      expect(renderableIds(result)).toContain('home_node');
    });

    it('allows moving the home node', () => {
      const result = applyHome(customization([{ id: 'home_node', afterId: 'a' }]));

      expect(renderableIds(result)).toEqual(['a', 'home_node', 'b']);
    });
  });

  describe('version skew (smoke test — full coverage in replay_moves.test.ts)', () => {
    it('replays a still-valid move and ignores a stale move that references a removed item', () => {
      const oldCustomization = customization(
        [
          { id: 'maps', afterId: 'discover' }, // still valid in v2
          { id: 'ml', afterId: 'dashboards' }, // `ml` removed in v2 → skipped
        ],
        ['ml' as any]
      );

      const v2 = buildDef(['discover', 'dashboards', 'maps', 'alerts']);

      const result = applyCustomization(
        SOLUTION_ID,
        v2,
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        oldCustomization
      );

      expect(renderableIds(result)).toEqual(['discover', 'maps', 'dashboards', 'alerts']);
      expect(result.defaultItemIds).toEqual(['discover', 'dashboards', 'maps', 'alerts']);
    });
  });

  describe('edge cases', () => {
    it('handles an empty body', () => {
      const result = applyCustomization(
        SOLUTION_ID,
        buildDef([]),
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        customization([{ id: 'a', afterId: null }], ['b' as any])
      );

      expect(renderableIds(result)).toEqual([]);
      expect(result.defaultItemIds).toEqual([]);
      // hidden ids still pass through even with an empty tree.
      expect(result.overflowItemIds).toEqual(['b']);
    });

    it('passes through a hidden id that does not exist in the tree', () => {
      const result = applyCustomization(
        SOLUTION_ID,
        buildDef(['a', 'b']),
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        customization([], ['does_not_exist' as any])
      );

      expect(result.overflowItemIds).toEqual(['does_not_exist']);
      expect(renderableIds(result)).toEqual(['a', 'b']);
    });

    it('leaves footer nodes untouched while reordering the body', () => {
      const def = {
        id: SOLUTION_ID,
        body: [
          { id: 'a', title: 'A', href: 'https://localhost/app/a' },
          { id: 'b', title: 'B', href: 'https://localhost/app/b' },
        ],
        footer: [{ id: 'settings', title: 'Settings', href: 'https://localhost/app/settings' }],
      };

      const result = applyCustomization(
        SOLUTION_ID,
        def,
        EMPTY_DEEP_LINKS,
        EMPTY_CLOUD_LINKS,
        customization([{ id: 'b', afterId: null }])
      );

      // body reordered
      expect(renderableIds(result)).toEqual(['b', 'a']);
      // footer preserved and not part of body/defaultItemIds
      expect(result.treeUI.footer?.map((n) => n.id)).toEqual(['settings']);
      expect(result.defaultItemIds).not.toContain('settings');
    });
  });
});
