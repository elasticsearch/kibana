/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { MigrationTranslationResult } from '../../../../../../../../common/siem_migrations/constants';
import type {
  ElasticRulePartial,
  OriginalRule,
  RuleMigrationRule,
} from '../../../../../../../../common/siem_migrations/model/rule_migration.gen';

/**
 * Max `searchPrebuiltRules` calls per subgraph run. Enforced by `matchPrebuiltRuleRouter` and
 * stated in the matching guidelines so the model answers JSON instead of burning a discarded extra search.
 */
export const MAX_TOOL_CALL_ATTEMPTS = 3;

/** The model's parsed final answer; `undefined` until valid JSON is received or if it never arrives. */
export interface MatchPrebuiltRulesResult {
  match?: string;
  summary?: string;
}

/** A past `searchPrebuiltRules` call paired with the candidate names it returned. */
export interface PreviousSearchAttempt {
  query: string;
  candidateNames: string[];
}

export const matchPrebuiltRuleState = Annotation.Root({
  original_rule: Annotation<OriginalRule>(),

  // Splunk is the one falls back to ''
  nl_query: Annotation<string>({
    reducer: (current, value) => value ?? current,
    default: () => '',
  }),
  elastic_rule: Annotation<ElasticRulePartial>({
    reducer: (state, action) => ({ ...state, ...action }),
    default: () => ({} as ElasticRulePartial),
  }),
  translation_result: Annotation<MigrationTranslationResult>(),
  comments: Annotation<RuleMigrationRule['comments']>({
    reducer: (current, value) => (value ? (current ?? []).concat(value) : current),
    default: () => [],
  }),
  match_prebuilt_rules_messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  match_prebuilt_rules_result: Annotation<MatchPrebuiltRulesResult | undefined>({
    reducer: (current, value) => value ?? current,
    default: () => undefined,
  }),
});

export type MatchPrebuiltRuleState = typeof matchPrebuiltRuleState.State;
