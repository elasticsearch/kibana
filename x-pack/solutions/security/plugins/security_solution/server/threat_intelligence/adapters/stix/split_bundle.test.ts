/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  composeStixBody,
  composeStixTitle,
  splitStixBundle,
  STIX_REPORTABLE_TYPES,
} from './split_bundle';

const bundle = (objects: unknown[]) => ({ type: 'bundle', id: 'bundle--1', objects });

describe('splitStixBundle', () => {
  it('keeps only reportable SDO types', () => {
    const result = splitStixBundle(
      bundle([
        { type: 'indicator', id: 'indicator--1', name: 'indicator-1' },
        { type: 'malware', id: 'malware--1', name: 'malware-1' },
        // structural — must be dropped
        { type: 'marking-definition', id: 'marking-definition--1' },
        { type: 'identity', id: 'identity--1' },
        { type: 'relationship', id: 'relationship--1' },
        // unknown — must be dropped (closed-set policy)
        { type: 'pet-rock', id: 'pet-rock--1' },
      ])
    );
    expect(result.map((r) => r.object.type)).toEqual(['indicator', 'malware']);
  });

  it('tolerates a bare objects array (no bundle envelope)', () => {
    const objects = [{ type: 'indicator', id: 'indicator--1', name: 'i1' }];
    expect(splitStixBundle(objects)).toHaveLength(1);
  });

  it('tolerates a TAXII envelope with `{ objects: [] }` and no `type`', () => {
    expect(
      splitStixBundle({ objects: [{ type: 'malware', id: 'malware--1', name: 'm1' }] })
    ).toHaveLength(1);
  });

  it('skips objects missing `id` or `type`', () => {
    expect(
      splitStixBundle(
        bundle([
          { id: 'no-type--1', name: 'no type' },
          { type: 'indicator', name: 'no id' },
          { type: 'indicator', id: 'indicator--1', name: 'good' },
        ])
      )
    ).toHaveLength(1);
  });

  it('returns [] for non-object inputs', () => {
    expect(splitStixBundle(null)).toEqual([]);
    expect(splitStixBundle('not a bundle')).toEqual([]);
    expect(splitStixBundle(undefined)).toEqual([]);
  });

  it('exposes a closed reportable type set', () => {
    expect(STIX_REPORTABLE_TYPES).toContain('indicator');
    expect(STIX_REPORTABLE_TYPES).toContain('threat-actor');
    expect(STIX_REPORTABLE_TYPES).not.toContain('marking-definition');
  });
});

describe('composeStixTitle', () => {
  it('uses `name` when present', () => {
    expect(composeStixTitle({ type: 'malware', id: 'malware--1', name: 'PetRock' })).toBe(
      'PetRock'
    );
  });
  it('falls back to `<type> <id>`', () => {
    expect(composeStixTitle({ type: 'indicator', id: 'indicator--1' })).toBe(
      'indicator indicator--1'
    );
  });
});

describe('composeStixBody', () => {
  it('joins description, abstract, summary, and indicator pattern', () => {
    const body = composeStixBody({
      type: 'indicator',
      id: 'indicator--1',
      description: 'Detects bad thing.',
      abstract: 'A summary.',
      pattern: "[file:hashes.MD5 = 'abc']",
      pattern_type: 'stix',
      labels: ['malicious-activity'],
    });
    expect(body).toContain('Detects bad thing.');
    expect(body).toContain('A summary.');
    expect(body).toContain("Pattern (stix): [file:hashes.MD5 = 'abc']");
    expect(body).toContain('Labels: malicious-activity');
  });

  it('returns a deterministic placeholder when nothing useful is set', () => {
    expect(composeStixBody({ type: 'malware', id: 'malware--1' })).toBe('STIX malware malware--1');
  });
});
