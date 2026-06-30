/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { text, group, indent, fill, ifBreak, line, hardline } from '../builders';
import { traverse } from '../traversal';
import type { Doc } from '../types';

const collect = (doc: Doc) => {
  const entered: Doc[] = [];
  const exited: Doc[] = [];
  traverse(doc, {
    onEnter: (d) => {
      entered.push(d);
    },
    onExit: (d) => {
      exited.push(d);
    },
  });
  return { entered, exited };
};

describe('traverse', () => {
  it('visits a plain string', () => {
    const { entered, exited } = collect(text('hello'));

    expect(entered).toEqual(['hello']);
    expect(exited).toEqual(['hello']);
  });

  it('visits an array of strings in order', () => {
    const doc: Doc = [text('a'), text('b'), text('c')];
    const { entered, exited } = collect(doc);

    expect(entered).toEqual([doc, 'a', 'b', 'c']);
    expect(exited).toEqual(['a', 'b', 'c', doc]);
  });

  it('visits group and its contents', () => {
    const inner = text('x');
    const doc = group(inner);
    const { entered, exited } = collect(doc);

    expect(entered).toEqual([doc, 'x']);
    expect(exited).toEqual(['x', doc]);
  });

  it('visits nested indent > group > text', () => {
    const doc = indent(group(text('nested')));
    const entered: string[] = [];

    traverse(doc, {
      onEnter: (d) => {
        if (typeof d !== 'string' && !Array.isArray(d)) {
          entered.push(d.type);
        }
      },
    });

    expect(entered).toEqual(['indent', 'group']);
  });

  it('visits fill parts left-to-right', () => {
    const doc = fill([text('a'), line, text('b')]);
    const entered: Doc[] = [];

    traverse(doc, {
      onEnter: (d) => {
        entered.push(d);
      },
    });

    expect(entered[0]).toBe(doc);
    expect(entered[1]).toBe('a');
    expect(entered[2]).toBe(line);
    expect(entered[3]).toBe('b');
  });

  it('visits both branches of ifBreak', () => {
    const doc = ifBreak(text('broken'), text('flat'));
    const strings: string[] = [];

    traverse(doc, {
      onEnter: (d) => {
        if (typeof d === 'string') strings.push(d);
      },
    });

    expect(strings).toContain('broken');
    expect(strings).toContain('flat');
  });

  it('skips children when onEnter returns false', () => {
    const doc = group([text('a'), indent(text('b'))]);
    const entered: Doc[] = [];

    traverse(doc, {
      onEnter: (d) => {
        entered.push(d);
        // Skip the inner array's children
        if (Array.isArray(d)) return false;
      },
    });

    // group entered, then the array, but array children are skipped
    expect(entered).toHaveLength(2);
    expect(entered[0]).toBe(doc);
  });

  it('works without onExit callback', () => {
    const entered: Doc[] = [];

    traverse(hardline, {
      onEnter: (d) => {
        entered.push(d);
      },
    });

    // hardline is [LineNode, BreakParentNode]
    expect(entered).toHaveLength(3);
  });

  it('works without onEnter callback', () => {
    const exited: Doc[] = [];

    traverse(group(text('z')), {
      onExit: (d) => {
        exited.push(d);
      },
    });

    expect(exited[0]).toBe('z');
  });
});
