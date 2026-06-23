/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleResponse } from '../../../../../../../../common/api/detection_engine/model/rule_schema';
import { computeOldValues } from './compute_old_values';

describe('computeOldValues', () => {
  it('returns null when no previous snapshot is supplied', () => {
    expect(computeOldValues(asRule({ name: 'a' }), undefined)).toBeNull();
  });

  it('returns an empty object when the two snapshots are deep-equal', () => {
    const rule = asRule({ name: 'a', tags: ['x', 'y'], note: { blob: 'n' } });
    const previous = asRule({ name: 'a', tags: ['x', 'y'], note: { blob: 'n' } });
    expect(computeOldValues(rule, previous)).toEqual({});
  });

  it('emits only the previous value of changed top-level scalar fields', () => {
    const patch = computeOldValues(
      asRule({ name: 'B', enabled: true }),
      asRule({ name: 'A', enabled: true })
    );
    expect(patch).toEqual({ name: 'A' });
  });

  it('recurses into nested objects and emits only changed keys', () => {
    const patch = computeOldValues(
      asRule({ note: { blob: 'new', author: 'alice' } }),
      asRule({ note: { blob: 'old', author: 'alice' } })
    );
    expect(patch).toEqual({ note: { blob: 'old' } });
  });

  it('omits arrays of objects when their contents are deep-equal', () => {
    const threat = [{ framework: 'MITRE', tactic: { id: 'TA0003', name: 'Persistence' } }];
    const patch = computeOldValues(
      asRule({ threat: [{ framework: 'MITRE', tactic: { id: 'TA0003', name: 'Persistence' } }] }),
      asRule({ threat: [{ framework: 'MITRE', tactic: { id: 'TA0003', name: 'Persistence' } }] })
    );
    expect(patch).toEqual({});
    // Verify array reference inequality did not cause a false positive
    expect(threat).not.toBe(patch);
  });

  it('emits the entire previous array when arrays differ', () => {
    const patch = computeOldValues(asRule({ tags: ['x', 'z'] }), asRule({ tags: ['x', 'y'] }));
    expect(patch).toEqual({ tags: ['x', 'y'] });
  });

  it('emits the entire previous array when items order does not match', () => {
    const current = [{ foo: 'bar' }, 20];
    const prev = [20, { foo: 'bar' }];

    const patch = computeOldValues(
      asRule({
        threat: current,
      }),
      asRule({
        threat: prev,
      })
    );
    expect(patch).toEqual({ threat: prev });
  });

  it('emits `null` for keys present in current but missing in previous (addition)', () => {
    const patch = computeOldValues(asRule({ name: 'a', interval: '5m' }), asRule({ name: 'a' }));
    expect(patch).toEqual({ interval: null });
  });

  it('emits the previous value for keys present in previous but missing in current (deletion)', () => {
    const patch = computeOldValues(asRule({ name: 'a' }), asRule({ name: 'a', interval: '5m' }));
    expect(patch).toEqual({ interval: '5m' });
  });

  it('groups multiple top-level differences into a single patch', () => {
    const patch = computeOldValues(
      asRule({ name: 'B', severity: 'high', tags: [] }),
      asRule({ name: 'A', severity: 'high', tags: ['x'] })
    );
    expect(patch).toEqual({ name: 'A', tags: ['x'] });
  });

  it('omits nested object keys when their subtree is unchanged', () => {
    const patch = computeOldValues(
      asRule({ schedule: { interval: '5m', other: 1 } }),
      asRule({ schedule: { interval: '5m', other: 1 } })
    );
    expect(patch).toEqual({});
  });

  it('emits null when a field transitions from undefined to a value (e.g. note added)', () => {
    const patch = computeOldValues(
      asRule({ name: 'a', note: 'investigation guide' }),
      asRule({ name: 'a', note: undefined })
    );
    expect(patch).toEqual({ note: null });
  });

  it('emits the previous value when a field transitions from a value to undefined (e.g. note cleared)', () => {
    const patch = computeOldValues(
      asRule({ name: 'a', note: undefined }),
      asRule({ name: 'a', note: 'old guide' })
    );
    expect(patch).toEqual({ note: 'old guide' });
  });

  it('treats keys with undefined values identically to absent keys', () => {
    const patchFromUndefined = computeOldValues(
      asRule({ name: 'a', note: 'new' }),
      asRule({ name: 'a', note: undefined })
    );
    const patchFromAbsent = computeOldValues(
      asRule({ name: 'a', note: 'new' }),
      asRule({ name: 'a' })
    );
    expect(patchFromUndefined).toEqual(patchFromAbsent);
  });
});

const asRule = (overrides: Record<string, unknown>): RuleResponse =>
  overrides as unknown as RuleResponse;
