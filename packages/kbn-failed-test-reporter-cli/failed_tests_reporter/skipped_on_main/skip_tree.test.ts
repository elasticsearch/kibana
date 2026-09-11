/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Fs from 'fs';
import Path from 'path';

import { findSkipForFullTitle, findSkipForScoutFailure, parseSuiteTree } from './skip_tree';

const fixture = (name: string) =>
  Fs.readFileSync(Path.resolve(__dirname, '__fixtures__', `${name}.ts.txt`), 'utf8');

describe('parseSuiteTree', () => {
  it('builds the describe/test tree for mocha style FTR files', () => {
    const tree = parseSuiteTree(`
      export default function ({ getService }) {
        describe('outer', function () {
          before(async () => {});
          it('first', async () => {});
          describe('inner', () => {
            it('second', () => {});
          });
        });
      }
    `);

    expect(tree).toEqual([
      {
        kind: 'describe',
        title: 'outer',
        skipped: false,
        children: [
          { kind: 'test', title: 'first', skipped: false, children: [] },
          {
            kind: 'describe',
            title: 'inner',
            skipped: false,
            children: [{ kind: 'test', title: 'second', skipped: false, children: [] }],
          },
        ],
      },
    ]);
  });

  it('marks .skip, .fixme, xit and xdescribe as skipped and picks up the issue comment', () => {
    const tree = parseSuiteTree(`
      // Failing: See https://github.com/elastic/kibana/issues/123
      describe.skip('a', () => {
        xit('b', () => {});
        it.skip('c', () => {});
        test.fixme('d', async () => {});
      });
      xdescribe('e', () => {});
      describe('f', () => {});
    `);

    expect(tree.map(({ title, skipped, issue }) => ({ title, skipped, issue }))).toEqual([
      { title: 'a', skipped: true, issue: 'https://github.com/elastic/kibana/issues/123' },
      { title: 'e', skipped: true, issue: undefined },
      { title: 'f', skipped: false, issue: undefined },
    ]);
    expect(tree[0].children.map(({ title, skipped }) => ({ title, skipped }))).toEqual([
      { title: 'b', skipped: true },
      { title: 'c', skipped: true },
      { title: 'd', skipped: true },
    ]);
  });

  it('handles Scout callee chains and options objects', () => {
    const tree = parseSuiteTree(`
      apiTest.describe.skip('api suite', { tag: tags.stateful.classic }, () => {
        apiTest('case', async ({ apiClient }) => {});
      });
      spaceTest.describe.serial('ui suite', () => {
        spaceTest.skip('flaky', async () => {});
      });
    `);

    expect(tree).toEqual([
      {
        kind: 'describe',
        title: 'api suite',
        skipped: true,
        issue: undefined,
        children: [{ kind: 'test', title: 'case', skipped: false, children: [] }],
      },
      {
        kind: 'describe',
        title: 'ui suite',
        skipped: false,
        children: [{ kind: 'test', title: 'flaky', skipped: true, issue: undefined, children: [] }],
      },
    ]);
  });

  it('records dynamic titles as null so they never match', () => {
    const tree = parseSuiteTree(
      'describe.skip(`dynamic ${x}`, () => {}); describe(title, () => {});'
    );
    expect(tree.map(({ title }) => title)).toEqual([null, null]);
    expect(findSkipForFullTitle(tree, 'dynamic 1 test')).toBeUndefined();
  });
});

describe('findSkipForFullTitle', () => {
  const tree = parseSuiteTree(fixture('ftr_cases_configure_legacy.after'));

  it('matches a test under a skipped describe, after parent-file suite titles', () => {
    const match = findSkipForFullTitle(
      tree,
      'Cases Configure - legacy custom fields and templates Custom fields adds a custom field'
    );
    expect(match?.title).toBe('Configure - legacy custom fields and templates');
    expect(match?.issue).toBe('https://github.com/elastic/kibana/issues/280016');
  });

  it('matches before/after hook failures of a skipped describe', () => {
    const suite = 'Cases Configure - legacy custom fields and templates';
    expect(findSkipForFullTitle(tree, `${suite} "before all" hook in "${suite}"`)).toBeDefined();
    expect(
      findSkipForFullTitle(
        tree,
        `${suite} Custom fields "before each" hook for "adds a custom field"`
      )
    ).toBeDefined();
    expect(findSkipForFullTitle(tree, `${suite} "after all" hook`)).toBeDefined();
  });

  it('does not match when the file has no skip covering the test', () => {
    const before = parseSuiteTree(fixture('ftr_cases_configure_legacy.before'));
    expect(
      findSkipForFullTitle(
        before,
        'Cases Configure - legacy custom fields and templates Custom fields adds a custom field'
      )
    ).toBeUndefined();
  });

  it('anchors the chain at the end of the full title, after unknown parent suites', () => {
    const t = parseSuiteTree(`describe.skip('alert', () => { it('runs', () => {}); });`);
    expect(findSkipForFullTitle(t, 'alerting rules alert runs')?.title).toBe('alert');
    expect(findSkipForFullTitle(t, 'alert runs')?.title).toBe('alert');
    expect(findSkipForFullTitle(t, 'alerting rules alerts runs')).toBeUndefined();
    expect(findSkipForFullTitle(t, 'alerting rules alert runs twice')).toBeUndefined();
    expect(findSkipForFullTitle(t, 'alerting runs')).toBeUndefined();
  });

  it('does not forgive an unrelated test that merely mentions a skipped root title', () => {
    const t = parseSuiteTree(`
      describe.skip('Templates', () => { it('renders', () => {}); });
      describe('Custom fields', () => { it('Templates section works', () => {}); });
    `);
    expect(findSkipForFullTitle(t, 'Cases Custom fields Templates section works')).toBeUndefined();
    expect(findSkipForFullTitle(t, 'Cases Templates renders')?.title).toBe('Templates');
  });

  it('does not match a nested skipped suite out of its chain', () => {
    const t = parseSuiteTree(`
      describe('outer', () => {
        describe.skip('inner', () => { it('t', () => {}); });
        describe('other', () => { it('inner t', () => {}); });
      });
    `);
    expect(findSkipForFullTitle(t, 'root outer inner t')?.title).toBe('inner');
    expect(findSkipForFullTitle(t, 'root outer other inner t')).toBeUndefined();
  });

  it('does not match through a dynamic title', () => {
    const t = parseSuiteTree(
      'describe.skip(`dyn ${x}`, () => { describe("inner", () => { it("t", () => {}); }); });'
    );
    expect(findSkipForFullTitle(t, 'root dyn 1 inner t')).toBeUndefined();
  });

  it('does not forgive when a shorter suffix of the title also occurs unskipped', () => {
    const t = parseSuiteTree(`
      describe('b', () => { it('c', () => {}); });
      describe('x', () => { describe.skip('b', () => { it('c', () => {}); }); });
    `);
    // 'x' may be a describe in this file or a wrapping config title; both alignments are valid.
    expect(findSkipForFullTitle(t, 'root x b c')).toBeUndefined();
    expect(findSkipForFullTitle(t, 'root b c')).toBeUndefined();
  });
});

describe('findSkipForScoutFailure', () => {
  it('matches a test whose nearest describe is skipped', () => {
    const tree = parseSuiteTree(fixture('scout_ai_indices.after'));
    const match = findSkipForScoutFailure(
      tree,
      'context engine AI indices API',
      'manages an AI index through its full lifecycle'
    );
    expect(match?.issue).toBe('https://github.com/elastic/kibana/issues/280639');
    expect(
      findSkipForScoutFailure(
        parseSuiteTree(fixture('scout_ai_indices.before')),
        'context engine AI indices API',
        'manages an AI index through its full lifecycle'
      )
    ).toBeUndefined();
  });

  it('matches through a skipped grandparent and a skipped test itself', () => {
    const tree = parseSuiteTree(`
      test.describe.skip('outer', () => {
        test.describe('inner', () => { test('t', async () => {}); });
      });
      test.describe('plain', () => {
        test.skip('flaky', async () => {});
        test('ok', async () => {});
      });
    `);
    expect(findSkipForScoutFailure(tree, 'inner', 't')?.title).toBe('outer');
    expect(findSkipForScoutFailure(tree, 'plain', 'flaky')?.title).toBe('flaky');
    expect(findSkipForScoutFailure(tree, 'plain', 'ok')).toBeUndefined();
    expect(findSkipForScoutFailure(tree, 'outer', 't')).toBeUndefined();
  });

  it('does not forgive when the same suite/title pair also occurs unskipped', () => {
    const tree = parseSuiteTree(`
      test.describe('a', () => {
        test.describe('b', () => { test('c', async () => {}); });
      });
      test.describe.skip('x', () => {
        test.describe('b', () => { test('c', async () => {}); });
      });
    `);
    expect(findSkipForScoutFailure(tree, 'b', 'c')).toBeUndefined();
  });

  it('forgives when every occurrence of the suite/title pair is skipped', () => {
    const tree = parseSuiteTree(`
      test.describe.skip('a', () => {
        test.describe('b', () => { test('c', async () => {}); });
      });
      test.describe('x', () => {
        test.describe.skip('b', () => { test('c', async () => {}); });
      });
    `);
    expect(findSkipForScoutFailure(tree, 'b', 'c')?.title).toBe('a');
  });
});
