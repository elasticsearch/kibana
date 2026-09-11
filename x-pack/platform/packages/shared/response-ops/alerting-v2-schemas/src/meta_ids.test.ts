/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import {
  createRuleDataSchema,
  updateRuleBodySchema,
  ruleResponseSchema,
  findRulesResponseSchema,
  ruleTagsResponseSchema,
  bulkGetRulesParamsSchema,
  bulkGetRulesResponseSchema,
  querySchema,
  composedQuerySchema,
  standaloneQuerySchema,
  scheduleSchema,
  metadataSchema,
  ruleResponseMetadataSchema,
  groupingSchema,
} from './rule_data_schema';
import {
  createActionPolicyDataSchema,
  updateActionPolicyBodySchema,
  bulkSnoozeActionPoliciesBodySchema,
  snoozeActionPolicyBodySchema,
  actionPolicyDestinationSchema,
  groupingModeSchema,
} from './action_policy_data_schema';
import {
  actionPolicyResponseSchema,
  findActionPoliciesResponseSchema,
} from './action_policy_response_schema';
import {
  createAckEpisodeActionBodySchema,
  createUnackEpisodeActionBodySchema,
  createAssignEpisodeActionBodySchema,
  createTagSeriesActionBodySchema,
  createSnoozeSeriesActionBodySchema,
  createUnsnoozeSeriesActionBodySchema,
  createActivateEpisodeActionBodySchema,
  createDeactivateEpisodeActionBodySchema,
  createSeriesAlertActionBodySchema,
  createEpisodeAlertActionBodySchema,
  bulkTagSeriesActionItemSchema,
  bulkTagSeriesActionBodySchema,
  bulkSnoozeSeriesActionItemSchema,
  bulkSnoozeSeriesActionBodySchema,
  bulkUnsnoozeSeriesActionItemSchema,
  bulkUnsnoozeSeriesActionBodySchema,
  bulkAckEpisodeActionItemSchema,
  bulkAckEpisodeActionBodySchema,
  bulkUnackEpisodeActionItemSchema,
  bulkUnackEpisodeActionBodySchema,
  bulkAssignEpisodeActionItemSchema,
  bulkAssignEpisodeActionBodySchema,
  bulkActivateEpisodeActionItemSchema,
  bulkActivateEpisodeActionBodySchema,
  bulkDeactivateEpisodeActionItemSchema,
  bulkDeactivateEpisodeActionBodySchema,
} from './alert_action_schema';
import {
  matchActionPoliciesForRuleBodySchema,
  matchedActionPolicySchema,
  matchActionPoliciesForRuleResponseSchema,
} from './matched_action_policies_response_schema';
import {
  ruleExecutionViewSchema,
  listRuleExecutionsResponseSchema,
} from './rule_execution_history_schema';
import {
  policyExecutionHistoryItemSchema,
  listPolicyExecutionHistoryResponseSchema,
} from './policy_execution_history_schema';
import {
  bulkByIdsSchema,
  bulkByQuerySchema,
  bulkResponseSchema,
  dryRunResponseSchema,
} from './bulk_operation_schema';
import { errorResponseSchema } from './error_response_schema';

/**
 * These tests guard the OAS component naming contract (rna-program#375):
 * every public request/response schema — and the nested schemas they reuse —
 * must carry a stable `.meta({ id })` so Kibana's OAS emits named `$ref`
 * components (consumed by the Terraform provider) instead of anonymous inline
 * objects. Every id is namespaced with `alerting_` to stay unique across the
 * shared OAS document (alerting v1 already claims ids like `rule_response`).
 */
const getMeta = (schema: z.ZodType): { id?: string; description?: string } =>
  (z.globalRegistry.get(schema) as { id?: string; description?: string } | undefined) ?? {};

const getMetaId = (schema: z.ZodType): string | undefined => getMeta(schema).id;

const EXPECTED_IDS: ReadonlyArray<readonly [z.ZodType, string]> = [
  // rules
  [createRuleDataSchema, 'alerting_new_rule'],
  [updateRuleBodySchema, 'alerting_update_rule'],
  [ruleResponseSchema, 'alerting_rule_response'],
  [findRulesResponseSchema, 'alerting_rule_list_response'],
  [ruleTagsResponseSchema, 'alerting_rule_tags_response'],
  [bulkGetRulesParamsSchema, 'alerting_bulk_get_rules_request'],
  [bulkGetRulesResponseSchema, 'alerting_bulk_get_rules_response'],
  [querySchema, 'alerting_rule_query'],
  [composedQuerySchema, 'alerting_composed_rule_query'],
  [standaloneQuerySchema, 'alerting_standalone_rule_query'],
  [scheduleSchema, 'alerting_rule_schedule'],
  [metadataSchema, 'alerting_rule_metadata'],
  [ruleResponseMetadataSchema, 'alerting_rule_response_metadata'],
  [groupingSchema, 'alerting_rule_grouping'],
  // action policies
  [createActionPolicyDataSchema, 'alerting_new_action_policy'],
  [updateActionPolicyBodySchema, 'alerting_update_action_policy'],
  [bulkSnoozeActionPoliciesBodySchema, 'alerting_bulk_snooze_action_policies_request'],
  [snoozeActionPolicyBodySchema, 'alerting_snooze_action_policy_request'],
  [actionPolicyDestinationSchema, 'alerting_action_policy_destination'],
  [groupingModeSchema, 'alerting_action_policy_grouping_mode'],
  [actionPolicyResponseSchema, 'alerting_action_policy_response'],
  [findActionPoliciesResponseSchema, 'alerting_action_policy_list_response'],
  // alert actions
  [createAckEpisodeActionBodySchema, 'alerting_new_ack_episode_action'],
  [createUnackEpisodeActionBodySchema, 'alerting_new_unack_episode_action'],
  [createAssignEpisodeActionBodySchema, 'alerting_new_assign_episode_action'],
  [createTagSeriesActionBodySchema, 'alerting_new_tag_series_action'],
  [createSnoozeSeriesActionBodySchema, 'alerting_new_snooze_series_action'],
  [createUnsnoozeSeriesActionBodySchema, 'alerting_new_unsnooze_series_action'],
  [createActivateEpisodeActionBodySchema, 'alerting_new_activate_episode_action'],
  [createDeactivateEpisodeActionBodySchema, 'alerting_new_deactivate_episode_action'],
  [createSeriesAlertActionBodySchema, 'alerting_series_alert_action'],
  [createEpisodeAlertActionBodySchema, 'alerting_episode_alert_action'],
  [bulkTagSeriesActionItemSchema, 'alerting_bulk_tag_series_item'],
  [bulkTagSeriesActionBodySchema, 'alerting_bulk_tag_series_request'],
  [bulkSnoozeSeriesActionItemSchema, 'alerting_bulk_snooze_series_item'],
  [bulkSnoozeSeriesActionBodySchema, 'alerting_bulk_snooze_series_request'],
  [bulkUnsnoozeSeriesActionItemSchema, 'alerting_bulk_unsnooze_series_item'],
  [bulkUnsnoozeSeriesActionBodySchema, 'alerting_bulk_unsnooze_series_request'],
  [bulkAckEpisodeActionItemSchema, 'alerting_bulk_ack_episodes_item'],
  [bulkAckEpisodeActionBodySchema, 'alerting_bulk_ack_episodes_request'],
  [bulkUnackEpisodeActionItemSchema, 'alerting_bulk_unack_episodes_item'],
  [bulkUnackEpisodeActionBodySchema, 'alerting_bulk_unack_episodes_request'],
  [bulkAssignEpisodeActionItemSchema, 'alerting_bulk_assign_episodes_item'],
  [bulkAssignEpisodeActionBodySchema, 'alerting_bulk_assign_episodes_request'],
  [bulkActivateEpisodeActionItemSchema, 'alerting_bulk_activate_episodes_item'],
  [bulkActivateEpisodeActionBodySchema, 'alerting_bulk_activate_episodes_request'],
  [bulkDeactivateEpisodeActionItemSchema, 'alerting_bulk_deactivate_episodes_item'],
  [bulkDeactivateEpisodeActionBodySchema, 'alerting_bulk_deactivate_episodes_request'],
  // matched policies
  [matchActionPoliciesForRuleBodySchema, 'alerting_match_action_policies_for_rule_request'],
  [matchedActionPolicySchema, 'alerting_matched_action_policy'],
  [matchActionPoliciesForRuleResponseSchema, 'alerting_match_action_policies_for_rule_response'],
  // execution history
  [ruleExecutionViewSchema, 'alerting_rule_execution'],
  [listRuleExecutionsResponseSchema, 'alerting_rule_executions_response'],
  [policyExecutionHistoryItemSchema, 'alerting_policy_execution_history_item'],
  [listPolicyExecutionHistoryResponseSchema, 'alerting_policy_execution_history_response'],
  /* shared bulk primitives, reused by every by-ID / by-query bulk endpoint */
  [bulkByIdsSchema, 'alerting_bulk_by_ids_request'],
  [bulkByQuerySchema, 'alerting_bulk_by_query_request'],
  [bulkResponseSchema, 'alerting_bulk_operation_response'],
  [dryRunResponseSchema, 'alerting_bulk_dry_run_response'],
  [errorResponseSchema, 'alerting_error_response'],
];

/** Discriminated unions whose every variant must be named for OAS to emit a discriminator mapping. */
const DISCRIMINATED_UNIONS: ReadonlyArray<readonly [string, z.ZodType]> = [
  ['querySchema', querySchema],
  ['actionPolicyDestinationSchema', actionPolicyDestinationSchema],
  ['createSeriesAlertActionBodySchema', createSeriesAlertActionBodySchema],
  ['createEpisodeAlertActionBodySchema', createEpisodeAlertActionBodySchema],
];

describe('alerting v2 OAS component ids', () => {
  it('registers a stable, alerting-namespaced id on every public request/response schema', () => {
    for (const [schema, expectedId] of EXPECTED_IDS) {
      expect(getMetaId(schema)).toBe(expectedId);
    }
  });

  it('namespaces every id under alerting_ so it stays unique in the shared OAS document', () => {
    for (const [, expectedId] of EXPECTED_IDS) {
      expect(expectedId.startsWith('alerting_')).toBe(true);
    }
  });

  it('uses unique ids across all named schemas', () => {
    const ids = EXPECTED_IDS.map(([, id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('retains .describe() metadata when chained with .meta({ id })', () => {
    // querySchema is defined as `.describe(...).meta({ id })`; the description must survive
    // the merge so the generated OAS component keeps its documentation.
    const meta = getMeta(querySchema);
    expect(meta.description).toBe('Detection query configuration.');
    expect(meta.id).toBe('alerting_rule_query');
  });

  it('names every variant of each discriminated union so a discriminator mapping is emitted', () => {
    for (const [name, union] of DISCRIMINATED_UNIONS) {
      const options = (union as unknown as { _zod: { def: { options?: z.ZodType[] } } })._zod.def
        .options;
      expect(Array.isArray(options)).toBe(true);
      for (const option of options ?? []) {
        expect({ union: name, id: getMetaId(option) }).toEqual({
          union: name,
          id: expect.stringMatching(/^alerting_/),
        });
      }
    }
  });
});
