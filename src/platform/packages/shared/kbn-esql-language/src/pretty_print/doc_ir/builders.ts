/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  Doc,
  GroupNode,
  FillNode,
  IndentNode,
  IndentIfBreakNode,
  AlignNode,
  IfBreakNode,
  LineNode,
  LineSuffixNode,
  LineSuffixBoundaryNode,
  BreakParentNode,
  LabelNode,
  TrimNode,
  CursorNode,
} from './types';

/**
 * Literal text. Must not contain newline characters.
 */
export const text = (s: string): string => s;

/**
 * Space if flat, newline + indent if broken.
 */
export const line: LineNode = { type: 'line' };

/**
 * Nothing if flat, newline + indent if broken.
 */
export const softline: LineNode = { type: 'line', soft: true };

/**
 * Always a newline + indent. Forces enclosing group to break.
 */
export const hardline: Doc = [{ type: 'line', hard: true }, { type: 'break-parent' }];

/**
 * Like `hardline` but does NOT force parent group to break.
 */
export const hardlineWithoutBreakParent: LineNode = { type: 'line', hard: true };

/**
 * A hard line break that indents to the root position (set by `markAsRoot`)
 * rather than the current nesting level. Also preserves trailing whitespace
 * on the preceding line (no trim). Used for embedded/template content.
 *
 * Like `hardline`, forces enclosing groups to break.
 */
export const literalline: Doc = [
  { type: 'line', hard: true, literal: true },
  { type: 'break-parent' },
];

/**
 * Like `literalline` but does NOT force parent group to break.
 */
export const literallineWithoutBreakParent: LineNode = {
  type: 'line',
  hard: true,
  literal: true,
};

/**
 * Force all parent groups to break.
 */
export const breakParent: BreakParentNode = { type: 'break-parent' };

/**
 * Try to print `contents` on a single line (flat mode).
 * If it doesn't fit within the remaining width, print in broken mode
 * (all "line" nodes inside become newlines).
 *
 * @param contents - The document to group.
 * @param opts.shouldBreak - Force this group to break (skip flat attempt).
 * @param opts.id - Symbol ID for cross-referencing with `ifBreak`.
 */
export const group = (contents: Doc, opts?: { shouldBreak?: boolean; id?: symbol }): GroupNode => ({
  type: 'group',
  contents,
  shouldBreak: opts?.shouldBreak,
  id: opts?.id,
});

/**
 * Provide multiple alternative layout representations, from most compact
 * to most expanded. The layout engine tries each in order and uses the
 * first one that fits. If none fits, the last state is used in break mode.
 *
 * Primary use case: three-phase list formatting:
 *
 * ```ts
 * conditionalGroup([flatLayout, wrappedLayout, brokenLayout])
 * ```
 */
export const conditionalGroup = (states: Doc[], opts?: { id?: symbol }): GroupNode => ({
  type: 'group',
  contents: states[0],
  expandedStates: states.slice(1),
  id: opts?.id,
});

/**
 * Increase indentation by one tab level for `contents`.
 */
export const indent = (contents: Doc): IndentNode => ({
  type: 'indent',
  contents,
});

/**
 * Increase indentation by exactly `n` spaces (not a tab level).
 *
 * Special values:
 *
 * - Positive integer: add `n` spaces of alignment.
 * - `-1`: dedent by one level (see `dedent()`).
 * - `Number.NEGATIVE_INFINITY`: reset to root (see `dedentToRoot()`).
 * - `{ type: 'root' }`: mark current indent as root (see `markAsRoot()`).
 */
export const align = (n: number | { type: 'root' }, contents: Doc): AlignNode => ({
  type: 'align',
  n,
  contents,
});

/**
 * Decrease indentation by one level.
 */
export const dedent = (contents: Doc): AlignNode => align(-1, contents);

/**
 * Reset indentation to the root level (column 0, or the position set by
 * `markAsRoot`). Equivalent to `align(Number.NEGATIVE_INFINITY, contents)`.
 */
export const dedentToRoot = (contents: Doc): AlignNode => align(Number.NEGATIVE_INFINITY, contents);

/**
 * Mark the current indentation as the "root" position. Content inside
 * `markAsRoot` that uses `literalline` will indent to this position
 * rather than column 0. Used for embedded/template content.
 */
export const markAsRoot = (contents: Doc): AlignNode => align({ type: 'root' }, contents);

/**
 * Wrapping layout. `parts` should alternate content and line-break docs:
 *
 * ```ts
 * fill([item1, line, item2, line, item3])
 * ```
 *
 * The engine fills each line with as many items as fit before breaking.
 */
export const fill = (parts: Doc[]): FillNode => ({
  type: 'fill',
  parts,
});

/**
 * Print `breakContents` if the enclosing group (or the group identified
 * by `groupId`) is in broken mode; otherwise print `flatContents`.
 */
export const ifBreak = (
  breakContents: Doc,
  flatContents?: Doc,
  opts?: { groupId?: symbol }
): IfBreakNode => ({
  type: 'if-break',
  breakContents,
  flatContents: flatContents ?? '',
  groupId: opts?.groupId,
});

/**
 * Conditionally indent based on a referenced group's mode. Optimized form
 * of `ifBreak(indent(doc), doc, { groupId })`.
 *
 * When the referenced group is broken, contents are indented. When the
 * referenced group is flat, contents are not indented. Set `negate: true`
 * to reverse this behavior.
 */
export const indentIfBreak = (
  contents: Doc,
  opts: { groupId: symbol; negate?: boolean }
): IndentIfBreakNode => ({
  type: 'indent-if-break',
  contents,
  groupId: opts.groupId,
  negate: opts.negate,
});

/**
 * Buffer `contents` and emit at the end of the current line. Used for trailing
 * comments: the comment text is deferred until just before the next newline.
 *
 * ```ts
 * [text("stmt"), lineSuffix(" # comment"), text(";"), hardline]
 * // stmt; # comment\n
 * ```
 */
export const lineSuffix = (contents: Doc): LineSuffixNode => ({
  type: 'line-suffix',
  contents,
});

/**
 * Force-flush any pending lineSuffix. Prevents comment leakage across
 * syntactic boundaries.
 */
export const lineSuffixBoundary: LineSuffixBoundaryNode = { type: 'line-suffix-boundary' };

/**
 * Annotate a doc with a label. No effect on layout. Returns `contents`
 * unwrapped if `label` is falsy.
 */
export const label = (lbl: unknown, contents: Doc): Doc =>
  lbl ? ({ type: 'label', label: lbl, contents } as LabelNode) : contents;

/**
 * Trim all trailing whitespace at the end of the current line. Used for
 * removing extra indentation on blank lines.
 */
export const trim: TrimNode = { type: 'trim' };

/**
 * Placeholder for cursor position tracking. After layout, the result
 * reports the cursor offset in the output string. Can be used to maintain
 * cursor position after formatting.
 *
 * @todo Rename to "sentinel"?
 */
export const cursor: CursorNode = { type: 'cursor' };

/**
 * Join an array of docs with a separator doc between each pair.
 */
export const join = (separator: Doc, docs: Doc[]): Doc[] => {
  const parts: Doc[] = [];

  for (let i = 0; i < docs.length; i++) {
    if (i > 0) parts.push(separator);
    parts.push(docs[i]);
  }

  return parts;
};

/**
 * Common pattern: a bracketed, optionally-indented list.
 *
 * ```ts
 * bracketedList("(", ")", ",", [a, b, c])
 * ```
 *
 * Flat:  `(a, b, c)`.
 *
 * Broken:
 *
 * ```
 * (
 *   a,
 *   b,
 *   c
 * )
 * ```
 */
export const bracketedList = (
  open: string,
  close: string,
  separator: string,
  items: Doc[]
): Doc => {
  if (items.length === 0) return [open, close];

  return group([
    text(open),
    indent([softline, join([text(separator), line], items)]),
    softline,
    text(close),
  ]);
};

/**
 * Convert an absolute indentation size into a combination of `indent` (for
 * tab-sized chunks) and `align` (for remaining spaces), wrapped in
 * `dedentToRoot`. Used for embedded content that needs a specific indentation
 * level.
 */
export const addAlignmentToDoc = (doc: Doc, size: number, tabWidth: number): Doc => {
  let aligned = doc;

  if (size > 0) {
    for (let i = 0; i < Math.floor(size / tabWidth); i++) {
      aligned = indent(aligned);
    }

    const remainder = size % tabWidth;

    if (remainder > 0) {
      aligned = align(remainder, aligned);
    }
    aligned = dedentToRoot(aligned);
  }

  return aligned;
};
