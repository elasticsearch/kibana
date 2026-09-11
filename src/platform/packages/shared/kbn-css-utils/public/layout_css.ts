/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { css } from '@emotion/react';

/**
 * INTERIM intrinsic layout primitives. Treat every export here as experimental.
 *
 * Why these exist
 * ---------------
 * Current EUI layout component depend on the *viewport*: `EuiFlexGroup`'s `responsive`
 * prop and `EuiFlexGrid`'s column collapse use `@media (max-width: …)` queries,
 * and `EuiShowFor` / `useCurrentEuiBreakpoint` read `window.innerWidth`.
 *
 * Kibana's new chrome is a CSS grid whose columns are `navigation | application |
 * sidebar`. Depending on whether the `navigation` and `sidebar` tracks are open,
 * available space will change independently from the viewport. The combination of
 * these results in layout bugs. See https://github.com/elastic/kibana/issues/257075.
 *
 * These helpers are a PoC for a proposal of a new set of layout primitives.
 * They are deliberately CSS-only. There is no state or DOM measurement
 * to justify components, and a style function is trivial to delete.
 *
 * The API is kept to what call sites actually use. Add an option when a real case
 * needs it, not before.
 *
 * When to delete
 * --------------
 * Once new primitives land in `@elastic/eui`. Delete each one as its EUI counterpart ships.
 *
 * Tracking issue: https://github.com/elastic/eui/issues/9867
 */

type Align = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
type Justify = 'start' | 'center' | 'end' | 'spaceBetween';

const ALIGN_ITEMS: Record<Align, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};

const JUSTIFY_CONTENT: Record<Justify, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  spaceBetween: 'space-between',
};

export interface LayoutRowOptions {
  /** Gap between children. Usually a `euiTheme.size.*` token. */
  gap?: string;
  /** Cross-axis alignment. Defaults to `'center'`. */
  align?: Align;
  /**
   * Main-axis distribution. Defaults to `'start'`.
   *
   * Note that `'spaceBetween'` with exactly two children is a useful idiom: they sit at
   * opposite ends while they share a line, and the wrapped one becomes left-aligned.
   * With three or more children it produces uneven per-line gaps instead.
   *
   * @default "start"
   */
  justify?: Justify;
  /**
   * Whether children may be compressed below their content width. Defaults to `true`,
   * matching plain flexbox.
   *
   * Pass `false` for a row of leaf content (chips, badges, buttons, a heading) so a
   * cramped row *wraps* instead of squeezing its items until their text breaks. Keep it
   * `true` when a child is itself a wrapping row, since that child has to be
   * compressible for its own wrapping to ever engage.
   *
   * @default true
   */
  shrinkItems?: boolean;
}

/**
 * A row of **content-sized** things that **always wraps**.
 *
 * This is the primitive for leaf content (buttons, badges, chips, a heading beside a
 * control). Reach for it whenever items should keep their natural width, rather than
 * asking `layoutRowOrStackCss` not to grow its children.
 */
export const layoutRowCss = ({
  gap,
  align = 'center',
  justify = 'start',
  shrinkItems = true,
}: LayoutRowOptions = {}) =>
  css({
    display: 'flex',
    flexWrap: 'wrap',
    gap,
    alignItems: ALIGN_ITEMS[align],
    justifyContent: JUSTIFY_CONTENT[justify],
    // `&&` doubles specificity; a single `&` only ties with EUI's base styles on the child.
    '&& > *': {
      flexGrow: 0,
      ...(shrinkItems ? {} : { flexShrink: 0 }),
    },
  });

export interface LayoutFillRowOptions {
  /** Gap between children. Usually a `euiTheme.size.*` token. */
  gap?: string;
  /** Cross-axis alignment. Defaults to `'start'`. */
  align?: Align;
}

/**
 * A row that **never wraps**, whose **last child is pinned to the end** and never shrinks,
 * while every other child flexes to fill whatever is left.
 *
 * Use it when one trailing element must hold its position (a version badge, a count, an
 * overflow menu) while the content beside it is free to reflow.
 */
export const layoutFillRowCss = ({ gap, align = 'start' }: LayoutFillRowOptions = {}) =>
  css({
    display: 'flex',
    flexWrap: 'nowrap',
    gap,
    alignItems: ALIGN_ITEMS[align],
    // `&&` doubles specificity; a single `&` only ties with EUI's base styles on the child.
    '&& > *': {
      flexGrow: 1,
      flexShrink: 1,
      minInlineSize: 0,
    },
    '&& > :last-child': {
      flexGrow: 0,
      flexShrink: 0,
      minInlineSize: 'auto',
    },
  });

export interface LayoutRowOrStackOptions {
  /**
   * The **container** width below which the row becomes a stack, as any non-percentage
   * CSS length. Percentages will not work. Because it is compared against the container
   * and not against each child, set it to roughly
   * `childCount * desiredChildWidth + gaps`.
   *
   * Font-relative units are allowed and often preferable: `ch` or `rem` tie the switch
   * point to the text it is protecting, so it moves with the user's font settings rather
   * than against them. Note that `ch` resolves against the *container's own* font.
   */
  threshold: string;
  /** Gap between children. Usually a `euiTheme.size.*` token. */
  gap?: string;
  /**
   * Cross-axis alignment while the children share a row. Defaults to `'stretch'`.
   *
   * Has no effect once stacked, where each child is alone on its line.
   *
   * @default "stretch"
   */
  align?: Align;
}

/**
 * All-or-nothing: every child on one row, or every child on its own row. Never a partly
 * filled final line.
 *
 * Children always fill the line they are on, which is what panels and cards want. For a
 * row of content-sized leaf items, use `layoutRowCss` instead. (Should a content-sized
 * variant ever be needed here, the supported way to cap a child is
 * `max-inline-size: fit-content`. Intrinsic keywords are not valid inside CSS math
 * functions, so `min(max-content, 100%)` is dropped by the browser.)
 *
 * Prefer this over `layoutAutoGridCss` for a small set of *peer* items, where a ragged
 * trailing row would imply a hierarchy the design does not intend.
 */
export const layoutRowOrStackCss = ({
  threshold,
  gap,
  align = 'stretch',
}: LayoutRowOrStackOptions) =>
  css({
    display: 'flex',
    flexWrap: 'wrap',
    gap,
    alignItems: ALIGN_ITEMS[align],
    // `&&` doubles specificity; a single `&` only ties with EUI's base styles on the child.
    '&& > *': {
      flexGrow: 1,
      flexBasis: `calc((${threshold} - 100%) * 999)`,
    },
  });

export interface LayoutAutoGridOptions {
  /**
   * The ideal minimum width of a single grid track, as a CSS length (e.g. `'20rem'`).
   * Tracks narrower than this collapse the grid into fewer columns.
   */
  minItemWidth: string;
  /** Gap between tracks. Usually a `euiTheme.size.*` token. */
  gap?: string;
}

/**
 * A grid whose column count follows the width it was actually given.
 *
 * Use it for many items of equal standing where a wrapped, ragged final row is fine.
 */
export const layoutAutoGridCss = ({ minItemWidth, gap }: LayoutAutoGridOptions) =>
  css({
    display: 'grid',
    gap,
    gridTemplateColumns: `repeat(auto-fit, minmax(min(${minItemWidth}, 100%), 1fr))`,
  });
