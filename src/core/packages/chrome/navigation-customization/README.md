# @kbn/core-chrome-navigation-customization

Pure, stateless algorithms for the customizable side navigation feature. These
functions encode/decode the delta-from-default storage format used to persist a
user's navigation reordering as a minimal list of moves.

This package has no React, EUI, or platform dependencies (only
`@kbn/core-chrome-browser` types), so it can be dynamically imported by the
navigation plugin and statically imported by `@kbn/core-chrome-browser-internal`
without bloating the page-load bundle.

## Exports

- `computeMoves(defaultOrder, userOrder)` — produces the minimal set of
  intent-preserving moves (via an LCS/LIS diff) that transforms `defaultOrder`
  into `userOrder`. Used when saving a customization.
- `replayMoves(items, moves, getId)` — replays a saved list of moves on top of
  the current default order, skipping moves whose `id` or `afterId` no longer
  exist (version-skew resilience). Used when applying a stored customization.
