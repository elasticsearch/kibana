/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface RuleIndexEntry {
  id: string;
  name: string;
  tactics: Array<{ id: string; name: string }>;
  enabled: boolean;
}

export interface RequiredField {
  name: string;
  type: string;
  ecs: boolean;
}

export type IndexToRulesMap = Map<string, RuleIndexEntry[]>;
export type PipelineToIndicesMap = Map<string, string[]>;
export type CategoryToIndicesMap = Map<string, string[]>;
export type TacticTotals = Map<string, { id: string; name: string; totalRules: number }>;
export type MachineLearningRuleIndex = RuleIndexEntry[];

/**
 * Tracks which reverse-map lookups failed so blast-radius enrichment can distinguish
 * "genuinely empty" from "we couldn't determine this".
 *
 * - pipelineMap: the pipeline -> indices map could not be built (continuity blast radius is unavailable)
 * - categoryMap: the category -> indices map could not be built (coverage blast radius is unavailable)
 * - rulesPartial: at least one rule's index resolution failed, so indexToRules is incomplete
 *   (blast radius across all dimensions may be undercounted)
 */
export interface ReverseMapErrors {
  pipelineMap: boolean;
  categoryMap: boolean;
  rulesPartial: boolean;
}

export interface ReverseMapResult {
  indexToRules: IndexToRulesMap;
  pipelineToIndices: PipelineToIndicesMap;
  categoryToIndices: CategoryToIndicesMap;
  tacticTotals: TacticTotals;
  mlRules: MachineLearningRuleIndex;
  /** Maps ruleId → the fields the rule declares it requires (from required_fields in rule params). */
  ruleRequiredFields: Map<string, RequiredField[]>;
  errors: ReverseMapErrors;
}
