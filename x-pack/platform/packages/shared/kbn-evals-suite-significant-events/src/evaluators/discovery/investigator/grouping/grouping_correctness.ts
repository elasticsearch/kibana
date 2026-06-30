/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InvestigatorEvaluator } from '../../types';

/**
 * Returns a stable identifier for a detection — `rule_uuid` when present (survives rule renames
 * and snapshot catalog variants), falling back to `rule_name`.
 */
function detectionKey(d: { rule_uuid?: string; rule_name?: string }): string {
  return d.rule_uuid ?? d.rule_name ?? '';
}

/** Unordered same-group detection-key pairs ("a|b", a<b), order/count-independent. */
function sameGroupPairs(groups: string[][]): Set<string> {
  const pairs = new Set<string>();
  for (const group of groups) {
    const rules = [...new Set(group)].sort();
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        pairs.add(`${rules[i]}|${rules[j]}`);
      }
    }
  }
  return pairs;
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const value of a) {
    if (b.has(value)) {
      n++;
    }
  }
  return n;
}

/** CODE evaluator: scores how well grouped detection-key pairs match the expected groups (F1 over same-group pairs). */
export const groupingCorrectnessEvaluator: InvestigatorEvaluator = {
  name: 'grouping_correctness',
  kind: 'CODE',
  evaluate: ({ output, expected }) => {
    // Derive the expected grouping from the canonical expected_discoveries: each discovery's
    // detections form one group, keyed by rule_uuid (or rule_name as fallback).
    const expectedGroups = expected?.expected_discoveries?.map((discovery) =>
      (discovery.detections ?? []).map((d) => detectionKey(d)).filter(Boolean)
    );
    if (!expectedGroups || expectedGroups.length === 0) {
      return Promise.resolve({
        score: null,
        label: 'unavailable',
        explanation: 'No expected_discoveries declared for this scenario',
      });
    }

    const discoveries = output?.discoveries ?? [];
    if (discoveries.length === 0) {
      return Promise.resolve({
        score: null,
        label: 'unavailable',
        explanation: 'Agent emitted zero discoveries — no grouping signal to evaluate',
      });
    }
    const actualGroups = discoveries.map((discovery) => {
      const detections = discovery.detections ?? [];
      return detections.map((d) => detectionKey(d)).filter(Boolean);
    });

    const totalRules = new Set(expectedGroups.flat()).size;
    if (totalRules < 2) {
      return Promise.resolve({
        score: null,
        label: 'unavailable',
        explanation: 'Fewer than two detections to group — grouping is trivial',
      });
    }

    // Guard: if the actual and expected rule universes are completely disjoint (e.g. snapshot run
    // against a different detection catalog) the F1 score is trivially 0 for the wrong reason —
    // there is no meaningful signal to surface. Return null so the harness marks it unavailable.
    const expectedUniverse = new Set(expectedGroups.flat());
    const actualUniverse = new Set(actualGroups.flat());
    const hasOverlap = [...actualUniverse].some((key) => expectedUniverse.has(key));
    if (!hasOverlap && actualUniverse.size > 0) {
      return Promise.resolve({
        score: null,
        label: 'unavailable',
        explanation:
          'Actual rule universe is disjoint from expected universe — catalog mismatch, grouping cannot be scored',
      });
    }

    const expectedPairs = sameGroupPairs(expectedGroups);
    const actualPairs = sameGroupPairs(actualGroups);

    // No same-group pairs on either side → every rule is correctly its own discovery.
    if (expectedPairs.size === 0 && actualPairs.size === 0) {
      return Promise.resolve({
        score: 1,
        explanation: 'All rules correctly emitted as separate discoveries (no grouping expected)',
      });
    }

    const truePositives = intersectionSize(actualPairs, expectedPairs);
    const precision = actualPairs.size === 0 ? 0 : truePositives / actualPairs.size;
    const recall = expectedPairs.size === 0 ? 0 : truePositives / expectedPairs.size;
    const score = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    return Promise.resolve({
      score,
      explanation: `Grouping precision/recall ${score.toFixed(2)} (precision ${precision.toFixed(
        2
      )}, recall ${recall.toFixed(2)}) over ${expectedPairs.size} expected same-group pair(s)`,
    });
  },
};
