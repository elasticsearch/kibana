/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  text,
  line,
  softline,
  hardline,
  hardlineWithoutBreakParent,
  literalline,
  literallineWithoutBreakParent,
  breakParent,
  group,
  conditionalGroup,
  indent,
  indentIfBreak,
  align,
  dedent,
  dedentToRoot,
  markAsRoot,
  fill,
  ifBreak,
  lineSuffix,
  lineSuffixBoundary,
  label,
  trim,
  cursor,
  join,
  bracketedList,
  addAlignmentToDoc,
} from '..';

describe('builders', () => {
  describe('text', () => {
    it('returns the string unchanged', () => {
      expect(text('hello')).toBe('hello');
    });

    it('returns empty string for empty input', () => {
      expect(text('')).toBe('');
    });
  });

  describe('line primitives', () => {
    it('line is a LineDoc with no flags', () => {
      expect(line).toEqual({ type: 'line' });
    });

    it('softline has soft: true', () => {
      expect(softline).toEqual({ type: 'line', soft: true });
    });

    it('hardline is [hardlineWithoutBreakParent, breakParent]', () => {
      expect(hardline).toEqual([{ type: 'line', hard: true }, { type: 'break-parent' }]);
    });

    it('hardlineWithoutBreakParent is a hard LineDoc', () => {
      expect(hardlineWithoutBreakParent).toEqual({ type: 'line', hard: true });
    });

    it('literalline is [literalLineDoc, breakParent]', () => {
      expect(literalline).toEqual([
        { type: 'line', hard: true, literal: true },
        { type: 'break-parent' },
      ]);
    });

    it('literallineWithoutBreakParent is a hard+literal LineDoc', () => {
      expect(literallineWithoutBreakParent).toEqual({
        type: 'line',
        hard: true,
        literal: true,
      });
    });

    it('breakParent is a BreakParentDoc', () => {
      expect(breakParent).toEqual({ type: 'break-parent' });
    });
  });

  describe('group', () => {
    it('creates a GroupDoc with contents', () => {
      const doc = group(text('hello'));
      expect(doc).toEqual({ type: 'group', contents: 'hello' });
    });

    it('passes shouldBreak option', () => {
      const doc = group(text('x'), { shouldBreak: true });
      expect(doc).toEqual({ type: 'group', contents: 'x', shouldBreak: true });
    });

    it('passes id option', () => {
      const id = Symbol('test');
      const doc = group(text('x'), { id });
      expect(doc).toEqual({ type: 'group', contents: 'x', id });
    });
  });

  describe('conditionalGroup', () => {
    it('sets first state as contents and rest as expandedStates', () => {
      const doc = conditionalGroup([text('flat'), text('wrapped'), text('broken')]);
      expect(doc).toEqual({
        type: 'group',
        contents: 'flat',
        expandedStates: ['wrapped', 'broken'],
      });
    });

    it('passes id option', () => {
      const id = Symbol('cg');
      const doc = conditionalGroup([text('a'), text('b')], { id });
      expect(doc.id).toBe(id);
    });
  });

  describe('indent', () => {
    it('creates an IndentDoc', () => {
      const doc = indent(text('hello'));
      expect(doc).toEqual({ type: 'indent', contents: 'hello' });
    });
  });

  describe('align', () => {
    it('creates an AlignDoc with positive n', () => {
      const doc = align(4, text('hello'));
      expect(doc).toEqual({ type: 'align', n: 4, contents: 'hello' });
    });

    it('accepts { type: "root" } for markAsRoot', () => {
      const doc = align({ type: 'root' }, text('x'));
      expect(doc).toEqual({ type: 'align', n: { type: 'root' }, contents: 'x' });
    });
  });

  describe('dedent / dedentToRoot / markAsRoot', () => {
    it('dedent wraps align(-1)', () => {
      const doc = dedent(text('hello'));
      expect(doc).toEqual({ type: 'align', n: -1, contents: 'hello' });
    });

    it('dedentToRoot wraps align(-Infinity)', () => {
      const doc = dedentToRoot(text('hello'));
      expect(doc).toEqual({
        type: 'align',
        n: Number.NEGATIVE_INFINITY,
        contents: 'hello',
      });
    });

    it('markAsRoot wraps align({ type: "root" })', () => {
      const doc = markAsRoot(text('hello'));
      expect(doc).toEqual({
        type: 'align',
        n: { type: 'root' },
        contents: 'hello',
      });
    });
  });

  describe('fill', () => {
    it('creates a FillDoc', () => {
      const doc = fill([text('a'), line, text('b')]);
      expect(doc).toEqual({
        type: 'fill',
        parts: ['a', { type: 'line' }, 'b'],
      });
    });
  });

  describe('ifBreak', () => {
    it('creates an IfBreakDoc with default flatContents', () => {
      const doc = ifBreak(text('broken'));
      expect(doc).toEqual({
        type: 'if-break',
        breakContents: 'broken',
        flatContents: '',
      });
    });

    it('accepts explicit flatContents', () => {
      const doc = ifBreak(text('broken'), text('flat'));
      expect(doc).toEqual({
        type: 'if-break',
        breakContents: 'broken',
        flatContents: 'flat',
      });
    });

    it('passes groupId', () => {
      const gid = Symbol('g');
      const doc = ifBreak(text('b'), text('f'), { groupId: gid });
      expect(doc.groupId).toBe(gid);
    });
  });

  describe('indentIfBreak', () => {
    it('creates an IndentIfBreakDoc', () => {
      const gid = Symbol('g');
      const doc = indentIfBreak(text('x'), { groupId: gid });
      expect(doc).toEqual({
        type: 'indent-if-break',
        contents: 'x',
        groupId: gid,
      });
    });

    it('passes negate option', () => {
      const gid = Symbol('g');
      const doc = indentIfBreak(text('x'), { groupId: gid, negate: true });
      expect(doc.negate).toBe(true);
    });
  });

  describe('lineSuffix', () => {
    it('creates a LineSuffixDoc', () => {
      const doc = lineSuffix(text(' // comment'));
      expect(doc).toEqual({ type: 'line-suffix', contents: ' // comment' });
    });
  });

  describe('lineSuffixBoundary', () => {
    it('is a LineSuffixBoundaryDoc', () => {
      expect(lineSuffixBoundary).toEqual({ type: 'line-suffix-boundary' });
    });
  });

  describe('label', () => {
    it('wraps contents with a label', () => {
      const doc = label('test', text('x'));
      expect(doc).toEqual({ type: 'label', label: 'test', contents: 'x' });
    });

    it('returns contents unwrapped if label is falsy', () => {
      expect(label(null, text('x'))).toBe('x');
      expect(label(undefined, text('x'))).toBe('x');
      expect(label('', text('x'))).toBe('x');
      expect(label(0, text('x'))).toBe('x');
    });
  });

  describe('trim', () => {
    it('is a TrimDoc', () => {
      expect(trim).toEqual({ type: 'trim' });
    });
  });

  describe('cursor', () => {
    it('is a CursorDoc', () => {
      expect(cursor).toEqual({ type: 'cursor' });
    });
  });

  describe('join', () => {
    it('interleaves separator between docs', () => {
      const doc = join(text(', '), [text('a'), text('b'), text('c')]);
      expect(doc).toEqual(['a', ', ', 'b', ', ', 'c']);
    });

    it('returns empty array for empty input', () => {
      expect(join(text(', '), [])).toEqual([]);
    });

    it('returns single item without separator', () => {
      expect(join(text(', '), [text('a')])).toEqual(['a']);
    });
  });

  describe('bracketedList', () => {
    it('returns [open, close] for empty items', () => {
      expect(bracketedList('(', ')', ',', [])).toEqual(['(', ')']);
    });

    it('creates a group with indent and softlines', () => {
      const doc = bracketedList('(', ')', ',', [text('a'), text('b')]);
      expect(doc).toEqual(
        group(['(', indent([softline, join([',', line], ['a', 'b'])]), softline, ')'])
      );
    });
  });

  describe('addAlignmentToDoc', () => {
    it('returns doc unchanged when size is 0', () => {
      const doc = text('x');
      expect(addAlignmentToDoc(doc, 0, 2)).toBe('x');
    });

    it('wraps with indent for tab-sized chunks', () => {
      const doc = addAlignmentToDoc(text('x'), 4, 2);
      expect(doc).toEqual(dedentToRoot(indent(indent(text('x')))));
    });

    it('uses align for remainder', () => {
      const doc = addAlignmentToDoc(text('x'), 5, 2);
      expect(doc).toEqual(dedentToRoot(align(1, indent(indent(text('x'))))));
    });
  });
});
