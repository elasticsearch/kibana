/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CATALOG_META, subtechniques, tactics, techniques } from '.';
import { subtechniqueById } from '../lookup/subtechnique_by_id';
import { tacticsToIds } from '../lookup/tactics_to_ids';
import { techniqueById } from '../lookup/technique_by_id';

describe('mitre catalog', () => {
  it('exposes a non-empty catalog', () => {
    expect(tactics.length).toBeGreaterThan(0);
    expect(techniques.length).toBeGreaterThan(0);
    expect(subtechniques.length).toBeGreaterThan(0);
  });

  it('every tactic has a TAxxxx id, a name, a reference URL, and a camelCase value', () => {
    for (const t of tactics) {
      expect(t.id).toMatch(/^TA\d{4}$/);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.reference).toMatch(/^https:\/\/attack\.mitre\.org\/tactics\//);
      expect(t.value).toMatch(/^[a-z][a-zA-Z]*$/);
    }
  });

  it('every technique has a Tnnnn id, references at least one tactic, and carries a non-empty value', () => {
    for (const t of techniques) {
      expect(t.id).toMatch(/^T\d{4}$/);
      expect(t.tactics.length).toBeGreaterThan(0);
      expect(t.value.length).toBeGreaterThan(0);
    }
  });

  it('every subtechnique has a Tnnnn.nnn id, a parent technique that exists in the catalog, and a non-empty value', () => {
    for (const s of subtechniques) {
      expect(s.id).toMatch(/^T\d{4}\.\d{3}$/);
      expect(techniqueById.get(s.techniqueId)).toBeDefined();
      expect(s.value.length).toBeGreaterThan(0);
    }
  });

  it('lookup maps cover every technique and subtechnique', () => {
    expect(techniqueById.size).toBe(techniques.length);
    expect(subtechniqueById.size).toBe(subtechniques.length);
  });

  it('CATALOG_META carries provenance', () => {
    expect(CATALOG_META.generated_from.length).toBeGreaterThan(0);
    expect(CATALOG_META.generator.length).toBeGreaterThan(0);
    expect(CATALOG_META.regenerate_with.length).toBeGreaterThan(0);
  });

  describe('tacticsToIds', () => {
    it('translates single-word tactic short names back to TAxxxx ids', () => {
      expect(tacticsToIds(['collection'])).toEqual(['TA0009']);
      expect(tacticsToIds(['execution'])).toEqual(['TA0002']);
    });

    it('translates multi-word dash-separated tactic short names back to TAxxxx ids', () => {
      // The tactic short names on `MitreTechnique.tactics` use the dash form
      // (e.g. `command-and-control`); the catalog stores them as camelCase
      // `value` (e.g. `commandAndControl`). tacticsToIds bridges the two by
      // normalizing both sides.
      expect(tacticsToIds(['initial-access'])).toEqual(['TA0001']);
      expect(tacticsToIds(['command-and-control'])).toEqual(['TA0011']);
      expect(tacticsToIds(['credential-access'])).toEqual(['TA0006']);
    });

    it('handles a mixed batch in one call', () => {
      expect(tacticsToIds(['execution', 'command-and-control', 'collection'])).toEqual([
        'TA0002',
        'TA0011',
        'TA0009',
      ]);
    });

    it('drops unknown tactic values silently', () => {
      expect(tacticsToIds(['initial-access', 'not-a-real-tactic'])).toEqual(['TA0001']);
    });

    it('returns an empty array for an empty input', () => {
      expect(tacticsToIds([])).toEqual([]);
    });
  });
});
