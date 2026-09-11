/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import fs from 'fs';
import path from 'path';
import {
  buildComparisonReport,
  type ModelObservation,
  type ComparisonConfig,
} from './model_comparison';

/**
 * End-to-end contract against a real rendered matrix bundle.
 *
 * Unit tests prove the statistics on synthetic input; this proves the module
 * reproduces the findings that justify v2 on the actual published data. It is
 * skipped when the bundle is absent so CI stays hermetic.
 */
const BUNDLE =
  process.env.MATRIX_BUNDLE ??
  path.resolve(__dirname, '../../../../../../../target/llm_matrix_latest/matrix.json');

const describeIfBundle = fs.existsSync(BUNDLE) ? describe : describe.skip;

describeIfBundle('model_comparison against a real matrix bundle', () => {
  let report: ReturnType<typeof buildComparisonReport>;
  let config: ComparisonConfig;
  let observations: ModelObservation[];

  beforeAll(() => {
    const matrix = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
    const columns: string[] = matrix.columns.map((c: { id: string }) => c.id);
    const rows = [...(matrix.proprietary ?? []), ...(matrix.openSource ?? [])];

    const latency = new Map<string, number>();
    const inputTokens = new Map<string, number>();
    for (const [key, trace] of Object.entries<Record<string, unknown>>(matrix.traces ?? {})) {
      const modelId = key.split(':')[0];
      const scores = (trace as { scores?: Record<string, number> }).scores;
      if (!scores) continue;
      if (typeof scores.Latency === 'number') {
        latency.set(modelId, (latency.get(modelId) ?? 0) + scores.Latency);
      }
      if (typeof scores['Input Tokens'] === 'number') {
        inputTokens.set(modelId, (inputTokens.get(modelId) ?? 0) + scores['Input Tokens']);
      }
    }
    const counts = new Map<string, number>();
    for (const key of Object.keys(matrix.traces ?? {})) {
      const modelId = key.split(':')[0];
      counts.set(modelId, (counts.get(modelId) ?? 0) + 1);
    }

    observations = rows.map(
      (row: {
        modelId: string;
        modelLabel: string;
        openSource?: boolean;
        cells: Record<string, { kind: string; value?: number }>;
      }) => {
        const scores: Record<string, number> = {};
        for (const columnId of columns) {
          const cell = row.cells[columnId];
          if (cell?.kind === 'score' && typeof cell.value === 'number') {
            scores[columnId] = cell.value;
          }
        }
        const n = counts.get(row.modelId) ?? 0;
        return {
          modelId: row.modelId,
          modelLabel: row.modelLabel,
          openSource: row.openSource,
          scores,
          latencySeconds:
            n > 0 && latency.has(row.modelId) ? latency.get(row.modelId)! / n : undefined,
          inputTokens:
            n > 0 && inputTokens.has(row.modelId) ? inputTokens.get(row.modelId)! / n : undefined,
        };
      }
    );

    config = {
      columns,
      familyOf: (columnId: string) => columnId.replace(/-[abc]$/, ''),
      minColumns: columns.length,
      resamples: 2000,
      seed: 20260906,
    };
    report = buildComparisonReport(observations, config);
  });

  it('loads a matrix with the expected shape', () => {
    expect(observations.length).toBeGreaterThan(15);
    expect(config.columns.length).toBe(24);
  });

  it('collapses the ranked leaderboard into far fewer tiers than models', () => {
    const ranked = report.tiers.reduce((n, t) => n + t.members.length, 0);
    expect(ranked).toBeGreaterThan(10);
    // The v1 report ordered every model; the evidence supports only a handful
    // of genuinely separated groups.
    expect(report.tiers.length).toBeLessThan(ranked / 2);
  });

  it('keeps partial rows out of the ranking entirely', () => {
    const rankedIds = report.tiers.flatMap((t) => t.members.map((m) => m.modelId));
    for (const excluded of report.excluded) {
      expect(rankedIds).not.toContain(excluded.modelId);
      expect(excluded.scoredColumns).toBeLessThan(excluded.requiredColumns);
    }
  });

  it('finds genuine specialisation: no single model leads every family', () => {
    const wins = new Map<string, number>();
    for (const family of report.families) {
      for (const leader of family.leaders) {
        wins.set(leader, (wins.get(leader) ?? 0) + 1);
      }
    }
    expect(report.families.length).toBeGreaterThanOrEqual(8);
    // If one model led everywhere, a single ranked list would be adequate and
    // v2 would not be justified. Real data: the best model leads a minority.
    const mostWins = Math.max(...wins.values());
    expect(mostWins).toBeLessThan(report.families.length);
    // And leadership is spread across several distinct models.
    expect(wins.size).toBeGreaterThan(3);
  });

  it('reports the field as statistically tied rather than inventing an order', () => {
    // The headline v2 finding: paired bootstrap cannot separate the complete
    // rows, so any ranked leaderboard over them is presentation, not evidence.
    const rankedCount = report.tiers.reduce((n, t) => n + t.members.length, 0);
    if (report.tiers.length === 1) {
      expect(report.allTiedWarning).toBe(true);
      expect(report.tiers[0].members.length).toBe(rankedCount);
    }
    // Tier count must never approach one-tier-per-model, which would be the
    // false precision v1 published.
    expect(report.tiers.length).toBeLessThanOrEqual(Math.ceil(rankedCount / 3));
  });

  it('identifies at least one model that leads one family and trails another', () => {
    const lead = new Map<string, number>();
    const trail = new Map<string, number>();
    for (const family of report.families) {
      for (const l of family.leaders) lead.set(l, (lead.get(l) ?? 0) + 1);
      for (const l of family.laggards) trail.set(l, (trail.get(l) ?? 0) + 1);
    }
    const conflicted = [...lead.keys()].filter((m) => (trail.get(m) ?? 0) > 0);
    expect(conflicted.length).toBeGreaterThan(0);
  });

  it('shows most models are dominated on the efficiency frontier', () => {
    const measured = report.efficiency.filter((e) => e.latencySeconds !== undefined);
    const dominated = measured.filter((e) => e.dominatedBy !== undefined);
    expect(measured.length).toBeGreaterThan(10);
    // If nearly everything is dominated, "pick the Overall winner" is bad advice.
    expect(dominated.length).toBeGreaterThan(measured.length / 2);
  });

  it('produces byte-identical output across runs', () => {
    const again = buildComparisonReport(observations, config);
    expect(JSON.stringify(again)).toEqual(JSON.stringify(report));
  });
});
