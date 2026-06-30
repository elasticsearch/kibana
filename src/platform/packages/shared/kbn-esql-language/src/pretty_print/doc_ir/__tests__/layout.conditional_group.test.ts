/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { text, softline, hardline, group, indent, conditionalGroup, join, layout } from '..';

describe('conditionalGroup', () => {
  it('uses first state (flat) when it fits', () => {
    const items = [text('alpha'), text('beta'), text('gamma')];

    const doc = conditionalGroup([
      // Phase 1: flat with spaces — "alpha, beta, gamma" = 18 chars
      group(join(text(', '), items)),
      // Phase 2: compact (softline = nothing flat) — "alpha,beta,gamma" = 16 chars
      group(join([text(','), softline], items)),
      // Phase 3: one per line
      group([indent([hardline, join([text(','), hardline], items)]), hardline], {
        shouldBreak: true,
      }),
    ]);

    expect(layout(doc, { printWidth: 20 })).toBe('alpha, beta, gamma');
  });

  it('falls to second state (compact) when first does not fit', () => {
    const items = [text('alpha'), text('beta'), text('gamma')];

    const doc = conditionalGroup([
      // Phase 1: flat with spaces — 18 chars (too long at width 17)
      group(join(text(', '), items)),
      // Phase 2: compact — 16 chars (fits at width 17)
      group(join([text(','), softline], items)),
      // Phase 3: one per line
      group([indent([hardline, join([text(','), hardline], items)]), hardline], {
        shouldBreak: true,
      }),
    ]);

    expect(layout(doc, { printWidth: 17 })).toBe('alpha,beta,gamma');
  });

  it('falls to last state (broken) when nothing else fits', () => {
    const items = [text('alpha'), text('beta'), text('gamma')];

    const doc = conditionalGroup([
      // Phase 1: 18 chars
      group(join(text(', '), items)),
      // Phase 2: 16 chars
      group(join([text(','), softline], items)),
      // Phase 3: one per line
      group([indent([hardline, join([text(','), hardline], items)]), hardline], {
        shouldBreak: true,
      }),
    ]);

    expect(layout(doc, { printWidth: 8 })).toBe('\n  alpha,\n  beta,\n  gamma\n');
  });

  it('three-phase list with brackets', () => {
    const items = [text('alpha'), text('beta'), text('gamma'), text('delta')];
    const sep = text(',');

    const doc = conditionalGroup([
      // Phase 1: all on one line — "(alpha, beta, gamma, delta)" = 27
      group([text('('), join([sep, text(' ')], items), text(')')]),
      // Phase 2: compact (no spaces) — "(alpha,beta,gamma,delta)" = 24
      group([text('('), join([sep, softline], items), text(')')]),
      // Phase 3: one per line
      group([text('('), indent([hardline, join([sep, hardline], items)]), hardline, text(')')], {
        shouldBreak: true,
      }),
    ]);

    // Phase 1 fits at width 30
    expect(layout(doc, { printWidth: 30 })).toBe('(alpha, beta, gamma, delta)');
    // Phase 1 = 27 > 25, Phase 2 = 24 ≤ 25 → compact
    expect(layout(doc, { printWidth: 25 })).toBe('(alpha,beta,gamma,delta)');
    // All > 10 → Phase 3 break
    expect(layout(doc, { printWidth: 10 })).toBe('(\n  alpha,\n  beta,\n  gamma,\n  delta\n)');
  });

  it('with two states only', () => {
    const doc = conditionalGroup([
      // Try flat
      join([text(', ')], [text('aaa'), text('bbb'), text('ccc')]),
      // Fallback: broken
      group(
        [indent([hardline, join([text(','), hardline], [text('aaa'), text('bbb'), text('ccc')])])],
        { shouldBreak: true }
      ),
    ]);

    expect(layout(doc, { printWidth: 20 })).toBe('aaa, bbb, ccc');
    expect(layout(doc, { printWidth: 10 })).toBe('\n  aaa,\n  bbb,\n  ccc');
  });
});
