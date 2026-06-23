/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { IGNORED_DIFF_FIELDS } from '../../utils/extract_changed_field_names';
import { reconstructBefore } from './utils';

describe('reconstructBefore', () => {
  it('returns after unchanged when oldValues is empty', () => {
    const after = { name: 'test', enabled: true };

    expect(reconstructBefore(after, {})).toEqual({ name: 'test', enabled: true });
  });

  it('overrides after fields with oldValues', () => {
    const after = { name: 'new', severity: 'high' };
    const oldValues = { name: 'old' };

    expect(reconstructBefore(after, oldValues)).toEqual({ name: 'old', severity: 'high' });
  });

  it('deletes field from before when oldValues has null for that key', () => {
    const after = { name: 'test', note: 'some note' };
    const oldValues = { note: null };

    expect(reconstructBefore(after, oldValues)).toEqual({ name: 'test' });
  });

  it('adds field to before when it is absent from after but present in oldValues', () => {
    const after = { name: 'test' };
    const oldValues = { description: 'old description' };

    expect(reconstructBefore(after, oldValues)).toEqual({
      name: 'test',
      description: 'old description',
    });
  });

  const IGNORED_FIELDS_CASES = Array.from(IGNORED_DIFF_FIELDS).map((x) => [x]);

  it.each(IGNORED_FIELDS_CASES)('ignores %s key from oldValues', (fieldName) => {
    const after = { name: 'test' };
    const oldValues = { [fieldName]: 'something else' };

    expect(reconstructBefore(after, oldValues)).toEqual({
      name: 'test',
    });
  });

  it('does not mutate the after object', () => {
    const after = { name: 'test', note: 'keep' };
    const oldValues = { name: 'old' };
    const original = { ...after };

    reconstructBefore(after, oldValues);

    expect(after).toEqual(original);
  });

  it('handles multiple changes simultaneously', () => {
    const after = { name: 'new', severity: 'high', note: 'added', revision: 3 };
    const oldValues = { name: 'old', severity: null, revision: 2 };

    expect(reconstructBefore(after, oldValues)).toEqual({
      name: 'old',
      note: 'added',
      revision: 3,
    });
  });
});
