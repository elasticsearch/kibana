/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AD2_CLEAN_SCENARIO_KEYS } from './clean_scenarios';
import { AD2_DENSE_TARGET_ALERTS } from './dense_scenarios';
import { buildAd2SeedPlan, listAd2ScenarioKeys } from './registry';

const fixedBaseTime = new Date('2026-07-01T00:00:00.000Z');

describe('AD2 scenario registry (dense profile)', () => {
  it('seeds exactly the target alert volume', () => {
    const plan = buildAd2SeedPlan({ profile: 'dense', baseTime: fixedBaseTime });

    // The whole point of the profile is the volume. If this drifts, a "dense"
    // board silently stops being magnitude-comparable to the reference trial.
    expect(plan.alerts).toHaveLength(AD2_DENSE_TARGET_ALERTS);
    expect(AD2_DENSE_TARGET_ALERTS).toBe(95);
  });

  it('is a strict superset of the clean profile', () => {
    const clean = buildAd2SeedPlan({ profile: 'clean', baseTime: fixedBaseTime });
    const dense = buildAd2SeedPlan({ profile: 'dense', baseTime: fixedBaseTime });

    const denseIds = new Set(dense.alerts.map((alert) => alert.id));
    for (const alert of clean.alerts) {
      expect(denseIds.has(alert.id)).toBe(true);
    }
    expect(dense.alerts.length).toBeGreaterThan(clean.alerts.length);
  });

  it('keeps the four target chains addressable', () => {
    const denseKeys = listAd2ScenarioKeys('dense');
    for (const key of AD2_CLEAN_SCENARIO_KEYS) {
      expect(denseKeys).toContain(key);
    }
  });

  it('spreads background alerts across distinct hosts', () => {
    const dense = buildAd2SeedPlan({ profile: 'dense', baseTime: fixedBaseTime });
    const hosts = new Set(
      dense.alerts.map((alert) => {
        const source = alert.source as { host?: { name?: string } };
        return source.host?.name;
      })
    );

    // A crowded index that is really one host would correlate trivially and
    // would not test triage at volume at all.
    expect(hosts.size).toBeGreaterThan(10);
  });

  it('does not emit a partial attack chain', () => {
    const dense = buildAd2SeedPlan({ profile: 'dense', baseTime: fixedBaseTime });
    const perScenario = new Map<string, number>();

    for (const alert of dense.alerts) {
      // ids are `${prefix}${scenarioKey}-alert-${n}`
      const scenarioKey = alert.id.replace(/-alert-\d+$/, '');
      perScenario.set(scenarioKey, (perScenario.get(scenarioKey) ?? 0) + 1);
    }

    // every scenario contributed at least one alert, and none is empty
    for (const [, count] of perScenario) {
      expect(count).toBeGreaterThan(0);
    }
    expect(perScenario.size).toBeGreaterThan(AD2_CLEAN_SCENARIO_KEYS.length);
  });

  it('still returns the clean profile by default', () => {
    const plan = buildAd2SeedPlan({ baseTime: fixedBaseTime });
    expect(plan.profile).toBe('clean');
    expect(plan.alerts).toHaveLength(16);
  });
});
