/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EcsEvent } from '@kbn/core/server';
import type { AuditEvent } from '@kbn/security-plugin/server';
import type { ArrayElement } from '@kbn/utility-types';
import {
  AD_HOC_RUN_SAVED_OBJECT_TYPE,
  GAP_AUTO_FILL_SCHEDULER_SAVED_OBJECT_TYPE,
  RULE_TEMPLATE_SAVED_OBJECT_TYPE,
} from '../../saved_objects';

export enum RuleAuditAction {
  CREATE = 'rule_create',
  GET = 'rule_get',
  BULK_GET = 'rule_bulk_get',
  RESOLVE = 'rule_resolve',
  UPDATE = 'rule_update',
  UPDATE_API_KEY = 'rule_update_api_key',
  ENABLE = 'rule_enable',
  DISABLE = 'rule_disable',
  DELETE = 'rule_delete',
  FIND = 'rule_find',
  FIND_MUTED_ALERTS = 'rule_find_muted_alerts',
  MUTE = 'rule_mute',
  UNMUTE = 'rule_unmute',
  BULK_MUTE_ALERTS = 'rule_alert_bulk_mute',
  BULK_UNMUTE_ALERTS = 'rule_alert_bulk_unmute',
  MUTE_ALERT = 'rule_alert_mute',
  UNMUTE_ALERT = 'rule_alert_unmute',
  AGGREGATE = 'rule_aggregate',
  BULK_EDIT = 'rule_bulk_edit',
  BULK_EDIT_PARAMS = 'rule_bulk_edit_params',
  GET_EXECUTION_LOG = 'rule_get_execution_log',
  GET_GLOBAL_EXECUTION_LOG = 'rule_get_global_execution_log',
  GET_GLOBAL_EXECUTION_KPI = 'rule_get_global_execution_kpi',
  GET_GLOBAL_EXECUTION_SUMMARY = 'rule_get_global_execution_summary',
  GET_ACTION_ERROR_LOG = 'rule_get_action_error_log',
  GET_HISTORY = 'rule_get_history',
  GET_RULE_EXECUTION_KPI = 'rule_get_execution_kpi',
  SNOOZE = 'rule_snooze',
  UNSNOOZE = 'rule_unsnooze',
  RUN_SOON = 'rule_run_soon',
  ACKNOWLEDGE_ALERT = 'rule_alert_acknowledge',
  UNACKNOWLEDGE_ALERT = 'rule_alert_unacknowledge',
  UNTRACK_ALERT = 'rule_alert_untrack',
  SCHEDULE_BACKFILL = 'rule_schedule_backfill',
  FIND_GAPS = 'rule_find_gaps',
  FILL_GAPS = 'rule_fill_gaps',
  GET_RULES_WITH_GAPS = 'rule_get_rules_with_gaps',
  GET_GAPS_SUMMARY_BY_RULE_IDS = 'rule_get_gaps_summary_by_rule_ids',
  BULK_CREATE = 'rule_bulk_create',
}

export enum AdHocRunAuditAction {
  CREATE = 'ad_hoc_run_create',
  GET = 'ad_hoc_run_get',
  FIND = 'ad_hoc_run_find',
  DELETE = 'ad_hoc_run_delete',
}

export enum GapAutoFillSchedulerAuditAction {
  CREATE = 'gap_auto_fill_scheduler_create',
  GET = 'gap_auto_fill_scheduler_get',
  UPDATE = 'gap_auto_fill_scheduler_update',
  DELETE = 'gap_auto_fill_scheduler_delete',
  GET_LOGS = 'gap_auto_fill_scheduler_get_logs',
}

export interface GapAutoFillSchedulerAuditEventParams {
  action: GapAutoFillSchedulerAuditAction;
  outcome?: EcsEvent['outcome'];
  savedObject?: NonNullable<AuditEvent['kibana']>['saved_object'];
  error?: Error;
}

type VerbsTuple = [string, string, string];

const ruleEventVerbs: Record<RuleAuditAction, VerbsTuple> = {
  rule_create: ['create', 'creating', 'created'],
  rule_get: ['access', 'accessing', 'accessed'],
  rule_bulk_get: ['bulk access', 'bulk accessing', 'bulk accessed'],
  rule_resolve: ['access', 'accessing', 'accessed'],
  rule_update: ['update', 'updating', 'updated'],
  rule_bulk_edit: ['update', 'updating', 'updated'],
  rule_bulk_edit_params: ['update', 'updating', 'updated'],
  rule_update_api_key: ['update API key of', 'updating API key of', 'updated API key of'],
  rule_enable: ['enable', 'enabling', 'enabled'],
  rule_disable: ['disable', 'disabling', 'disabled'],
  rule_delete: ['delete', 'deleting', 'deleted'],
  rule_find: ['access', 'accessing', 'accessed'],
  rule_find_muted_alerts: [
    'access muted alerts for',
    'accessing muted alerts for',
    'accessed muted alerts for',
  ],
  rule_mute: ['mute', 'muting', 'muted'],
  rule_unmute: ['unmute', 'unmuting', 'unmuted'],
  rule_alert_bulk_mute: ['bulk mute', 'bulk muting', 'bulk muted'],
  rule_alert_bulk_unmute: ['bulk unmute', 'bulk unmuting', 'bulk unmuted'],
  rule_alert_mute: ['mute alert of', 'muting alert of', 'muted alert of'],
  rule_alert_unmute: ['unmute alert of', 'unmuting alert of', 'unmuted alert of'],
  rule_aggregate: ['access', 'accessing', 'accessed'],
  rule_get_execution_log: [
    'access execution log for',
    'accessing execution log for',
    'accessed execution log for',
  ],
  rule_get_global_execution_log: [
    'access execution log',
    'accessing execution log',
    'accessed execution log',
  ],
  rule_get_action_error_log: [
    'access action error log for',
    'accessing action error log for',
    'accessed action error log for',
  ],
  rule_get_history: [
    'access change history for',
    'accessing change history for',
    'accessed change history for',
  ],
  rule_snooze: ['snooze', 'snoozing', 'snoozed'],
  rule_unsnooze: ['unsnooze', 'unsnoozing', 'unsnoozed'],
  rule_run_soon: ['run', 'running', 'ran'],
  rule_get_execution_kpi: [
    'access execution KPI for',
    'accessing execution KPI for',
    'accessed execution KPI for',
  ],
  rule_get_global_execution_kpi: [
    'access global execution KPI for',
    'accessing global execution KPI for',
    'accessed global execution KPI for',
  ],
  rule_get_global_execution_summary: [
    'access global execution summary for',
    'accessing global execution summary for',
    'accessed global execution summary for',
  ],
  rule_alert_acknowledge: [
    'acknowledge alert of',
    'acknowledging alert of',
    'acknowledged alert of',
  ],
  rule_alert_unacknowledge: [
    'unacknowledge alert of',
    'unacknowledging alert of',
    'unacknowledged alert of',
  ],
  rule_alert_untrack: ['untrack', 'untracking', 'untracked'],
  rule_schedule_backfill: [
    'schedule backfill for',
    'scheduling backfill for',
    'scheduled backfill for',
  ],
  rule_find_gaps: ['find gaps for', 'finding gaps for', 'found gaps for'],
  rule_fill_gaps: ['fill gaps for', 'filling gaps for', 'filled gaps for'],
  rule_get_rules_with_gaps: [
    'get rules with gaps',
    'getting rules with gaps',
    'got rules with gaps',
  ],
  rule_get_gaps_summary_by_rule_ids: [
    'get gaps summary by rule ids',
    'getting gaps summary by rule ids',
    'got gaps summary by rule ids',
  ],
  rule_bulk_create: ['bulk create', 'bulk creating', 'bulk created'],
};

const adHocRunEventVerbs: Record<AdHocRunAuditAction, VerbsTuple> = {
  ad_hoc_run_create: ['create ad hoc run for', 'creating ad hoc run for', 'created ad hoc run for'],
  ad_hoc_run_get: ['get ad hoc run for', 'getting ad hoc run for', 'got ad hoc run for'],
  ad_hoc_run_find: ['find ad hoc run for', 'finding ad hoc run for', 'found ad hoc run for'],
  ad_hoc_run_delete: ['delete ad hoc run for', 'deleting ad hoc run for', 'deleted ad hoc run for'],
};

const ruleEventTypes: Record<RuleAuditAction, ArrayElement<EcsEvent['type']>> = {
  rule_create: 'creation',
  rule_get: 'access',
  rule_bulk_get: 'access',
  rule_resolve: 'access',
  rule_update: 'change',
  rule_bulk_edit: 'change',
  rule_bulk_edit_params: 'change',
  rule_update_api_key: 'change',
  rule_enable: 'change',
  rule_disable: 'change',
  rule_delete: 'deletion',
  rule_find: 'access',
  rule_find_muted_alerts: 'access',
  rule_mute: 'change',
  rule_unmute: 'change',
  rule_alert_bulk_mute: 'change',
  rule_alert_bulk_unmute: 'change',
  rule_alert_mute: 'change',
  rule_alert_unmute: 'change',
  rule_aggregate: 'access',
  rule_get_execution_log: 'access',
  rule_get_global_execution_log: 'access',
  rule_get_action_error_log: 'access',
  rule_get_history: 'access',
  rule_snooze: 'change',
  rule_unsnooze: 'change',
  rule_run_soon: 'access',
  rule_get_execution_kpi: 'access',
  rule_get_global_execution_kpi: 'access',
  rule_get_global_execution_summary: 'access',
  rule_alert_acknowledge: 'change',
  rule_alert_unacknowledge: 'change',
  rule_alert_untrack: 'change',
  rule_schedule_backfill: 'access',
  rule_find_gaps: 'access',
  rule_fill_gaps: 'change',
  rule_get_rules_with_gaps: 'access',
  rule_get_gaps_summary_by_rule_ids: 'access',
  rule_bulk_create: 'creation',
};

const adHocRunEventTypes: Record<AdHocRunAuditAction, ArrayElement<EcsEvent['type']>> = {
  ad_hoc_run_create: 'creation',
  ad_hoc_run_get: 'access',
  ad_hoc_run_find: 'access',
  ad_hoc_run_delete: 'deletion',
};

export interface RuleAuditEventParams {
  action: RuleAuditAction;
  outcome?: EcsEvent['outcome'];
  savedObject?: NonNullable<AuditEvent['kibana']>['saved_object'];
  error?: Error;
}

export interface AdHocRunAuditEventParams {
  action: AdHocRunAuditAction;
  outcome?: EcsEvent['outcome'];
  savedObject?: NonNullable<AuditEvent['kibana']>['saved_object'];
  error?: Error;
}

export function ruleAuditEvent({
  action,
  savedObject,
  outcome,
  error,
}: RuleAuditEventParams): AuditEvent {
  const doc = savedObject
    ? [`rule [id=${savedObject.id}]`, savedObject.name && `[name=${savedObject.name}]`]
        .filter(Boolean)
        .join(' ')
    : 'a rule';

  const [present, progressive, past] = ruleEventVerbs[action];
  const message = error
    ? `Failed attempt to ${present} ${doc}`
    : outcome === 'unknown'
    ? `User is ${progressive} ${doc}`
    : `User has ${past} ${doc}`;
  const type = ruleEventTypes[action];

  return {
    message,
    event: {
      action,
      category: ['database'],
      type: type ? [type] : undefined,
      outcome: outcome ?? (error ? 'failure' : 'success'),
    },
    kibana: {
      saved_object: savedObject,
    },
    error: error && {
      code: error.name,
      message: error.message,
    },
  };
}

export function adHocRunAuditEvent({
  action,
  savedObject,
  outcome,
  error,
}: AdHocRunAuditEventParams): AuditEvent {
  const doc = savedObject
    ? [
        `${AD_HOC_RUN_SAVED_OBJECT_TYPE} [id=${savedObject.id}]`,
        savedObject.name && `${savedObject.name}`,
      ]
        .filter(Boolean)
        .join(' ')
    : 'an ad hoc run';
  const [present, progressive, past] = adHocRunEventVerbs[action];
  const message = error
    ? `Failed attempt to ${present} ${doc}`
    : outcome === 'unknown'
    ? `User is ${progressive} ${doc}`
    : `User has ${past} ${doc}`;
  const type = adHocRunEventTypes[action];

  return {
    message,
    event: {
      action,
      category: ['database'],
      type: type ? [type] : undefined,
      outcome: outcome ?? (error ? 'failure' : 'success'),
    },
    kibana: {
      saved_object: savedObject,
    },
    error: error && {
      code: error.name,
      message: error.message,
    },
  };
}

export enum RuleTemplateAuditAction {
  GET = 'rule_template_get',
  FIND = 'rule_template_find',
}

const ruleTemplateEventVerbs: Record<RuleTemplateAuditAction, VerbsTuple> = {
  rule_template_get: ['access', 'accessing', 'accessed'],
  rule_template_find: ['access', 'accessing', 'accessed'],
};

const ruleTemplateEventTypes: Record<RuleTemplateAuditAction, ArrayElement<EcsEvent['type']>> = {
  rule_template_get: 'access',
  rule_template_find: 'access',
};

export interface RuleTemplateAuditEventParams {
  action: RuleTemplateAuditAction;
  outcome?: EcsEvent['outcome'];
  savedObject?: NonNullable<AuditEvent['kibana']>['saved_object'];
  error?: Error;
}

export function ruleTemplateAuditEvent({
  action,
  savedObject,
  outcome,
  error,
}: RuleTemplateAuditEventParams): AuditEvent {
  const doc = savedObject
    ? [
        `${RULE_TEMPLATE_SAVED_OBJECT_TYPE} [id=${savedObject.id}]`,
        savedObject.name && `[name=${savedObject.name}]`,
      ]
        .filter(Boolean)
        .join(' ')
    : 'a rule template';
  const [present, progressive, past] = ruleTemplateEventVerbs[action];
  const message = error
    ? `Failed attempt to ${present} ${doc}`
    : outcome === 'unknown'
    ? `User is ${progressive} ${doc}`
    : `User has ${past} ${doc}`;
  const type = ruleTemplateEventTypes[action];

  return {
    message,
    event: {
      action,
      category: ['database'],
      type: type ? [type] : undefined,
      outcome: outcome ?? (error ? 'failure' : 'success'),
    },
    kibana: {
      saved_object: savedObject,
    },
    error: error && {
      code: error.name,
      message: error.message,
    },
  };
}

const gapAutoFillSchedulerEventVerbs: Record<GapAutoFillSchedulerAuditAction, VerbsTuple> = {
  gap_auto_fill_scheduler_create: [
    'create gap auto fill scheduler',
    'creating gap auto fill scheduler',
    'created gap auto fill scheduler',
  ],
  gap_auto_fill_scheduler_get: [
    'get gap auto fill scheduler',
    'getting gap auto fill scheduler',
    'got gap auto fill scheduler',
  ],
  gap_auto_fill_scheduler_update: [
    'update gap auto fill scheduler',
    'updating gap auto fill scheduler',
    'updated gap auto fill scheduler',
  ],
  gap_auto_fill_scheduler_delete: [
    'delete gap auto fill scheduler',
    'deleting gap auto fill scheduler',
    'deleted gap auto fill scheduler',
  ],
  gap_auto_fill_scheduler_get_logs: [
    'get gap auto fill scheduler logs',
    'getting gap auto fill scheduler logs',
    'got gap auto fill scheduler logs',
  ],
};

const gapAutoFillSchedulerEventTypes: Record<
  GapAutoFillSchedulerAuditAction,
  ArrayElement<EcsEvent['type']>
> = {
  gap_auto_fill_scheduler_create: 'creation',
  gap_auto_fill_scheduler_get: 'access',
  gap_auto_fill_scheduler_update: 'change',
  gap_auto_fill_scheduler_delete: 'deletion',
  gap_auto_fill_scheduler_get_logs: 'access',
};

export function gapAutoFillSchedulerAuditEvent({
  action,
  savedObject,
  outcome,
  error,
}: GapAutoFillSchedulerAuditEventParams): AuditEvent {
  const doc = savedObject
    ? [
        `${GAP_AUTO_FILL_SCHEDULER_SAVED_OBJECT_TYPE} [id=${savedObject.id}]`,
        savedObject.name && `[name=${savedObject.name}]`,
      ]
        .filter(Boolean)
        .join(' ')
    : 'a gap auto fill scheduler';
  const [present, progressive, past] = gapAutoFillSchedulerEventVerbs[action];
  const message = error
    ? `Failed attempt to ${present} ${doc}`
    : outcome === 'unknown'
    ? `User is ${progressive} ${doc}`
    : `User has ${past} ${doc}`;
  const type = gapAutoFillSchedulerEventTypes[action];

  return {
    message,
    event: {
      action,
      category: ['database'],
      type: type ? [type] : undefined,
      outcome: outcome ?? (error ? 'failure' : 'success'),
    },
    kibana: {
      saved_object: savedObject,
    },
    error: error && {
      code: error.name,
      message: error.message,
    },
  };
}
