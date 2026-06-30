/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConverseStep, EvaluationCriterion, Evaluator } from '@kbn/evals';
import type { Detection, Discovery, SignificantEvent } from '@kbn/significant-events-schema';

/** Fields every discovery agent output carries: the converse trail and trace id. */
export interface AgentOutputBase {
  steps?: ConverseStep[];
  traceId?: string | null;
}

/** Common per-scenario expectations shared by every discovery example's `output`. */
export interface ExampleOutputBase {
  criteria?: EvaluationCriterion[];
}

export interface InvestigatorAgentOutput extends AgentOutputBase {
  discoveries: Discovery[];
  inputDetections?: Detection[];
}

export interface InvestigatorEvaluationExample {
  input: {
    episodeSuffix?: string;
    detections: Array<Partial<Detection>>;
    continuationCandidates?: Array<Partial<Discovery>>;
  };
  output: ExampleOutputBase & {
    /**
     * Canonical expected discoveries (detections + evidences + cause_kis) — the grouping check
     * derives its expected groups from these discoveries' `detections[].rule_name`s.
     */
    expected_discoveries?: Array<Partial<Discovery>>;
  } & Record<string, unknown>;
  metadata: Record<string, unknown> | null;
}

export type InvestigatorEvaluator = Evaluator<
  InvestigatorEvaluationExample,
  InvestigatorAgentOutput
>;

export interface JudgeAgentOutput extends AgentOutputBase {
  significantEvents: SignificantEvent[];
  inputDiscoveries: Discovery[];
}

export interface JudgeEvaluationExample {
  input: {
    discoveries: Array<Partial<Discovery>>;
  };
  output: ExampleOutputBase & {
    expected_ground_truth?: string;
  } & Record<string, unknown>;
  metadata: Record<string, unknown> | null;
}

export type JudgeEvaluator = Evaluator<JudgeEvaluationExample, JudgeAgentOutput>;
