/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DefaultEvaluators } from '@kbn/evals';
import { createAttackDiscoveryRubricEvaluator } from './attack_discovery_rubric_evaluator';
import type {
  AttackDiscovery,
  AttackDiscoveryAgentBuilderExample,
  AttackDiscoveryAgentBuilderTaskOutput,
} from '../types';

interface Params {
  input: AttackDiscoveryAgentBuilderExample['input'];
  output: AttackDiscoveryAgentBuilderTaskOutput;
  expected: AttackDiscoveryAgentBuilderExample['output'];
  metadata: AttackDiscoveryAgentBuilderExample['metadata'];
}

const insight: AttackDiscovery = {
  title: 'Credential access on finance-ws-01',
  summaryMarkdown: 'LSASS access following encoded PowerShell.',
  detailsMarkdown: 'rundll32 accessed lsass.exe after an encoded PowerShell execution.',
  alertIds: ['alert-1', 'alert-2'],
};

const baseOutput = (insights: AttackDiscovery[] | null): AttackDiscoveryAgentBuilderTaskOutput => ({
  messages: [],
  steps: [],
  errors: [],
  insights,
  workflow: {
    stages: [],
    retrievedAlertCount: null,
    passedAlertCount: null,
    validatedDiscoveryCount: null,
  },
});

const expectedFor = (
  attackDiscoveries?: AttackDiscovery[]
): AttackDiscoveryAgentBuilderExample['output'] => ({
  expectedToolPath: [],
  expectedWorkflowStages: [],
  expectedRetrievedAlertCount: null,
  expectedPassedAlertCount: null,
  ...(attackDiscoveries ? { attackDiscoveries } : {}),
});

describe('createAttackDiscoveryRubricEvaluator', () => {
  const judge = jest.fn();
  const criteria = jest.fn((_criteria: string[]) => ({
    name: 'criteria',
    kind: 'LLM' as const,
    direction: 'maximize',
    evaluate: judge,
  }));
  const evaluators = { criteria } as unknown as DefaultEvaluators;

  const evaluate = (params: {
    insights: AttackDiscovery[] | null;
    expected: AttackDiscoveryAgentBuilderExample['output'];
  }) =>
    createAttackDiscoveryRubricEvaluator({ evaluators }).evaluate({
      input: {} as Params['input'],
      output: baseOutput(params.insights),
      expected: params.expected,
      metadata: {} as Params['metadata'],
    } as Parameters<ReturnType<typeof createAttackDiscoveryRubricEvaluator>['evaluate']>[0]);

  beforeEach(() => {
    jest.clearAllMocks();
    judge.mockResolvedValue({ score: 1, label: 'Y' });
  });

  describe('examples that carry reference attack discoveries', () => {
    it('delegates to the judge and returns its score', async () => {
      const result = await evaluate({
        insights: [insight],
        expected: expectedFor([insight]),
      });

      expect(judge).toHaveBeenCalledTimes(1);
      expect(result.score).toBe(1);
    });

    // The saturation guard. Each rubric item must reach the judge as its own
    // criterion, because `evaluators.criteria` scores criteria independently
    // and returns the weighted pass rate. One combined criterion carrying a
    // "5 of 7 -> Y/N" threshold can only ever return 0 or 1, which is what
    // pinned 95.6% of regraded attack-discovery cells at the ceiling.
    it('passes each rubric item as a separate criterion so partial credit survives', async () => {
      await evaluate({ insights: [insight], expected: expectedFor([insight]) });

      const passedCriteria = criteria.mock.calls[0][0];
      expect(passedCriteria).toHaveLength(7);
      // No item may smuggle the old aggregate threshold back in: that is the
      // exact construct that collapsed 7 signals into one binary verdict.
      for (const criterion of passedCriteria) {
        expect(criterion).not.toMatch(/at least 5 of the 7/i);
        expect(criterion).not.toMatch(/single character/i);
      }
      // Every item keeps the reference, otherwise a judge scoring one item in
      // isolation has nothing to compare the submission against.
      expect(passedCriteria.every((c) => c.includes('Reference:'))).toBe(true);
    });

    // Guards against the N/A branch becoming a blanket exemption: an example
    // that has a reference but produced nothing must still reach the judge and
    // keep whatever score the judge gives it.
    it('still delegates to the judge when the run produced no insights', async () => {
      judge.mockResolvedValue({ score: 0, label: 'N' });

      const result = await evaluate({ insights: null, expected: expectedFor([insight]) });

      expect(judge).toHaveBeenCalledTimes(1);
      expect(result.score).toBe(0);
    });
  });

  describe('examples that carry no reference attack discoveries by design', () => {
    // `missing-alert-retrieval` and `status-only` annotate neither
    // `attackDiscoveries` nor `criteria`; pre-fix the judge saw an empty
    // reference and an empty submission and scored a nondeterministic 0.
    it('returns N/A without invoking the judge when attackDiscoveries is absent', async () => {
      const result = await evaluate({ insights: null, expected: expectedFor() });

      expect(judge).not.toHaveBeenCalled();
      expect(result.score).toBeNull();
      expect(result.label).toBe('N/A');
    });

    it('returns N/A without invoking the judge when attackDiscoveries is empty', async () => {
      const result = await evaluate({ insights: null, expected: expectedFor([]) });

      expect(judge).not.toHaveBeenCalled();
      expect(result.score).toBeNull();
      expect(result.label).toBe('N/A');
    });
  });
});
