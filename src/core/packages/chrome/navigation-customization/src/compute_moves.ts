/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { NavigationCustomizationMove } from '@kbn/core-chrome-browser';

/**
 * Given the index (into the `items` array) of each element, returns the indices
 * of the elements that form the Longest Increasing Subsequence by `defaultIdx`.
 *
 * Uses patience sorting (O(n log n)) with predecessor tracking so the *actual*
 * subsequence is reconstructed, not just its length.
 */
const longestIncreasingSubsequence = (
  items: ReadonlyArray<{ userIdx: number; defaultIdx: number }>
): number[] => {
  if (items.length === 0) return [];

  // tails[k] = index (into `items`) of the smallest possible tail of an increasing
  // subsequence of length k + 1. prev[i] = predecessor index (into `items`) of i.
  const tails: number[] = [];
  const prev: number[] = new Array(items.length).fill(-1);

  for (let i = 0; i < items.length; i++) {
    const value = items[i].defaultIdx;

    // Binary search for the first tail whose value is >= the current value.
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (items[tails[mid]].defaultIdx < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (lo > 0) prev[i] = tails[lo - 1];
    if (lo === tails.length) {
      tails.push(i);
    } else {
      tails[lo] = i;
    }
  }

  // Reconstruct the subsequence by walking predecessors back from the last tail.
  const result: number[] = [];
  let k: number = tails[tails.length - 1];
  while (k !== -1) {
    result.push(items[k].userIdx);
    k = prev[k];
  }

  return result.reverse();
};

/**
 * Diffs `userOrder` against `defaultOrder` and returns the minimal set of moves
 * needed to reproduce the user's arrangement by replaying them on the default.
 *
 * The items that did *not* move are those forming the Longest Common Subsequence
 * of `defaultOrder` and `userOrder` — i.e. the longest backbone that already
 * appears in the same relative order in both lists. Because both lists are
 * permutations of (mostly) the same items, that LCS is equivalent to the Longest
 * Increasing Subsequence of each user item's position in the default order.
 *
 * Only the items outside that backbone are emitted as moves, each anchored after
 * its predecessor in `userOrder` (or to the front when it is first). Emitting in
 * user order guarantees every anchor is already in place when its move is replayed.
 * This yields `n - LCS` moves — the minimum — and preserves user intent (e.g.
 * dragging one item to the bottom records a single move for that item rather than
 * cascading moves across every item it passed).
 *
 * Both arrays should contain the same item IDs, though `userOrder` may contain
 * items not in `defaultOrder` (newly added items, always treated as moved) and
 * `defaultOrder` may contain items not in `userOrder` (removed/hidden items, left
 * untouched during replay).
 */
export const computeMoves = (
  defaultOrder: readonly string[],
  userOrder: readonly string[]
): NavigationCustomizationMove[] => {
  const defaultIndex = new Map<string, number>();
  defaultOrder.forEach((id, idx) => defaultIndex.set(id, idx));

  // Sequence of (userIdx, defaultIdx) for items present in both lists. Items only
  // in userOrder (new items) are excluded from the backbone and so always move.
  const commonPositions: Array<{ userIdx: number; defaultIdx: number }> = [];
  for (let userIdx = 0; userIdx < userOrder.length; userIdx++) {
    const defaultIdx = defaultIndex.get(userOrder[userIdx]);
    if (defaultIdx !== undefined) {
      commonPositions.push({ userIdx, defaultIdx });
    }
  }

  const stableUserIndices = new Set(longestIncreasingSubsequence(commonPositions));

  const moves: NavigationCustomizationMove[] = [];
  for (let i = 0; i < userOrder.length; i++) {
    if (stableUserIndices.has(i)) continue;
    moves.push({ id: userOrder[i], afterId: i === 0 ? null : userOrder[i - 1] });
  }

  return moves;
};
