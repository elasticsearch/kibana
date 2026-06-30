/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { replayMoves } from './replay_moves';
import { computeMoves } from './compute_moves';

/** Identity getId for string-array tests. */
const getId = (s: string) => s;

/** Convenience wrapper — mirrors the way applyCustomization calls replayMoves. */
const replay = (items: string[], moves: ReturnType<typeof computeMoves>): string[] =>
  replayMoves([...items], moves, getId);

describe('replayMoves', () => {
  it('returns the items unchanged when moves is empty', () => {
    expect(replay(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c']);
  });

  it('moves an item to the front when afterId is null', () => {
    expect(replay(['a', 'b', 'c'], [{ id: 'c', afterId: null }])).toEqual(['c', 'a', 'b']);
  });

  it('moves an item to directly after a specified sibling', () => {
    expect(replay(['a', 'b', 'c', 'd'], [{ id: 'd', afterId: 'a' }])).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves an item currently at the front to a new position', () => {
    expect(replay(['a', 'b', 'c'], [{ id: 'a', afterId: 'b' }])).toEqual(['b', 'a', 'c']);
  });

  it('moves an item to the end when afterId is the last item', () => {
    expect(replay(['a', 'b', 'c', 'd'], [{ id: 'a', afterId: 'd' }])).toEqual(['b', 'c', 'd', 'a']);
  });

  it('applies multiple moves sequentially (each move sees the result of the previous)', () => {
    // Start: [a, b, c, d]
    // Move 1: move d after a → [a, d, b, c]
    // Move 2: move b to front → [b, a, d, c]
    expect(
      replay(
        ['a', 'b', 'c', 'd'],
        [
          { id: 'd', afterId: 'a' },
          { id: 'b', afterId: null },
        ]
      )
    ).toEqual(['b', 'a', 'd', 'c']);
  });

  it('is a no-op when the move places an item after its current predecessor', () => {
    // b is already directly after a — this move changes nothing
    expect(replay(['a', 'b', 'c'], [{ id: 'b', afterId: 'a' }])).toEqual(['a', 'b', 'c']);
  });

  it('skips a move whose id no longer exists in the list', () => {
    expect(replay(['a', 'b', 'c'], [{ id: 'removed', afterId: 'a' }])).toEqual(['a', 'b', 'c']);
  });

  it('skips a move whose afterId no longer exists in the list', () => {
    expect(replay(['a', 'b', 'c'], [{ id: 'a', afterId: 'removed_anchor' }])).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('does not skip a move when afterId is null (move to front is always valid)', () => {
    expect(replay(['a', 'b', 'c'], [{ id: 'c', afterId: null }])[0]).toBe('c');
  });

  describe('version skew (old customization, newer item list)', () => {
    it('replays still-valid moves while silently ignoring stale ones', () => {
      // v1: [discover, dashboards, ml, maps]. User moved maps after discover, ml after dashboards.
      // v2: ml removed.
      const items = ['discover', 'dashboards', 'maps', 'alerts'];
      const moves = [
        { id: 'maps', afterId: 'discover' }, // still valid in v2
        { id: 'ml', afterId: 'dashboards' }, // ml removed in v2 → skipped
      ];

      expect(replayMoves(items, moves, getId)).toEqual([
        'discover',
        'maps',
        'dashboards',
        'alerts',
      ]);
    });

    it('skips a move whose anchor (afterId) was removed in the newer list', () => {
      // User moved maps after ml, but ml no longer exists.
      const items = ['discover', 'dashboards', 'maps', 'alerts'];
      expect(replayMoves(items, [{ id: 'maps', afterId: 'ml' }], getId)).toEqual([
        'discover',
        'dashboards',
        'maps',
        'alerts',
      ]);
    });

    it('keeps newly added default items in place while replaying older reorders', () => {
      // v1: [a, b, c]; user moved c to front. v2 adds d at end.
      const items = ['a', 'b', 'c', 'd'];
      expect(replayMoves(items, [{ id: 'c', afterId: null }], getId)).toEqual(['c', 'a', 'b', 'd']);
    });

    it('move-to-front (afterId null) defends top slot when product adds a new first item', () => {
      // v1: [a, b, c]; user dragged c to the very top → afterId: null.
      // v2: product adds x at the top → default becomes [x, a, b, c].
      // The user's explicit front-pin wins; x lands at position 2.
      const items = ['x', 'a', 'b', 'c'];
      expect(replayMoves(items, [{ id: 'c', afterId: null }], getId)).toEqual(['c', 'x', 'a', 'b']);
    });

    it('anchored middle move does NOT defend top slot when product adds a new first item', () => {
      // v1: [a, b, c]; user moved c after a (middle reorder, not a front-pin).
      // v2: product adds x at the top → default becomes [x, a, b, c].
      // x stays at the top because the user never claimed that position.
      const items = ['x', 'a', 'b', 'c'];
      expect(replayMoves(items, [{ id: 'c', afterId: 'a' }], getId)).toEqual(['x', 'a', 'c', 'b']);
    });

    it('keeps a moved item glued to its anchor when the product inserts a new item between them', () => {
      // v1: [a, b, c, d]; user moved d directly after a.
      // v2: product inserts x between a and b → default becomes [a, x, b, c, d].
      // d stays immediately after a; x is pushed down.
      const items = ['a', 'x', 'b', 'c', 'd'];
      expect(replayMoves(items, [{ id: 'd', afterId: 'a' }], getId)).toEqual([
        'a',
        'd',
        'x',
        'b',
        'c',
      ]);
    });

    it('skips a removed-anchor move without disturbing a newly added top item', () => {
      // v1: [a, b, c]; user moved c after b (which later gets removed).
      // v2: product adds x at the top and removes b → default becomes [x, a, c].
      // The move is skipped (anchor b gone); x stays at its default top position.
      const items = ['x', 'a', 'c'];
      expect(replayMoves(items, [{ id: 'c', afterId: 'b' }], getId)).toEqual(['x', 'a', 'c']);
    });
  });

  describe('round-trip with computeMoves', () => {
    const defaultOrder = ['a', 'b', 'c', 'd', 'e', 'f'];
    const cases: string[][] = [
      ['a', 'b', 'c', 'd', 'e', 'f'], // unchanged
      ['f', 'e', 'd', 'c', 'b', 'a'], // full reverse
      ['b', 'c', 'd', 'e', 'f', 'a'], // first to last
      ['f', 'a', 'b', 'c', 'd', 'e'], // last to first
      ['a', 'c', 'b', 'd', 'f', 'e'], // two independent swaps
      ['c', 'a', 'f', 'b', 'e', 'd'], // scrambled
      ['d', 'e', 'f', 'a', 'b', 'c'], // block rotation
    ];

    it.each(cases.map((userOrder) => [userOrder]))(
      'replayMoves(default, computeMoves(default, %j)) === userOrder',
      (userOrder) => {
        const moves = computeMoves(defaultOrder, userOrder);
        expect(replayMoves(defaultOrder, moves, getId)).toEqual(userOrder);
      }
    );
  });
});
