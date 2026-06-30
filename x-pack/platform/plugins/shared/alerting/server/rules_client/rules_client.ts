/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UnmuteAlertParams } from '../application/rule/methods/unmute_alert/types';
import type { RuleTagsParams } from '../application/rule/methods/tags';
import { getRuleTags } from '../application/rule/methods/tags';
import type { MuteAlertQuery, MuteAlertParams } from '../application/rule/methods/mute_alert/types';
import { snoozeAlertInstance } from '../application/rule/methods/snooze_alert_instance/snooze_instance';
import type {
  SnoozeAlertInstanceParams,
  SnoozeAlertInstanceQuery,
  SnoozeAlertInstanceBody,
} from '../application/rule/methods/snooze_alert_instance/types';
import type { RuleTypeParams } from '../types';
import { parseDuration } from '../../common/parse_duration';
import type { RulesClientContext } from './types';
import type { CloneRuleParams } from '../application/rule/methods/clone';
import { cloneRule } from '../application/rule/methods/clone';
import type { CreateRuleParams } from '../application/rule/methods/create';
import { createRule } from '../application/rule/methods/create';
import type { UpdateRuleParams } from '../application/rule/methods/update';
import { updateRule } from '../application/rule/methods/update';
import type { SnoozeRuleOptions } from '../application/rule/methods/snooze';
import { snoozeRule } from '../application/rule/methods/snooze';
import type { UnsnoozeParams } from '../application/rule/methods/unsnooze';
import { unsnoozeRule } from '../application/rule/methods/unsnooze';
import type { GetRuleParams } from '../application/rule/methods/get';
import type { BulkGetRulesParams } from '../application/rule/methods/bulk_get';
import { getRule } from '../application/rule/methods/get';
import { bulkGetRules } from '../application/rule/methods/bulk_get';
import type { ResolveParams } from '../application/rule/methods/resolve';
import { resolveRule } from '../application/rule/methods/resolve';
import type { GetAlertStateParams } from './methods/get_alert_state';
import { getAlertState } from './methods/get_alert_state';
import type { GetAlertSummaryParams } from './methods/get_alert_summary';
import { getAlertSummary } from './methods/get_alert_summary';
import type {
  GetExecutionLogByIdParams,
  GetGlobalExecutionLogParams,
} from './methods/get_execution_log';
import { getExecutionLogForRule, getGlobalExecutionLogWithAuth } from './methods/get_execution_log';
import type { GetActionErrorLogByIdParams } from './methods/get_action_error_log';
import { getActionErrorLog, getActionErrorLogWithAuth } from './methods/get_action_error_log';
import type { GetRuleHistoryParams } from './methods/get_rule_history';
import { getRuleHistory } from './methods/get_rule_history';
import type {
  GetGlobalExecutionKPIParams,
  GetRuleExecutionKPIParams,
} from './methods/get_execution_kpi';
import { getGlobalExecutionKpiWithAuth, getRuleExecutionKPI } from './methods/get_execution_kpi';
import type { FindRulesParams } from '../application/rule/methods/find';
import { findRules } from '../application/rule/methods/find';
import type { FindMutedAlertsParams } from '../application/rule/methods/find_muted_alerts';
import { findMutedAlerts } from '../application/rule/methods/find_muted_alerts';
import type { AggregateParams } from '../application/rule/methods/aggregate/types';
import { aggregateRules } from '../application/rule/methods/aggregate';
import type { DeleteRuleParams } from '../application/rule/methods/delete';
import { deleteRule } from '../application/rule/methods/delete';
import type { BulkDeleteRulesParams } from '../application/rule/methods/bulk_delete/types';
import { bulkDeleteRules } from '../application/rule/methods/bulk_delete';
import type { BulkDisableRulesRequestBody } from '../application/rule/methods/bulk_disable';
import { bulkDisableRules } from '../application/rule/methods/bulk_disable';
import type { BulkEditOptions } from '../application/rule/methods/bulk_edit/bulk_edit_rules';
import { bulkEditRules } from '../application/rule/methods/bulk_edit/bulk_edit_rules';
import type { BulkEditRuleParamsOptions } from '../application/rule/methods/bulk_edit_params/types';
import { bulkEditRuleParamsWithReadAuth } from '../application/rule/methods/bulk_edit_params/bulk_edit_rule_params';
import type { BulkEnableRulesParams } from '../application/rule/methods/bulk_enable';
import { bulkEnableRules } from '../application/rule/methods/bulk_enable';
import type { BulkCreateRulesParams } from '../application/rule/methods/bulk_create';
import { bulkCreateRules } from '../application/rule/methods/bulk_create';
import { enableRule } from '../application/rule/methods/enable_rule/enable_rule';
import { updateRuleApiKey } from '../application/rule/methods/update_api_key/update_rule_api_key';
import { disableRule } from '../application/rule/methods/disable/disable_rule';
import { muteInstance } from '../application/rule/methods/mute_alert/mute_instance';
import { unmuteAll } from '../application/rule/methods/unmute_all';
import { muteAll } from '../application/rule/methods/mute_all';
import { unmuteInstance } from '../application/rule/methods/unmute_alert/unmute_instance';
import { unsnoozeAlertInstance } from '../application/rule/methods/unsnooze_alert/unsnooze_instance';
import type { UnsnoozeAlertParams } from '../application/rule/methods/unsnooze_alert/types';
import { bulkMuteUnmuteInstances } from '../application/rule/methods/bulk_mute_unmute_alerts/bulk_mute_unmute_instances';
import type { BulkMuteUnmuteAlertsParams } from '../application/rule/types';
import type { RunSoonParams } from '../application/rule/methods/run_soon';
import { runSoon } from '../application/rule/methods/run_soon';
import { listRuleTypes } from '../application/rule/methods/rule_types/rule_types';
import { getScheduleFrequency } from '../application/rule/methods/get_schedule_frequency/get_schedule_frequency';
import type { BulkUntrackBody } from '../application/rule/methods/bulk_untrack/bulk_untrack_alerts';
import { bulkUntrackAlerts } from '../application/rule/methods/bulk_untrack/bulk_untrack_alerts';
import type { ScheduleBackfillParams } from '../application/backfill/methods/schedule/types';
import { scheduleBackfill } from '../application/backfill/methods/schedule';
import { getBackfill } from '../application/backfill/methods/get';
import { findBackfill } from '../application/backfill/methods/find';
import { deleteBackfill } from '../application/backfill/methods/delete';
import type { FindBackfillParams } from '../application/backfill/methods/find/types';
import type { DisableRuleParams } from '../application/rule/methods/disable';
import type { EnableRuleParams } from '../application/rule/methods/enable_rule';
import type { GetGlobalExecutionSummaryParams } from './methods/get_execution_summary';
import { getGlobalExecutionSummaryWithAuth } from './methods/get_execution_summary';
import type { GetRuleTypesByQueryParams } from '../application/rule/methods/get_rule_types_by_query/types';
import type { FindRuleTemplatesParams } from '../application/rule_template/methods/find/types';
import { getRuleTypesByQuery } from '../application/rule/methods/get_rule_types_by_query/get_rule_types_by_query';
import type { GetRuleTemplateParams } from '../application/rule_template/methods/get/types';
import { getRuleTemplate } from '../application/rule_template/methods/get/get_rule_template';
import { findRuleTemplates } from '../application/rule_template/methods/find/find_rule_templates';
import { createGapAutoFillScheduler } from '../application/gaps/auto_fill_scheduler/methods/create/create_gap_auto_fill_scheduler';
import type { CreateGapAutoFillSchedulerParams } from '../application/gaps/auto_fill_scheduler/methods/create/types';
import { getGapAutoFillScheduler } from '../application/gaps/auto_fill_scheduler/methods/get/get_gap_auto_fill_scheduler';
import type { GetGapAutoFillSchedulerParams } from '../application/gaps/auto_fill_scheduler/methods/types';
import { deleteGapAutoFillScheduler } from '../application/gaps/auto_fill_scheduler/methods/delete/delete_gap_auto_fill_scheduler';
import { updateGapAutoFillScheduler } from '../application/gaps/auto_fill_scheduler/methods/update/update_gap_auto_fill_scheduler';
import type { UpdateGapAutoFillSchedulerParams } from '../application/gaps/auto_fill_scheduler/methods/update/types';

// Gap methods
import { findGaps } from '../application/gaps/methods/find_gaps';
import { fillGapById } from '../application/gaps/methods/fill_gap_by_id';
import type { FillGapByIdParams } from '../application/gaps/methods/fill_gap_by_id/types';
import type { GetRuleIdsWithGapsParams } from '../application/gaps/methods/get_rule_ids_with_gaps/types';
import { getRuleIdsWithGaps } from '../application/gaps/methods/get_rule_ids_with_gaps';
import { getGapsSummaryByRuleIds } from '../application/gaps/methods/get_gaps_summary_by_rule_ids';
import type { GetGapsSummaryByRuleIdsParams } from '../application/gaps/methods/get_gaps_summary_by_rule_ids/types';
import type { FindGapsParams } from '../application/gaps/types';
import { bulkFillGapsByRuleIds } from '../application/gaps/methods/bulk_fill_gaps_by_rule_ids';
import type {
  BulkFillGapsByRuleIdsOptions,
  BulkFillGapsByRuleIdsParams,
} from '../application/gaps/methods/bulk_fill_gaps_by_rule_ids/types';
import type { FindGapAutoFillSchedulerLogsParams } from '../application/gaps/auto_fill_scheduler/methods/find_logs/types/find_gap_auto_fill_scheduler_logs_types';
import { findGapAutoFillSchedulerLogs } from '../application/gaps/auto_fill_scheduler/methods/find_logs/find_gap_auto_fill_scheduler_logs';

export type ConstructorOptions = Omit<RulesClientContext, 'minimumScheduleIntervalInMs'>;

export const fieldsToExcludeFromRevisionUpdates: ReadonlySet<keyof RuleTypeParams> = new Set([
  'activeSnoozes',
  'alertTypeId',
  'apiKey',
  'apiKeyOwner',
  'apiKeyCreatedByUser',
  'consumer',
  'createdAt',
  'createdBy',
  'enabled',
  'executionStatus',
  'id',
  'isSnoozedUntil',
  'lastRun',
  'monitoring',
  'muteAll',
  'mutedInstanceIds',
  'nextRun',
  'revision',
  'running',
  'snoozeSchedule',
  'snoozedInstances',
  'systemActions',
  'updatedBy',
  'updatedAt',
]);

export class RulesClient {
  private readonly context: RulesClientContext;

  constructor(context: ConstructorOptions) {
    this.context = {
      ...context,
      minimumScheduleIntervalInMs: parseDuration(context.minimumScheduleInterval.value),
    };
  }

  public aggregate = <T = Record<string, unknown>>(params: AggregateParams<T>): Promise<T> =>
    aggregateRules<T>(this.context, params);
  public clone = <Params extends RuleTypeParams = never>(params: CloneRuleParams) =>
    cloneRule<Params>(this.context, params);
  public create = <Params extends RuleTypeParams = never>(params: CreateRuleParams<Params>) =>
    createRule<Params>(this.context, params);
  public delete = (params: DeleteRuleParams) => deleteRule(this.context, params);
  public find = <Params extends RuleTypeParams = never>(params?: FindRulesParams) =>
    findRules<Params>(this.context, params);
  public findMutedAlerts = (params?: FindMutedAlertsParams) =>
    findMutedAlerts(this.context, params);
  public get = <Params extends RuleTypeParams = never>(params: GetRuleParams) =>
    getRule<Params>(this.context, params);
  public resolve = <Params extends RuleTypeParams = never>(params: ResolveParams) =>
    resolveRule<Params>(this.context, params);
  public update = <Params extends RuleTypeParams = never>(params: UpdateRuleParams<Params>) =>
    updateRule<Params>(this.context, params);

  public getAlertState = (params: GetAlertStateParams) => getAlertState(this.context, params);
  public getAlertSummary = (params: GetAlertSummaryParams) => getAlertSummary(this.context, params);
  public getExecutionLogForRule = (params: GetExecutionLogByIdParams) =>
    getExecutionLogForRule(this.context, params);
  public getGlobalExecutionLogWithAuth = (params: GetGlobalExecutionLogParams) =>
    getGlobalExecutionLogWithAuth(this.context, params);
  public getRuleExecutionKPI = (params: GetRuleExecutionKPIParams) =>
    getRuleExecutionKPI(this.context, params);
  public getGlobalExecutionKpiWithAuth = (params: GetGlobalExecutionKPIParams) =>
    getGlobalExecutionKpiWithAuth(this.context, params);
  public getGlobalExecutionSummaryWithAuth = (params: GetGlobalExecutionSummaryParams) =>
    getGlobalExecutionSummaryWithAuth(this.context, params);
  public getActionErrorLog = (params: GetActionErrorLogByIdParams) =>
    getActionErrorLog(this.context, params);
  public getActionErrorLogWithAuth = (params: GetActionErrorLogByIdParams) =>
    getActionErrorLogWithAuth(this.context, params);

  public getHistory = (params: GetRuleHistoryParams) => getRuleHistory(this.context, params);

  public bulkGetRules = <Params extends RuleTypeParams = never>(params: BulkGetRulesParams) =>
    bulkGetRules<Params>(this.context, params);
  public bulkCreateRules = <Params extends RuleTypeParams = never>(
    params: BulkCreateRulesParams<Params>
  ) => bulkCreateRules<Params>(this.context, params);
  public bulkDeleteRules = (options: BulkDeleteRulesParams) =>
    bulkDeleteRules(this.context, options);
  public bulkEdit = <Params extends RuleTypeParams>(options: BulkEditOptions<Params>) =>
    bulkEditRules<Params>(this.context, options);

  public bulkEditRuleParamsWithReadAuth = <Params extends RuleTypeParams>(
    options: BulkEditRuleParamsOptions<Params>
  ) => bulkEditRuleParamsWithReadAuth<Params>(this.context, options);
  public bulkEnableRules = (params: BulkEnableRulesParams) => bulkEnableRules(this.context, params);
  public bulkDisableRules = (options: BulkDisableRulesRequestBody) =>
    bulkDisableRules(this.context, options);

  public updateRuleApiKey = (params: { id: string }) => updateRuleApiKey(this.context, params);
  public disableRule = (params: DisableRuleParams) => disableRule(this.context, params);
  public enableRule = (params: EnableRuleParams) => enableRule(this.context, params);

  public snooze = (options: SnoozeRuleOptions) => snoozeRule(this.context, options);
  public unsnooze = (options: UnsnoozeParams) => unsnoozeRule(this.context, options);

  public muteAll = (options: { id: string }) => muteAll(this.context, options);
  public unmuteAll = (options: { id: string }) => unmuteAll(this.context, options);
  public muteInstance = (options: { params: MuteAlertParams; query: MuteAlertQuery }) =>
    muteInstance(this.context, options);
  public snoozeAlertInstance = (options: {
    params: SnoozeAlertInstanceParams;
    query: SnoozeAlertInstanceQuery;
    body: SnoozeAlertInstanceBody;
  }) => snoozeAlertInstance(this.context, options);
  public bulkMuteInstances = (options: BulkMuteUnmuteAlertsParams) =>
    bulkMuteUnmuteInstances(this.context, { params: options, mute: true });
  public bulkUnmuteInstances = (options: BulkMuteUnmuteAlertsParams) =>
    bulkMuteUnmuteInstances(this.context, { params: options, mute: false });
  public unmuteInstance = (options: UnmuteAlertParams) => unmuteInstance(this.context, options);
  public unsnoozeAlertInstance = (options: UnsnoozeAlertParams) =>
    unsnoozeAlertInstance(this.context, options);

  public bulkUntrackAlerts = (options: BulkUntrackBody) => bulkUntrackAlerts(this.context, options);

  public runSoon = (options: RunSoonParams) => runSoon(this.context, options);

  public listRuleTypes = () => listRuleTypes(this.context);

  public scheduleBackfill = (params: ScheduleBackfillParams) =>
    scheduleBackfill(this.context, params);

  public getBackfill = (id: string) => getBackfill(this.context, id);

  public findBackfill = (params: FindBackfillParams) => findBackfill(this.context, params);

  public deleteBackfill = (id: string) => deleteBackfill(this.context, id);

  public getSpaceId(): string | undefined {
    return this.context.spaceId;
  }

  public getAuthorization() {
    return this.context.authorization;
  }

  public getAuditLogger() {
    return this.context.auditLogger;
  }

  public getTags = (params: RuleTagsParams) => getRuleTags(this.context, params);

  public getTemplate = (params: GetRuleTemplateParams) => getRuleTemplate(this.context, params);

  public findTemplates = (params: FindRuleTemplatesParams) =>
    findRuleTemplates(this.context, params);

  public getScheduleFrequency = () => getScheduleFrequency(this.context);

  public findGaps = (params: FindGapsParams) => findGaps(this.context, params);

  public fillGapById = (params: FillGapByIdParams) => fillGapById(this.context, params);

  public bulkFillGapsByRuleIds = (
    params: BulkFillGapsByRuleIdsParams,
    options: BulkFillGapsByRuleIdsOptions
  ) => bulkFillGapsByRuleIds(this.context, params, options);

  public getRuleIdsWithGaps = (params: GetRuleIdsWithGapsParams) =>
    getRuleIdsWithGaps(this.context, params);

  public getGapsSummaryByRuleIds = (params: GetGapsSummaryByRuleIdsParams) =>
    getGapsSummaryByRuleIds(this.context, params);

  public getRuleTypesByQuery = (params: GetRuleTypesByQueryParams) =>
    getRuleTypesByQuery(this.context, params);

  public createGapAutoFillScheduler = (params: CreateGapAutoFillSchedulerParams) =>
    createGapAutoFillScheduler(this.context, params);

  public getGapAutoFillScheduler = (params: GetGapAutoFillSchedulerParams) =>
    getGapAutoFillScheduler(this.context, params);

  public updateGapAutoFillScheduler = (params: UpdateGapAutoFillSchedulerParams) =>
    updateGapAutoFillScheduler(this.context, params);

  public deleteGapAutoFillScheduler = (params: GetGapAutoFillSchedulerParams) =>
    deleteGapAutoFillScheduler(this.context, params);

  public findGapAutoFillSchedulerLogs = (params: FindGapAutoFillSchedulerLogsParams) =>
    findGapAutoFillSchedulerLogs(this.context, params);

  public getContext() {
    return this.context;
  }
}
