/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Evaluator } from '@kbn/evals';
import { CHANGE_TYPES, SUPPRESSION_CAPABLE_RULE_TYPES, type ChangeType } from './constants';
import type { RuleTuningProposal } from './workflow_task';

const asProposal = (output: unknown): RuleTuningProposal => output as RuleTuningProposal;
const asExpected = (expected: unknown): { change_type?: ChangeType } | undefined =>
  expected as { change_type?: ChangeType } | undefined;

/**
 * Primary metric: did the review workflow's `diagnose_rule` step pick the golden tuning path?
 * Binary per example; the mean across the dataset is the model's tuning-decision accuracy.
 */
export const changeTypeAccuracy: Evaluator = {
  name: 'ChangeTypeAccuracy',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, expected }) => {
    const predicted = asProposal(output).change_type;
    const goldenLabel = asExpected(expected)?.change_type;
    const correct = predicted != null && predicted === goldenLabel;

    return {
      score: correct ? 1 : 0,
      label: predicted ?? 'none',
      explanation: `predicted="${predicted ?? 'none'}" expected="${goldenLabel ?? 'none'}"`,
      metadata: { predicted: predicted ?? null, expected: goldenLabel ?? null },
    };
  },
};

/**
 * Guardrail: the structured output must be a well-formed proposal — a `change_type` from the
 * review workflow's enum and, per path, the payload fields the apply gates require.
 * Catches schema drift and failed executions independently of whether the path was correct.
 */
export const validProposal: Evaluator = {
  name: 'ValidProposal',
  kind: 'CODE',
  direction: 'maximize',
  evaluate: async ({ output, metadata }) => {
    const proposal = asProposal(output);
    const ruleType = (metadata as { ruleType?: string } | undefined)?.ruleType;

    const changeTypeValid =
      proposal.change_type != null &&
      (CHANGE_TYPES as readonly string[]).includes(proposal.change_type);

    let payloadValid = true;
    switch (proposal.change_type) {
      case 'exception':
        payloadValid =
          typeof proposal.exception_condition === 'string' && proposal.exception_condition !== '';
        break;
      case 'query':
        // The review only previews/auto-applies query changes for rule type "query";
        // a proposed_query on any other type can never be applied.
        payloadValid =
          typeof proposal.proposed_query === 'string' &&
          proposal.proposed_query !== '' &&
          ruleType === 'query';
        break;
      case 'suppression':
        // An unknown rule type cannot be validated, so it is not valid.
        payloadValid =
          ruleType != null &&
          (SUPPRESSION_CAPABLE_RULE_TYPES as readonly string[]).includes(ruleType);
        break;
      // The gate itself opens only when `structured_output.summary != null`
      // (rule_tuning_review.yaml review_tuning `if:`), so every path needs a
      // non-empty summary to produce an approval decision from. threshold has
      // no other payload field — summary is its whole renderable content.
      case 'threshold':
        payloadValid = typeof proposal.summary === 'string' && proposal.summary !== '';
        break;
      default:
        break;
    }

    const valid = changeTypeValid && payloadValid;

    return {
      score: valid ? 1 : 0,
      label: valid ? 'valid' : 'invalid',
      metadata: { changeTypeValid, payloadValid, ruleType: ruleType ?? null },
    };
  },
};
