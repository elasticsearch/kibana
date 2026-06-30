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
 * Replays a sequence of moves on top of `items`, returning the reordered list.
 *
 * Moves are applied sequentially so each move sees the result of the previous
 * one. Moves whose `id` no longer exists in the current list are silently
 * skipped. Moves whose `afterId` no longer exists are also skipped (except
 * when `afterId` is `null`, which always means "move to the front"). This
 * makes replay resilient to navigation items being added or removed across
 * releases (version skew).
 *
 * The function is generic so it works for both raw string arrays (in tests and
 * for `computeMoves` round-trips) and for typed navigation tree body items (in
 * `applyCustomization`, where `getId` extracts the stable `id ?? link` key).
 */
export const replayMoves = <T>(
  items: readonly T[],
  moves: NavigationCustomizationMove[],
  getId: (item: T) => string | undefined
): T[] => {
  let result = [...items];

  for (const { id, afterId } of moves) {
    const fromIdx = result.findIndex((item) => getId(item) === id);
    if (fromIdx === -1) continue; // item no longer in list — skip

    if (afterId !== null && !result.some((item) => getId(item) === afterId)) continue; // anchor gone — skip

    const [moving] = result.splice(fromIdx, 1);
    if (afterId === null) {
      result = [moving, ...result];
    } else {
      const afterIdx = result.findIndex((item) => getId(item) === afterId);
      result.splice(afterIdx + 1, 0, moving);
    }
  }

  return result;
};
