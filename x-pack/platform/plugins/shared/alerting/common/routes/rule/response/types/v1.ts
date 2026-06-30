/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import type { RuleParamsV1 } from '@kbn/response-ops-rule-params';
import type {
  ruleResponseSchemaV1,
  ruleSnoozeScheduleSchemaV1,
  ruleLastRunSchemaV1,
  monitoringSchemaV1,
  ruleResponseInternalSchemaV1,
} from '..';

export type RuleSnoozeSchedule = TypeOf<typeof ruleSnoozeScheduleSchemaV1>;
export type RuleLastRun = TypeOf<typeof ruleLastRunSchemaV1>;
export type Monitoring = TypeOf<typeof monitoringSchemaV1>;

type RuleResponseSchemaType = TypeOf<typeof ruleResponseSchemaV1>;
type RuleResponseInternalSchemaType = TypeOf<typeof ruleResponseInternalSchemaV1>;

export interface RuleResponse<Params extends RuleParamsV1 = never> {
  id: RuleResponseSchemaType['id'];
  enabled: RuleResponseSchemaType['enabled'];
  name: RuleResponseSchemaType['name'];
  tags: RuleResponseSchemaType['tags'];
  rule_type_id: RuleResponseSchemaType['rule_type_id'];
  consumer: RuleResponseSchemaType['consumer'];
  schedule: RuleResponseSchemaType['schedule'];
  actions: RuleResponseSchemaType['actions'];
  params: Params;
  mapped_params?: RuleResponseSchemaType['mapped_params'];
  scheduled_task_id?: RuleResponseSchemaType['scheduled_task_id'];
  created_by: RuleResponseSchemaType['created_by'];
  updated_by: RuleResponseSchemaType['updated_by'];
  created_at: RuleResponseSchemaType['created_at'];
  updated_at: RuleResponseSchemaType['updated_at'];
  api_key_owner: RuleResponseSchemaType['api_key_owner'];
  api_key_created_by_user?: RuleResponseSchemaType['api_key_created_by_user'];
  throttle?: RuleResponseSchemaType['throttle'];
  mute_all: RuleResponseSchemaType['mute_all'];
  notify_when?: RuleResponseSchemaType['notify_when'];
  muted_alert_ids: RuleResponseSchemaType['muted_alert_ids'];
  execution_status?: RuleResponseSchemaType['execution_status'];
  last_run?: RuleResponseSchemaType['last_run'];
  next_run?: RuleResponseSchemaType['next_run'];
  revision: RuleResponseSchemaType['revision'];
  running?: RuleResponseSchemaType['running'];
  alert_delay?: RuleResponseSchemaType['alert_delay'];
  flapping?: RuleResponseSchemaType['flapping'];
  artifacts?: RuleResponseSchemaType['artifacts'];
}

export interface RuleResponseInternal<Params extends RuleParamsV1 = never> {
  id: RuleResponseInternalSchemaType['id'];
  enabled: RuleResponseInternalSchemaType['enabled'];
  name: RuleResponseInternalSchemaType['name'];
  tags: RuleResponseInternalSchemaType['tags'];
  rule_type_id: RuleResponseInternalSchemaType['rule_type_id'];
  consumer: RuleResponseInternalSchemaType['consumer'];
  schedule: RuleResponseInternalSchemaType['schedule'];
  actions: RuleResponseInternalSchemaType['actions'];
  params: Params;
  mapped_params?: RuleResponseInternalSchemaType['mapped_params'];
  scheduled_task_id?: RuleResponseInternalSchemaType['scheduled_task_id'];
  created_by: RuleResponseInternalSchemaType['created_by'];
  updated_by: RuleResponseInternalSchemaType['updated_by'];
  created_at: RuleResponseInternalSchemaType['created_at'];
  updated_at: RuleResponseInternalSchemaType['updated_at'];
  api_key_owner: RuleResponseInternalSchemaType['api_key_owner'];
  api_key_created_by_user?: RuleResponseInternalSchemaType['api_key_created_by_user'];
  throttle?: RuleResponseInternalSchemaType['throttle'];
  mute_all: RuleResponseInternalSchemaType['mute_all'];
  notify_when?: RuleResponseInternalSchemaType['notify_when'];
  muted_alert_ids: RuleResponseInternalSchemaType['muted_alert_ids'];
  snoozed_alert_instances?: RuleResponseInternalSchemaType['snoozed_alert_instances'];
  execution_status?: RuleResponseInternalSchemaType['execution_status'];
  monitoring?: RuleResponseInternalSchemaType['monitoring'];
  snooze_schedule?: RuleResponseInternalSchemaType['snooze_schedule'];
  active_snoozes?: RuleResponseInternalSchemaType['active_snoozes'];
  is_snoozed_until?: RuleResponseInternalSchemaType['is_snoozed_until'];
  last_run?: RuleResponseInternalSchemaType['last_run'];
  next_run?: RuleResponseInternalSchemaType['next_run'];
  revision: RuleResponseInternalSchemaType['revision'];
  running?: RuleResponseInternalSchemaType['running'];
  view_in_app_relative_url?: RuleResponseInternalSchemaType['view_in_app_relative_url'];
  alert_delay?: RuleResponseInternalSchemaType['alert_delay'];
  flapping?: RuleResponseInternalSchemaType['flapping'];
  artifacts?: RuleResponseInternalSchemaType['artifacts'];
}
