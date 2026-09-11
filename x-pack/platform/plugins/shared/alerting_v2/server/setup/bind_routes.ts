/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ContainerModuleLoadOptions } from 'inversify';
import { Route } from '@kbn/core-di-server';
import { CreateRuleRoute } from '../routes/rules/create_rule_route';
import { UpdateRuleRoute } from '../routes/rules/update_rule_route';
import { GetRulesRoute } from '../routes/rules/get_rules_route';
import { BulkGetRulesRoute } from '../routes/rules/get_rules_bulk_route';
import { GetRuleRoute } from '../routes/rules/get_rule_route';
import { DeleteRuleRoute } from '../routes/rules/delete_rule_route';
import { RunRuleRoute } from '../routes/rules/run_rule_route';
import { BulkDeleteRulesRoute } from '../routes/rules/bulk_delete_rules_route';
import { EnableRuleRoute } from '../routes/rules/enable_rule_route';
import { DisableRuleRoute } from '../routes/rules/disable_rule_route';
import { BulkEnableRulesRoute } from '../routes/rules/bulk_enable_rules_route';
import { BulkDisableRulesRoute } from '../routes/rules/bulk_disable_rules_route';
import { BulkUpdateApiKeyRoute } from '../routes/rules/bulk_update_api_key_route';
import { DeleteRulesByQueryRoute } from '../routes/rules/delete_rules_by_query_route';
import { EnableRulesByQueryRoute } from '../routes/rules/enable_rules_by_query_route';
import { DisableRulesByQueryRoute } from '../routes/rules/disable_rules_by_query_route';
import { UpdateApiKeyByQueryRoute } from '../routes/rules/update_api_key_by_query_route';
import { GetRuleTagsRoute } from '../routes/rules/get_rule_tags_route';
import { BulkTagSeriesActionRoute } from '../routes/alert_actions/series/bulk_tag_series_action_route';
import { BulkSnoozeSeriesActionRoute } from '../routes/alert_actions/series/bulk_snooze_series_action_route';
import { BulkUnsnoozeSeriesActionRoute } from '../routes/alert_actions/series/bulk_unsnooze_series_action_route';
import { CreateTagSeriesActionRoute } from '../routes/alert_actions/series/create_tag_series_action_route';
import { CreateSnoozeSeriesActionRoute } from '../routes/alert_actions/series/create_snooze_series_action_route';
import { CreateUnsnoozeSeriesActionRoute } from '../routes/alert_actions/series/create_unsnooze_series_action_route';
import { BulkAckEpisodeActionRoute } from '../routes/alert_actions/episodes/bulk_ack_episode_action_route';
import { BulkUnackEpisodeActionRoute } from '../routes/alert_actions/episodes/bulk_unack_episode_action_route';
import { BulkAssignEpisodeActionRoute } from '../routes/alert_actions/episodes/bulk_assign_episode_action_route';
import { BulkActivateEpisodeActionRoute } from '../routes/alert_actions/episodes/bulk_activate_episode_action_route';
import { BulkDeactivateEpisodeActionRoute } from '../routes/alert_actions/episodes/bulk_deactivate_episode_action_route';
import { CreateAckEpisodeActionRoute } from '../routes/alert_actions/episodes/create_ack_episode_action_route';
import { CreateUnackEpisodeActionRoute } from '../routes/alert_actions/episodes/create_unack_episode_action_route';
import { CreateAssignEpisodeActionRoute } from '../routes/alert_actions/episodes/create_assign_episode_action_route';
import { CreateActivateEpisodeActionRoute } from '../routes/alert_actions/episodes/create_activate_episode_action_route';
import { CreateDeactivateEpisodeActionRoute } from '../routes/alert_actions/episodes/create_deactivate_episode_action_route';
import { BulkDeleteActionPoliciesRoute } from '../routes/action_policies/bulk_delete_action_policies_route';
import { BulkEnableActionPoliciesRoute } from '../routes/action_policies/bulk_enable_action_policies_route';
import { BulkDisableActionPoliciesRoute } from '../routes/action_policies/bulk_disable_action_policies_route';
import { BulkSnoozeActionPoliciesRoute } from '../routes/action_policies/bulk_snooze_action_policies_route';
import { BulkUnsnoozeActionPoliciesRoute } from '../routes/action_policies/bulk_unsnooze_action_policies_route';
import { BulkUpdateApiKeyActionPoliciesRoute } from '../routes/action_policies/bulk_update_api_key_action_policies_route';
import { CreateActionPolicyRoute } from '../routes/action_policies/create_action_policy_route';
import { DisableActionPolicyRoute } from '../routes/action_policies/disable_action_policy_route';
import { EnableActionPolicyRoute } from '../routes/action_policies/enable_action_policy_route';
import { GetActionPolicyRoute } from '../routes/action_policies/get_action_policy_route';
import { ListActionPoliciesRoute } from '../routes/action_policies/list_action_policies_route';
import { SnoozeActionPolicyRoute } from '../routes/action_policies/snooze_action_policy_route';
import { UnsnoozeActionPolicyRoute } from '../routes/action_policies/unsnooze_action_policy_route';
import { UpdateActionPolicyRoute } from '../routes/action_policies/update_action_policy_route';
import { UpdateActionPolicyApiKeyRoute } from '../routes/action_policies/update_action_policy_api_key_route';
import { DeleteActionPolicyRoute } from '../routes/action_policies/delete_action_policy_route';
import { ListActionPolicyExecutionsRoute } from '../routes/execution_history/list_action_policy_executions_route';
import { ListRuleExecutionsRoute } from '../routes/execution_history/list_rule_executions_route';
import { ListRuleChangeHistoryRoute } from '../routes/rule_change_history/list_rule_change_history_route';
import { GetRuleChangeHistoryEventRoute } from '../routes/rule_change_history/get_rule_change_history_event_route';
import { MatcherValueSuggestionsRoute } from '../routes/suggestions/matcher_value_suggestions_route';
import { MatcherRuleEventFieldsRoute } from '../routes/suggestions/matcher_rule_event_fields_route';
import { ActionPolicyTagsRoute } from '../routes/action_policies/action_policy_tags_route';
import { SuggestUserProfilesRoute } from '../routes/suggestions/suggest_user_profiles_route';
import { UpsertRuleRoute } from '../routes/rules/upsert_rule_route';
import { UpsertActionPolicyRoute } from '../routes/action_policies/upsert_action_policy_route';
import { MatchActionPoliciesForRuleRoute } from '../routes/action_policies/match_action_policies_for_rule_route';
import { FindRuleTemplatesRoute } from '../routes/rule_templates/find_rule_templates_route';
import { GetRuleTemplateRoute } from '../routes/rule_templates/get_rule_template_route';
/**
 * TODO: https://github.com/elastic/rna-program/issues/426
 * Remove this route and its binding before GA.
 */

import { ResetResourcesRoute } from '../routes/reset_resources_route';

export function bindRoutes({ bind }: ContainerModuleLoadOptions) {
  bind(Route).toConstantValue(CreateRuleRoute);
  bind(Route).toConstantValue(UpdateRuleRoute);
  bind(Route).toConstantValue(GetRulesRoute);
  bind(Route).toConstantValue(BulkGetRulesRoute);
  bind(Route).toConstantValue(GetRuleRoute);
  bind(Route).toConstantValue(DeleteRuleRoute);
  bind(Route).toConstantValue(RunRuleRoute);
  bind(Route).toConstantValue(EnableRuleRoute);
  bind(Route).toConstantValue(DisableRuleRoute);
  bind(Route).toConstantValue(BulkDeleteRulesRoute);
  bind(Route).toConstantValue(BulkEnableRulesRoute);
  bind(Route).toConstantValue(BulkDisableRulesRoute);
  bind(Route).toConstantValue(BulkUpdateApiKeyRoute);
  bind(Route).toConstantValue(DeleteRulesByQueryRoute);
  bind(Route).toConstantValue(EnableRulesByQueryRoute);
  bind(Route).toConstantValue(DisableRulesByQueryRoute);
  bind(Route).toConstantValue(UpdateApiKeyByQueryRoute);
  bind(Route).toConstantValue(GetRuleTagsRoute);
  bind(Route).toConstantValue(CreateTagSeriesActionRoute);
  bind(Route).toConstantValue(CreateSnoozeSeriesActionRoute);
  bind(Route).toConstantValue(CreateUnsnoozeSeriesActionRoute);
  bind(Route).toConstantValue(BulkTagSeriesActionRoute);
  bind(Route).toConstantValue(BulkSnoozeSeriesActionRoute);
  bind(Route).toConstantValue(BulkUnsnoozeSeriesActionRoute);
  bind(Route).toConstantValue(CreateAckEpisodeActionRoute);
  bind(Route).toConstantValue(CreateUnackEpisodeActionRoute);
  bind(Route).toConstantValue(CreateAssignEpisodeActionRoute);
  bind(Route).toConstantValue(CreateActivateEpisodeActionRoute);
  bind(Route).toConstantValue(CreateDeactivateEpisodeActionRoute);
  bind(Route).toConstantValue(BulkAckEpisodeActionRoute);
  bind(Route).toConstantValue(BulkUnackEpisodeActionRoute);
  bind(Route).toConstantValue(BulkAssignEpisodeActionRoute);
  bind(Route).toConstantValue(BulkActivateEpisodeActionRoute);
  bind(Route).toConstantValue(BulkDeactivateEpisodeActionRoute);
  bind(Route).toConstantValue(CreateActionPolicyRoute);
  bind(Route).toConstantValue(GetActionPolicyRoute);
  bind(Route).toConstantValue(UpdateActionPolicyRoute);
  bind(Route).toConstantValue(UpdateActionPolicyApiKeyRoute);
  bind(Route).toConstantValue(DeleteActionPolicyRoute);
  bind(Route).toConstantValue(ListActionPoliciesRoute);
  bind(Route).toConstantValue(EnableActionPolicyRoute);
  bind(Route).toConstantValue(DisableActionPolicyRoute);
  bind(Route).toConstantValue(SnoozeActionPolicyRoute);
  bind(Route).toConstantValue(UnsnoozeActionPolicyRoute);
  bind(Route).toConstantValue(BulkDeleteActionPoliciesRoute);
  bind(Route).toConstantValue(BulkEnableActionPoliciesRoute);
  bind(Route).toConstantValue(BulkDisableActionPoliciesRoute);
  bind(Route).toConstantValue(BulkSnoozeActionPoliciesRoute);
  bind(Route).toConstantValue(BulkUnsnoozeActionPoliciesRoute);
  bind(Route).toConstantValue(BulkUpdateApiKeyActionPoliciesRoute);
  bind(Route).toConstantValue(ListActionPolicyExecutionsRoute);
  bind(Route).toConstantValue(ListRuleExecutionsRoute);
  bind(Route).toConstantValue(ListRuleChangeHistoryRoute);
  bind(Route).toConstantValue(GetRuleChangeHistoryEventRoute);
  bind(Route).toConstantValue(MatcherValueSuggestionsRoute);
  bind(Route).toConstantValue(MatcherRuleEventFieldsRoute);

  bind(Route).toConstantValue(ActionPolicyTagsRoute);
  bind(Route).toConstantValue(SuggestUserProfilesRoute);
  // TODO(rna-program#426): remove this binding before GA.
  bind(Route).toConstantValue(ResetResourcesRoute);
  bind(Route).toConstantValue(UpsertRuleRoute);
  bind(Route).toConstantValue(UpsertActionPolicyRoute);
  bind(Route).toConstantValue(MatchActionPoliciesForRuleRoute);
  bind(Route).toConstantValue(FindRuleTemplatesRoute);
  bind(Route).toConstantValue(GetRuleTemplateRoute);
}
