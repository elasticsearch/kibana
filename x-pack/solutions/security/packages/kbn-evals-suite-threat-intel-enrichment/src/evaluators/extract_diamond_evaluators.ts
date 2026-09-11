/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import type { ExtractDiamondExample, ExtractDiamondResponse } from '../types';

const VERTICES = ['adversary', 'capability', 'infrastructure', 'victim'] as const;

/**
 * CODE evaluator: at least `min_signal_count` of the four vertices came back
 * non-NONE. Guards against a model that collapses to an all-NONE Diamond on a
 * report the pipeline considered extraction-worthy.
 */
export const createSignalCountEvaluator = (): Evaluator<
  ExtractDiamondExample,
  ExtractDiamondResponse
> => ({
  name: 'DiamondSignalCount',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, expected }) => {
    const min = expected?.min_signal_count ?? 0;
    const count = typeof output?.signal_count === 'number' ? output.signal_count : 0;
    return {
      score: count >= min ? 1 : 0,
      label: `signal_count_${count}`,
    };
  },
});

// Literal IOC patterns the Diamond summaries must not contain: the prompt
// requires infrastructure/victim characterisations by pattern, not by naming
// specific IPs, URLs, or organisation-identifying emails/domains.
const IPV4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
const DEFANGED_IPV4 = /\b\d{1,3}\[\.\]\d{1,3}\[\.\]\d{1,3}\[\.\]\d{1,3}\b/;
const URL = /https?:\/\/\S+/i;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

const leaksIoc = (summary: string): boolean =>
  IPV4.test(summary) || DEFANGED_IPV4.test(summary) || URL.test(summary) || EMAIL.test(summary);

/**
 * CODE evaluator: no vertex summary leaks a literal IOC (IP, URL, or email).
 * This is the security-relevant Diamond constraint — the summaries are stored
 * as `semantic_text` for clustering and must characterise infrastructure by
 * behaviour, not reproduce the indicator list.
 */
export const createDiamondNoIocLeakEvaluator = (): Evaluator<
  ExtractDiamondExample,
  ExtractDiamondResponse
> => ({
  name: 'DiamondNoIocLeak',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output }) => {
    if (!output) {
      return { score: 0, label: 'missing_output' };
    }
    const leaking = VERTICES.filter((vertex) => leaksIoc(output[vertex]?.summary ?? ''));
    return {
      score: leaking.length === 0 ? 1 : 0,
      label: leaking.length === 0 ? 'clean' : `leak_${leaking.join('_')}`,
    };
  },
});

interface CriterionVerdict {
  id: string;
  result: 'PASS' | 'FAIL' | 'N/A';
  reason?: string | null;
  weight?: number;
}

const isPassing = (result: CriterionVerdict['result']): boolean =>
  // N/A counts toward the score in the base criteria evaluator (a criterion that
  // does not apply is not a failure), so mirror that here when voting.
  result === 'PASS' || result === 'N/A';

/**
 * Wrap the base LLM `criteria` evaluator so each criterion is judged over several
 * independent judge samples and decided by majority vote, then recompute the
 * aggregate score from the voted verdicts.
 *
 * The judge is noisy on conjunctive/ambiguous criteria: a single pass can flip a
 * verdict even when its own stated reason agrees the criterion holds. Voting
 * across `samples` passes damps that per-run flip without re-running the task
 * (the model under test is called once; only the judge repeats).
 *
 * Cost trade-off: each additional sample is another judge call per criterion per
 * example, so the default `samples = 3` triples judge spend for this evaluator.
 * Kept at 3 as the smallest odd count that can break a single-run flip; raise
 * only if the judge stays noisy after this.
 *
 * Spreads `base` so `getModel` / `getVersion` survive: the executor reads them
 * after `evaluate` (`kibana_evals_executor/client.ts`) to attribute the score to
 * the judge model. Rebuilding the literal field-by-field would drop them and land
 * every voted score with `model` undefined.
 */
export const withMajorityVote = (base: Evaluator, samples = 3): Evaluator => ({
  ...base,
  evaluate: async (args) => {
    const runs = [];
    for (let i = 0; i < samples; i++) {
      runs.push(await base.evaluate(args));
    }

    // Collect each criterion's verdicts across all samples, keyed by criterion id.
    const byId = new Map<
      string,
      { weight: number; results: CriterionVerdict['result'][]; reason?: string | null }
    >();
    for (const run of runs) {
      const criteria = (run.metadata?.criteria ?? []) as CriterionVerdict[];
      for (const c of criteria) {
        const entry = byId.get(c.id) ?? { weight: c.weight ?? 1, results: [], reason: c.reason };
        entry.results.push(c.result);
        if (c.result === 'FAIL' && c.reason) entry.reason = c.reason;
        byId.set(c.id, entry);
      }
    }

    if (byId.size === 0) {
      // Nothing to vote on (e.g. no criteria configured); fall back to the last run.
      return runs[runs.length - 1];
    }

    let earned = 0;
    let total = 0;
    const votedCriteria = Array.from(byId.entries()).map(([id, { weight, results, reason }]) => {
      const passes = results.filter(isPassing).length;
      const majorityPass = passes * 2 >= results.length; // ties resolve to PASS
      total += weight;
      if (majorityPass) earned += weight;
      const result: CriterionVerdict['result'] = majorityPass ? 'PASS' : 'FAIL';
      return {
        id,
        result,
        weight,
        votes: `${passes}/${results.length} pass`,
        reason: reason ?? null,
      };
    });

    const score = total === 0 ? 0 : earned / total;
    return {
      score,
      label: `majority_${samples}x`,
      explanation: votedCriteria
        .map((c) => `"${c.id}" ${c.result} (${c.votes})${c.reason ? `: ${c.reason}` : ''}`)
        .join('\n'),
      metadata: { samples, criteria: votedCriteria },
    };
  },
});
