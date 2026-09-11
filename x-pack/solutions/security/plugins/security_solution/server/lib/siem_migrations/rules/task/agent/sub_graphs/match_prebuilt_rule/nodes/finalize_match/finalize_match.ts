/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseMessage } from '@langchain/core/messages';
import { ToolMessage } from '@langchain/core/messages';
import { MigrationTranslationResult } from '../../../../../../../../../../common/siem_migrations/constants';
import type { RuleMigrationTelemetryClient } from '../../../../../rule_migrations_telemetry_client';
import type { RuleSemanticSearchResult } from '../../../../../../types';
import {
  cleanMarkdown,
  generateAssistantComment,
} from '../../../../../../../common/task/util/comments';
import {
  DEFAULT_TRANSLATION_RISK_SCORE,
  DEFAULT_TRANSLATION_SEVERITY,
} from '../../../../../../constants';
import type { MatchPrebuiltRuleState } from '../../state';

const NO_MATCH_SUMMARY = '## Prebuilt Rule Matching Summary\nNo related prebuilt rule found.';

interface GetFinalizeMatchNodeParams {
  telemetryClient: RuleMigrationTelemetryClient;
}

export const getFinalizeMatchNode = ({ telemetryClient }: GetFinalizeMatchNodeParams) => {
  return async (state: MatchPrebuiltRuleState): Promise<Partial<MatchPrebuiltRuleState>> => {
    // `undefined` when the model never produced valid JSON or exhausted the search budget without a final answer.
    const matchResult = state.match_prebuilt_rules_result;

    const searchCandidates = getSearchCandidates(state.match_prebuilt_rules_messages);

    const matchedName = matchResult?.match?.trim() || '';
    const matchedRule = matchedName
      ? searchCandidates.find((rule) => rule.name === matchedName)
      : undefined;

    telemetryClient.reportPrebuiltRulesMatch({
      preFilterRules: searchCandidates,
      ...(matchedRule ? { postFilterRule: matchedRule } : {}),
    });

    if (matchedRule) {
      return buildMatchResult(matchedRule, matchResult?.summary);
    }

    const summary = matchResult?.summary?.trim() || NO_MATCH_SUMMARY;
    return { comments: [generateAssistantComment(cleanMarkdown(summary))] };
  };
};

const getSearchCandidates = (messages: BaseMessage[]): RuleSemanticSearchResult[] => {
  const byName = new Map<string, RuleSemanticSearchResult>();
  for (const message of messages) {
    if (ToolMessage.isInstance(message) && Array.isArray(message.artifact)) {
      for (const rule of message.artifact as RuleSemanticSearchResult[]) {
        // Later searches override the same name so telemetry reflects the freshest hit.
        byName.set(rule.name, rule);
      }
    }
  }
  return [...byName.values()];
};

const buildMatchResult = (
  matchedRule: RuleSemanticSearchResult,
  summary: string | undefined
): Partial<MatchPrebuiltRuleState> => {
  const comments = summary?.trim() ? [generateAssistantComment(cleanMarkdown(summary))] : undefined;

  return {
    ...(comments ? { comments } : {}),
    elastic_rule: {
      title: matchedRule.name,
      description: matchedRule.description,
      prebuilt_rule_id: matchedRule.rule_id,
      id: matchedRule.current?.id,
      integration_ids: matchedRule.target?.related_integrations?.map((i) => i.package),
      severity: matchedRule.target?.severity ?? DEFAULT_TRANSLATION_SEVERITY,
      risk_score: matchedRule.target?.risk_score ?? DEFAULT_TRANSLATION_RISK_SCORE,
    },
    translation_result: MigrationTranslationResult.FULL,
  };
};
