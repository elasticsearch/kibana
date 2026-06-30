/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { negativeCases } from './negative_cases';
import type { AnonymizedAlert, AttackDiscoveryDatasetExample } from '../types';

const alertsOf = (example: AttackDiscoveryDatasetExample): AnonymizedAlert[] => {
  const input = example.input as { anonymizedAlerts?: AnonymizedAlert[] } | undefined;
  return input?.anonymizedAlerts ?? [];
};

const idOf = (alert: AnonymizedAlert): string | undefined =>
  alert.pageContent.match(/^_id,(.+)$/m)?.[1].trim();

/**
 * Guards the negative-case fixtures. The count assertion makes accidental drops
 * loud; the per-example invariants protect the contract the deterministic
 * evaluators rely on — in particular the `_id,<id>` line that the Alert-ID
 * Grounding evaluator parses to build the valid-ID set.
 */
describe('negativeCases dataset', () => {
  it('has the expected number of examples', () => {
    expect(negativeCases).toHaveLength(8);
  });

  it.each(negativeCases.map((example, index) => [index, example] as const))(
    'example %i is a well-formed negative case',
    (_index, example) => {
      // Tagged negative so quality evaluators are gated and No-Fabrication scores it.
      expect(example.metadata?.testType).toBe('negative');
      expect(['medium', 'hard']).toContain(example.metadata?.difficulty);

      // Benign bundles must carry alerts; an empty bundle would not exercise the model.
      expect(example.input?.mode).toBe('bundledAlerts');
      const alerts = alertsOf(example);
      expect(alerts.length).toBeGreaterThan(0);

      // Every alert must expose an `_id,<id>` line — the grounding evaluator's contract.
      for (const alert of alerts) {
        expect(alert.pageContent).toMatch(/^_id,.+$/m);
      }

      // The expected output for a negative case is "no attack discovery".
      expect(example.output?.attackDiscoveries).toEqual([]);
    }
  );

  it('uses unique alert IDs across the whole dataset', () => {
    const ids = negativeCases.flatMap((example) => alertsOf(example).map(idOf));
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes hard near-miss cases so the metric can discriminate', () => {
    const hard = negativeCases.filter((example) => example.metadata?.difficulty === 'hard');
    expect(hard.length).toBeGreaterThanOrEqual(3);
  });
});
