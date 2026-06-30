/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { NavigationCustomizationMove } from '@kbn/core-chrome-browser';
import { computeMoves } from './compute_moves';

/** Replays moves on a copy of the default order, mirroring apply_customization. */
const replay = (
  defaultOrder: readonly string[],
  moves: NavigationCustomizationMove[]
): string[] => {
  const result = [...defaultOrder];
  for (const { id, afterId } of moves) {
    const fromIdx = result.indexOf(id);
    if (fromIdx !== -1) result.splice(fromIdx, 1);
    if (afterId === null) {
      result.unshift(id);
    } else {
      const afterIdx = result.indexOf(afterId);
      result.splice(afterIdx + 1, 0, id);
    }
  }
  return result;
};

describe('computeMoves', () => {
  it('returns empty array when user order matches default', () => {
    const order = ['a', 'b', 'c'];
    expect(computeMoves(order, order)).toEqual([]);
  });

  it('records a move when an item changes predecessor', () => {
    // default: [a, b, c] → user moves c to front → [c, a, b]
    const moves = computeMoves(['a', 'b', 'c'], ['c', 'a', 'b']);
    expect(moves).toEqual([{ id: 'c', afterId: null }]);
  });

  it('records a move to front (afterId: null)', () => {
    const moves = computeMoves(['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c']);
    expect(moves).toEqual([{ id: 'd', afterId: null }]);
  });

  it('records minimal moves — only displaced items', () => {
    // default: [a, b, c, d] → user swaps b and c → [a, c, b, d]
    // Moving c after a is sufficient; b follows without an extra move
    const moves = computeMoves(['a', 'b', 'c', 'd'], ['a', 'c', 'b', 'd']);
    expect(moves).toEqual([{ id: 'c', afterId: 'a' }]);
  });

  it('does not record a move when only unmoved items surround it (still same predecessor)', () => {
    // default: [a, b, c, d] → user order: [a, b, c, d] — no change
    expect(computeMoves(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'])).toEqual([]);
  });

  it('handles items in user order that are absent from default (new items)', () => {
    // 'x' is not in defaultOrder — it has no defaultAfterId (indexOf = -1 → defaultAfterId = null)
    // if userOrder has x at position 1 (after 'a'), afterId='a' ≠ null → move recorded
    const moves = computeMoves(['a', 'b', 'c'], ['a', 'x', 'b', 'c']);
    expect(moves).toContainEqual({ id: 'x', afterId: 'a' });
  });

  it('handles items absent from user order (removed items) without recording spurious moves', () => {
    // 'b' removed from userOrder. [a, c] is already a subsequence of [a, b, c],
    // so nothing actually moved relative to the default — no moves should be recorded.
    const moves = computeMoves(['a', 'b', 'c'], ['a', 'c']);
    expect(moves).toEqual([]);
  });

  it('records a single move (not a cascade) when one item is dragged to the bottom', () => {
    // default: [discover, dashboards, agent_builder, workflows, machine_learning]
    // user drags 'discover' to the bottom.
    const defaultOrder = [
      'discover',
      'dashboards',
      'agent_builder',
      'workflows',
      'machine_learning',
    ];
    const userOrder = ['dashboards', 'agent_builder', 'workflows', 'machine_learning', 'discover'];

    const moves = computeMoves(defaultOrder, userOrder);

    // Intent-preserving: only the dragged item is recorded, anchored after the
    // item it now follows — not a cascade of moves for every item it passed.
    expect(moves).toEqual([{ id: 'discover', afterId: 'machine_learning' }]);
  });

  it('records a single move when one item is dragged to the top', () => {
    const moves = computeMoves(['a', 'b', 'c', 'd', 'e'], ['e', 'a', 'b', 'c', 'd']);
    expect(moves).toEqual([{ id: 'e', afterId: null }]);
  });

  it('records a single move when one item is moved to the middle', () => {
    // default: [a, b, c, d] → user moves d after a → [a, d, b, c]
    const moves = computeMoves(['a', 'b', 'c', 'd'], ['a', 'd', 'b', 'c']);
    expect(moves).toEqual([{ id: 'd', afterId: 'a' }]);
  });

  it('produces moves that, when replayed, reproduce the user order', () => {
    const defaultOrder = ['discover', 'dashboards', 'ml', 'analytics', 'maps'];
    const userOrder = ['discover', 'maps', 'dashboards', 'ml', 'analytics'];

    const moves = computeMoves(defaultOrder, userOrder);

    expect(replay(defaultOrder, moves)).toEqual(userOrder);
  });

  describe('replay reproduces the user order across many arrangements', () => {
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

    it.each(cases.map((userOrder) => [userOrder]))('reproduces %j', (userOrder) => {
      const moves = computeMoves(defaultOrder, userOrder);
      expect(replay(defaultOrder, moves)).toEqual(userOrder);
    });
  });

  it('emits the minimal number of moves (n - LCS length)', () => {
    // default [a, b, c, d, e] vs user [c, d, a, b, e]:
    // LCS is [a, b, e] (length 3) → exactly 2 items moved.
    const moves = computeMoves(['a', 'b', 'c', 'd', 'e'], ['c', 'd', 'a', 'b', 'e']);
    expect(moves).toHaveLength(2);
    expect(replay(['a', 'b', 'c', 'd', 'e'], moves)).toEqual(['c', 'd', 'a', 'b', 'e']);
  });
});
