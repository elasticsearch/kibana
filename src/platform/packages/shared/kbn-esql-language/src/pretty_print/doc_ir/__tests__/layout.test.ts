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
  group,
  indent,
  align,
  ifBreak,
  indentIfBreak,
  join,
  bracketedList,
  trim,
  layout,
} from '..';

describe('layout()', () => {
  it('hardline forces parent group to break', () => {
    const doc = group([text('a'), hardline, text('b')]);

    expect(layout(doc, { printWidth: 80 })).toBe('a\nb');
  });

  it('hardline propagates through nested groups', () => {
    const inner = group([text('x'), hardline, text('y')]);
    const outer = group([text('('), line, inner, line, text(')')]);

    expect(layout(outer, { printWidth: 80 })).toBe('(\nx\ny\n)');
  });

  it('hardline propagates through deeply nested groups', () => {
    const innermost = group([text('a'), hardline, text('b')]);
    const middle = group([text('['), line, innermost, line, text(']')]);
    const outer = group([text('('), line, middle, line, text(')')]);

    expect(layout(outer, { printWidth: 80 })).toBe('(\n[\na\nb\n]\n)');
  });

  it('does not break sibling groups', () => {
    const broken = group([text('a'), hardline, text('b')]);
    const intact = group([text('c'), line, text('d')]);
    const doc = [broken, text(' | '), intact];

    expect(layout(doc, { printWidth: 80 })).toBe('a\nb | c d');
  });

  it('handles indent inside group with hardline', () => {
    const doc = group([text('start'), indent([hardline, text('body')]), hardline, text('end')]);

    expect(layout(doc, { printWidth: 80 })).toBe('start\n  body\nend');
  });

  describe('string rendering', () => {
    it('renders a plain string', () => {
      expect(layout('hello')).toBe('hello');
    });

    it('renders concatenated strings', () => {
      expect(layout([text('a'), text('b'), text('c')])).toBe('abc');
    });

    it('renders empty string for empty doc', () => {
      expect(layout('')).toBe('');
    });

    it('renders empty array', () => {
      expect(layout([])).toBe('');
    });
  });

  describe('group', () => {
    it('renders flat when content fits', () => {
      const doc = group([text('('), text('hello'), text(')')]);
      expect(layout(doc, { printWidth: 80 })).toBe('(hello)');
    });

    it('breaks when content exceeds width', () => {
      const doc = group([text('('), indent([softline, text('hello')]), softline, text(')')]);
      expect(layout(doc, { printWidth: 5 })).toBe('(\n  hello\n)');
    });

    it('respects shouldBreak option', () => {
      const doc = group([text('a'), line, text('b')], { shouldBreak: true });
      expect(layout(doc, { printWidth: 80 })).toBe('a\nb');
    });

    it('nested groups break outermost first', () => {
      const inner = group([text('['), indent([softline, text('x')]), softline, text(']')]);
      const outer = group([text('func('), indent([softline, inner]), softline, text(')')]);
      // At width 8: outer breaks (func([x]) = 9 > 8), inner stays flat ([x] = 3 ≤ 8-2)
      expect(layout(outer, { printWidth: 8 })).toBe('func(\n  [x]\n)');
    });
  });

  describe('indent', () => {
    it('indents content after line break', () => {
      const doc = group([text('start'), indent([line, text('indented')])], { shouldBreak: true });
      expect(layout(doc, { printWidth: 80 })).toBe('start\n  indented');
    });

    it('uses configured tabWidth', () => {
      const doc = group([text('x'), indent([line, text('y')])], { shouldBreak: true });
      expect(layout(doc, { printWidth: 80, tabWidth: 4 })).toBe('x\n    y');
    });

    it('nests multiple indents', () => {
      const doc = group([text('a'), indent([line, text('b'), indent([line, text('c')])])], {
        shouldBreak: true,
      });
      expect(layout(doc, { printWidth: 80 })).toBe('a\n  b\n    c');
    });
  });

  describe('line variants', () => {
    it('line renders as space in flat mode', () => {
      const doc = group([text('a'), line, text('b')]);
      expect(layout(doc, { printWidth: 80 })).toBe('a b');
    });

    it('softline renders as nothing in flat mode', () => {
      const doc = group([text('a'), softline, text('b')]);
      expect(layout(doc, { printWidth: 80 })).toBe('ab');
    });

    it('line renders as newline+indent in break mode', () => {
      const doc = group([text('a'), line, text('b')], { shouldBreak: true });
      expect(layout(doc, { printWidth: 80 })).toBe('a\nb');
    });

    it('softline renders as newline+indent in break mode', () => {
      const doc = group([text('a'), softline, text('b')], { shouldBreak: true });
      expect(layout(doc, { printWidth: 80 })).toBe('a\nb');
    });

    it('hardline always renders as newline', () => {
      const doc = [text('a'), hardline, text('b')];
      expect(layout(doc, { printWidth: 80 })).toBe('a\nb');
    });
  });

  describe('ifBreak', () => {
    it('uses flatContents when group is flat', () => {
      const doc = group([text('('), ifBreak(text('BREAK'), text('FLAT')), text(')')]);
      expect(layout(doc, { printWidth: 80 })).toBe('(FLAT)');
    });

    it('uses breakContents when group is broken', () => {
      const doc = group([text('('), ifBreak(text('BREAK'), text('FLAT')), text(')')], {
        shouldBreak: true,
      });
      expect(layout(doc, { printWidth: 80 })).toBe('(BREAK)');
    });

    it('references another group via groupId', () => {
      const gid = Symbol('g');
      const doc = [
        group(text('x'), { id: gid, shouldBreak: true }),
        ifBreak(text('YES'), text('NO'), { groupId: gid }),
      ];
      expect(layout(doc, { printWidth: 80 })).toBe('xYES');
    });

    it('trailing comma only when broken', () => {
      const listId = Symbol('list');
      const doc = group(
        [
          text('('),
          indent([
            softline,
            join([text(','), line], [text('a'), text('b'), text('c')]),
            ifBreak(text(','), text(''), { groupId: listId }),
          ]),
          softline,
          text(')'),
        ],
        { id: listId }
      );

      expect(layout(doc, { printWidth: 20 })).toBe('(a, b, c)');
      expect(layout(doc, { printWidth: 5 })).toBe('(\n  a,\n  b,\n  c,\n)');
    });
  });

  describe('indentIfBreak', () => {
    it('applies indent when referenced group breaks', () => {
      const gid = Symbol('g');
      const doc = group([text('return'), indentIfBreak([line, text('value')], { groupId: gid })], {
        id: gid,
      });
      expect(layout(doc, { printWidth: 10 })).toBe('return\n  value');
    });

    it('does not indent when referenced group is flat', () => {
      const gid = Symbol('g');
      const doc = group([text('return'), indentIfBreak([line, text('v')], { groupId: gid })], {
        id: gid,
      });
      expect(layout(doc, { printWidth: 80 })).toBe('return v');
    });

    it('negated: indents when flat, not when broken', () => {
      const gid = Symbol('g');
      const doc = group(
        [text('x'), indentIfBreak([line, text('y')], { groupId: gid, negate: true })],
        { id: gid }
      );
      // When flat (fits at width 80), negate=true means indent IS applied
      expect(layout(doc, { printWidth: 80 })).toBe('x y');
    });
  });

  describe('align', () => {
    it('aligns by fixed number of spaces', () => {
      const doc = group([text('fn('), align(3, [text('a,'), line, text('b')])], {
        shouldBreak: true,
      });
      expect(layout(doc, { printWidth: 80 })).toBe('fn(a,\n   b');
    });
  });

  describe('trim', () => {
    it('removes trailing whitespace', () => {
      const doc = [text('hello   '), trim, text('world')];
      expect(layout(doc, { printWidth: 80 })).toBe('helloworld');
    });
  });

  describe('bracketedList', () => {
    it('renders flat when it fits', () => {
      const doc = bracketedList('(', ')', ',', [text('a'), text('b'), text('c')]);
      expect(layout(doc, { printWidth: 40 })).toBe('(a, b, c)');
    });

    it('breaks when too wide', () => {
      const doc = bracketedList('(', ')', ',', [text('alpha'), text('beta'), text('gamma')]);
      expect(layout(doc, { printWidth: 15 })).toBe('(\n  alpha,\n  beta,\n  gamma\n)');
    });

    it('renders empty brackets for no items', () => {
      expect(layout(bracketedList('(', ')', ',', []))).toBe('()');
    });
  });

  describe('nested structures', () => {
    it('nested bracketed lists', () => {
      const inner = bracketedList('{', '}', ',', [text('a'), text('b')]);
      const outer = bracketedList('(', ')', ',', [text('fn'), inner, text('c')]);

      expect(layout(outer, { printWidth: 30 })).toBe('(fn, {a, b}, c)');
    });

    it('binary operator with conditional indentation', () => {
      const doc = group([text('left_operand'), indent([line, text('+ '), text('right_operand')])]);
      expect(layout(doc, { printWidth: 40 })).toBe('left_operand + right_operand');
      expect(layout(doc, { printWidth: 20 })).toBe('left_operand\n  + right_operand');
    });
  });

  describe('end-of-line', () => {
    it('uses \\r\\n when configured', () => {
      const doc = group([text('a'), line, text('b')], { shouldBreak: true });
      expect(layout(doc, { printWidth: 80, endOfLine: '\r\n' })).toBe('a\r\nb');
    });
  });
});
