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
import { BulkDeleteRulesRoute } from '../routes/rules/bulk_delete_rules_route';
import { BulkEnableRulesRoute } from '../routes/rules/bulk_enable_rules_route';
import { BulkDisableRulesRoute } from '../routes/rules/bulk_disable_rules_route';
import { GetRuleTagsRoute } from '../routes/rules/get_rule_tags_route';
import { BulkCreateAlertActionRoute } from '../routes/alert_actions/bulk_create_alert_action_route';
import { CreateAckAlertActionRoute } from '../routes/alert_actions/create_ack_alert_action_route';
import { CreateAssignAlertActionRoute } from '../routes/alert_actions/create_assign_alert_action_route';
import { CreateUnackAlertActionRoute } from '../routes/alert_actions/create_unack_alert_action_route';
import { CreateTagAlertActionRoute } from '../routes/alert_actions/create_tag_alert_action_route';
import { CreateSnoozeAlertActionRoute } from '../routes/alert_actions/create_snooze_alert_action_route';
import { CreateUnsnoozeAlertActionRoute } from '../routes/alert_actions/create_unsnooze_alert_action_route';
import { CreateActivateAlertActionRoute } from '../routes/alert_actions/create_activate_alert_action_route';
import { CreateDeactivateAlertActionRoute } from '../routes/alert_actions/create_deactivate_alert_action_route';
import { BulkActionActionPoliciesRoute } from '../routes/action_policies/bulk_action_action_policies_route';
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
import { ListExecutionHistoryRoute } from '../routes/action_policies/list_execution_history_route';
import { CountNewExecutionHistoryEventsRoute } from '../routes/action_policies/count_new_execution_history_events_route';
import { GetRuleExecutionsRoute } from '../routes/execution_history/get_rule_executions_route';
import { MatcherValueSuggestionsRoute } from '../routes/suggestions/matcher_value_suggestions_route';
import { MatcherDataFieldsRoute } from '../routes/suggestions/matcher_data_fields_route';
import { ActionPolicyTagsRoute } from '../routes/suggestions/action_policy_tags_route';
import { SuggestUserProfilesRoute } from '../routes/suggestions/suggest_user_profiles_route';
import { UpsertRuleRoute } from '../routes/rules/upsert_rule_route';
import { UpsertActionPolicyRoute } from '../routes/action_policies/upsert_action_policy_route';
import { MatchActionPoliciesForRuleRoute } from '../routes/action_policies/match_action_policies_for_rule_route';

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
  bind(Route).toConstantValue(BulkDeleteRulesRoute);
  bind(Route).toConstantValue(BulkEnableRulesRoute);
  bind(Route).toConstantValue(BulkDisableRulesRoute);
  bind(Route).toConstantValue(GetRuleTagsRoute);
  bind(Route).toConstantValue(CreateAckAlertActionRoute);
  bind(Route).toConstantValue(CreateAssignAlertActionRoute);
  bind(Route).toConstantValue(CreateUnackAlertActionRoute);
  bind(Route).toConstantValue(CreateTagAlertActionRoute);
  bind(Route).toConstantValue(CreateSnoozeAlertActionRoute);
  bind(Route).toConstantValue(CreateUnsnoozeAlertActionRoute);
  bind(Route).toConstantValue(CreateActivateAlertActionRoute);
  bind(Route).toConstantValue(CreateDeactivateAlertActionRoute);
  bind(Route).toConstantValue(BulkCreateAlertActionRoute);
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
  bind(Route).toConstantValue(BulkActionActionPoliciesRoute);
  bind(Route).toConstantValue(ListExecutionHistoryRoute);
  bind(Route).toConstantValue(CountNewExecutionHistoryEventsRoute);
  bind(Route).toConstantValue(GetRuleExecutionsRoute);
  bind(Route).toConstantValue(MatcherValueSuggestionsRoute);
  bind(Route).toConstantValue(MatcherDataFieldsRoute);

  bind(Route).toConstantValue(ActionPolicyTagsRoute);
  bind(Route).toConstantValue(SuggestUserProfilesRoute);
  // TODO(rna-program#426): remove this binding before GA.
  bind(Route).toConstantValue(ResetResourcesRoute);
  bind(Route).toConstantValue(UpsertRuleRoute);
  bind(Route).toConstantValue(UpsertActionPolicyRoute);
  bind(Route).toConstantValue(MatchActionPoliciesForRuleRoute);
}
