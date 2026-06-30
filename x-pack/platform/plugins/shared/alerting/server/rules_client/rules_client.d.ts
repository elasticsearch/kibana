import type { UnmuteAlertParams } from '../application/rule/methods/unmute_alert/types';
import type { RuleTagsParams } from '../application/rule/methods/tags';
import type { MuteAlertQuery, MuteAlertParams } from '../application/rule/methods/mute_alert/types';
import type { RuleTypeParams } from '../types';
import type { RulesClientContext } from './types';
import type { CloneRuleParams } from '../application/rule/methods/clone';
import type { CreateRuleParams } from '../application/rule/methods/create';
import type { UpdateRuleParams } from '../application/rule/methods/update';
import type { SnoozeRuleOptions } from '../application/rule/methods/snooze';
import type { UnsnoozeParams } from '../application/rule/methods/unsnooze';
import type { GetRuleParams } from '../application/rule/methods/get';
import type { BulkGetRulesParams } from '../application/rule/methods/bulk_get';
import type { ResolveParams } from '../application/rule/methods/resolve';
import type { GetAlertStateParams } from './methods/get_alert_state';
import type { GetAlertSummaryParams } from './methods/get_alert_summary';
import type { GetExecutionLogByIdParams, GetGlobalExecutionLogParams } from './methods/get_execution_log';
import type { GetActionErrorLogByIdParams } from './methods/get_action_error_log';
import type { GetRuleHistoryParams } from './methods/get_rule_history';
import type { GetGlobalExecutionKPIParams, GetRuleExecutionKPIParams } from './methods/get_execution_kpi';
import type { FindRulesParams } from '../application/rule/methods/find';
import type { AggregateParams } from '../application/rule/methods/aggregate/types';
import type { DeleteRuleParams } from '../application/rule/methods/delete';
import type { BulkDeleteRulesParams } from '../application/rule/methods/bulk_delete/types';
import type { BulkDisableRulesRequestBody } from '../application/rule/methods/bulk_disable';
import type { BulkEditOptions } from '../application/rule/methods/bulk_edit/bulk_edit_rules';
import type { BulkEditRuleParamsOptions } from '../application/rule/methods/bulk_edit_params/types';
import type { BulkEnableRulesParams } from '../application/rule/methods/bulk_enable';
import type { BulkCreateRulesParams } from '../application/rule/methods/bulk_create';
import type { BulkMuteUnmuteAlertsParams } from '../application/rule/types';
import type { RunSoonParams } from '../application/rule/methods/run_soon';
import type { BulkUntrackBody } from '../application/rule/methods/bulk_untrack/bulk_untrack_alerts';
import type { ScheduleBackfillParams } from '../application/backfill/methods/schedule/types';
import type { FindBackfillParams } from '../application/backfill/methods/find/types';
import type { DisableRuleParams } from '../application/rule/methods/disable';
import type { EnableRuleParams } from '../application/rule/methods/enable_rule';
import type { GetGlobalExecutionSummaryParams } from './methods/get_execution_summary';
import type { GetRuleTypesByQueryParams } from '../application/rule/methods/get_rule_types_by_query/types';
import type { FindRuleTemplatesParams } from '../application/rule_template/methods/find/types';
import type { GetRuleTemplateParams } from '../application/rule_template/methods/get/types';
import type { CreateGapAutoFillSchedulerParams } from '../application/gaps/auto_fill_scheduler/methods/create/types';
import type { GetGapAutoFillSchedulerParams } from '../application/gaps/auto_fill_scheduler/methods/types';
import type { UpdateGapAutoFillSchedulerParams } from '../application/gaps/auto_fill_scheduler/methods/update/types';
import type { FillGapByIdParams } from '../application/gaps/methods/fill_gap_by_id/types';
import type { GetRuleIdsWithGapsParams } from '../application/gaps/methods/get_rule_ids_with_gaps/types';
import type { GetGapsSummaryByRuleIdsParams } from '../application/gaps/methods/get_gaps_summary_by_rule_ids/types';
import type { FindGapsParams } from '../application/gaps/types';
import type { BulkFillGapsByRuleIdsOptions, BulkFillGapsByRuleIdsParams } from '../application/gaps/methods/bulk_fill_gaps_by_rule_ids/types';
import type { FindGapAutoFillSchedulerLogsParams } from '../application/gaps/auto_fill_scheduler/methods/find_logs/types/find_gap_auto_fill_scheduler_logs_types';
export type ConstructorOptions = Omit<RulesClientContext, 'minimumScheduleIntervalInMs'>;
export declare const fieldsToExcludeFromRevisionUpdates: ReadonlySet<keyof RuleTypeParams>;
export declare class RulesClient {
    private readonly context;
    constructor(context: ConstructorOptions);
    aggregate: <T = Record<string, unknown>>(params: AggregateParams<T>) => Promise<T>;
    clone: <Params extends RuleTypeParams = never>(params: CloneRuleParams) => Promise<import("@kbn/alerting-types/rule_types").SanitizedRule<Params>>;
    create: <Params extends RuleTypeParams = never>(params: CreateRuleParams<Params>) => Promise<import("@kbn/alerting-types/rule_types").SanitizedRule<Params>>;
    delete: (params: DeleteRuleParams) => Promise<{}>;
    find: <Params extends RuleTypeParams = never>(params?: FindRulesParams) => Promise<import("./types").FindResult<Params>>;
    get: <Params extends RuleTypeParams = never>(params: GetRuleParams) => Promise<import("@kbn/alerting-types/rule_types").SanitizedRule<Params> | import("../types").SanitizedRuleWithLegacyId<Params>>;
    resolve: <Params extends RuleTypeParams = never>(params: ResolveParams) => Promise<import("@kbn/alerting-types/rule_types").ResolvedSanitizedRule<Params>>;
    update: <Params extends RuleTypeParams = never>(params: UpdateRuleParams<Params>) => Promise<import("@kbn/alerting-types/rule_types").SanitizedRule<Params>>;
    getAlertState: (params: GetAlertStateParams) => Promise<void | Readonly<{
        alertTypeState?: Record<string, any> | undefined;
        alertInstances?: Record<string, Readonly<{
            meta?: Readonly<{
                lastScheduledActions?: Readonly<{
                    subgroup?: string | undefined;
                    actions?: Record<string, Readonly<{} & {
                        date: string;
                    }>> | undefined;
                } & {
                    date: string;
                    group: string;
                }> | undefined;
                flappingHistory?: boolean[] | undefined;
                flapping?: boolean | undefined;
                maintenanceWindowIds?: string[] | undefined;
                maintenanceWindowNames?: string[] | undefined;
                pendingRecoveredCount?: number | undefined;
                uuid?: string | undefined;
                activeCount?: number | undefined;
            } & {}> | undefined;
            state?: Record<string, any> | undefined;
        }>> | undefined;
        alertRecoveredInstances?: Record<string, Readonly<{
            meta?: Readonly<{
                lastScheduledActions?: Readonly<{
                    subgroup?: string | undefined;
                    actions?: Record<string, Readonly<{} & {
                        date: string;
                    }>> | undefined;
                } & {
                    date: string;
                    group: string;
                }> | undefined;
                flappingHistory?: boolean[] | undefined;
                flapping?: boolean | undefined;
                maintenanceWindowIds?: string[] | undefined;
                maintenanceWindowNames?: string[] | undefined;
                pendingRecoveredCount?: number | undefined;
                uuid?: string | undefined;
                activeCount?: number | undefined;
            } & {}> | undefined;
            state?: Record<string, any> | undefined;
        }>> | undefined;
        previousStartedAt?: string | null | undefined;
        summaryActions?: Record<string, Readonly<{
            date: string;
        }>> | undefined;
    } & {}>>;
    getAlertSummary: (params: GetAlertSummaryParams) => Promise<import("../types").AlertSummary>;
    getExecutionLogForRule: (params: GetExecutionLogByIdParams) => Promise<import("../types").IExecutionLogResult>;
    getGlobalExecutionLogWithAuth: (params: GetGlobalExecutionLogParams) => Promise<import("../types").IExecutionLogResult>;
    getRuleExecutionKPI: (params: GetRuleExecutionKPIParams) => Promise<{
        success: number;
        unknown: number;
        failure: number;
        warning: number;
        activeAlerts: number;
        newAlerts: number;
        recoveredAlerts: number;
        erroredActions: number;
        triggeredActions: number;
    }>;
    getGlobalExecutionKpiWithAuth: (params: GetGlobalExecutionKPIParams) => Promise<{
        success: number;
        unknown: number;
        failure: number;
        warning: number;
        activeAlerts: number;
        newAlerts: number;
        recoveredAlerts: number;
        erroredActions: number;
        triggeredActions: number;
    }>;
    getGlobalExecutionSummaryWithAuth: (params: GetGlobalExecutionSummaryParams) => Promise<{
        executions: {
            total: number;
            success: number;
        };
        latestExecutionSummary: {
            success: number;
            failure: number;
            warning: number;
        };
    }>;
    getActionErrorLog: (params: GetActionErrorLogByIdParams) => Promise<import("../types").IExecutionErrorsResult>;
    getActionErrorLogWithAuth: (params: GetActionErrorLogByIdParams) => Promise<import("../types").IExecutionErrorsResult>;
    getHistory: (params: GetRuleHistoryParams) => Promise<import("./types").GetRuleHistoryResult>;
    bulkGetRules: <Params extends RuleTypeParams = never>(params: BulkGetRulesParams) => Promise<import("../application/rule/methods/bulk_get/types").BulkGetRulesResponse<Params>>;
    bulkCreateRules: <Params extends RuleTypeParams = never>(params: BulkCreateRulesParams<Params>) => Promise<import("../application/rule/methods/bulk_create").BulkCreateRulesResult>;
    bulkDeleteRules: (options: BulkDeleteRulesParams) => Promise<import("../application/rule/methods/bulk_delete").BulkDeleteRulesResult<Record<string, any>>>;
    bulkEdit: <Params extends RuleTypeParams>(options: BulkEditOptions<Params>) => Promise<import("./common/bulk_edit/types").BulkEditResult<Params>>;
    bulkEditRuleParamsWithReadAuth: <Params extends RuleTypeParams>(options: BulkEditRuleParamsOptions<Params>) => Promise<import("./common/bulk_edit/types").BulkEditResult<Params>>;
    bulkEnableRules: (params: BulkEnableRulesParams) => Promise<import("../application/rule/methods/bulk_enable").BulkEnableRulesResult<Record<string, any>>>;
    bulkDisableRules: (options: BulkDisableRulesRequestBody) => Promise<import("../application/rule/methods/bulk_disable").BulkDisableRulesResult<Record<string, any>>>;
    updateRuleApiKey: (params: {
        id: string;
    }) => Promise<void>;
    disableRule: (params: DisableRuleParams) => Promise<void>;
    enableRule: (params: EnableRuleParams) => Promise<void>;
    snooze: (options: SnoozeRuleOptions) => Promise<import("@kbn/alerting-types/rule_types").SanitizedRule<never>>;
    unsnooze: (options: UnsnoozeParams) => Promise<void>;
    muteAll: (options: {
        id: string;
    }) => Promise<void>;
    unmuteAll: (options: {
        id: string;
    }) => Promise<void>;
    muteInstance: (options: {
        params: MuteAlertParams;
        query: MuteAlertQuery;
    }) => Promise<void>;
    bulkMuteInstances: (options: BulkMuteUnmuteAlertsParams) => Promise<void>;
    bulkUnmuteInstances: (options: BulkMuteUnmuteAlertsParams) => Promise<void>;
    unmuteInstance: (options: UnmuteAlertParams) => Promise<void>;
    bulkUntrackAlerts: (options: BulkUntrackBody) => Promise<void>;
    runSoon: (options: RunSoonParams) => Promise<string | undefined>;
    listRuleTypes: () => Promise<import("../authorization").RegistryAlertTypeWithAuth[]>;
    scheduleBackfill: (params: ScheduleBackfillParams) => Promise<(Readonly<{
        end?: string | undefined;
        initiatorId?: string | undefined;
        warnings?: string[] | undefined;
    } & {
        id: string;
        start: string;
        status: "error" | "pending" | "running" | "complete" | "timeout";
        duration: string;
        schedule: Readonly<{} & {
            status: "error" | "pending" | "running" | "complete" | "timeout";
            interval: string;
            runAt: string;
        }>[];
        enabled: boolean;
        createdAt: string;
        rule: Readonly<{
            apiKeyCreatedByUser?: boolean | null | undefined;
        } & {
            id: string;
            name: string;
            schedule: Readonly<{} & {
                interval: string;
            }>;
            params: Record<string, any>;
            enabled: boolean;
            tags: string[];
            createdBy: string | null;
            createdAt: string;
            updatedBy: string | null;
            updatedAt: string;
            consumer: string;
            actions: Readonly<{
                uuid?: string | undefined;
                frequency?: Readonly<{} & {
                    summary: boolean;
                    throttle: string | null;
                    notifyWhen: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval";
                }> | undefined;
                alertsFilter?: Readonly<{
                    query?: Readonly<{
                        dsl?: string | undefined;
                    } & {
                        kql: string;
                        filters: Readonly<{
                            query?: Record<string, any> | undefined;
                            $state?: Readonly<{} & {
                                store: import("@kbn/es-query-constants").FilterStateStore;
                            }> | undefined;
                        } & {
                            meta: Record<string, any>;
                        }>[];
                    }> | undefined;
                    timeframe?: Readonly<{} & {
                        timezone: string;
                        days: (2 | 4 | 1 | 6 | 5 | 3 | 7)[];
                        hours: Readonly<{} & {
                            end: string;
                            start: string;
                        }>;
                    }> | undefined;
                } & {}> | undefined;
                useAlertDataForTemplate?: boolean | undefined;
            } & {
                id: string;
                group: string;
                params: Record<string, any>;
                actionTypeId: string;
            }>[];
            alertTypeId: string;
            apiKeyOwner: string | null;
            revision: number;
        }>;
        spaceId: string;
        initiator: "user" | "system";
    }> | Readonly<{} & {
        error: Readonly<{
            status?: number | undefined;
        } & {
            message: string;
            rule: Readonly<{
                name?: string | undefined;
            } & {
                id: string;
            }>;
        }>;
    }>)[]>;
    getBackfill: (id: string) => Promise<Readonly<{
        end?: string | undefined;
        initiatorId?: string | undefined;
        warnings?: string[] | undefined;
    } & {
        id: string;
        start: string;
        status: "error" | "pending" | "running" | "complete" | "timeout";
        duration: string;
        schedule: Readonly<{} & {
            status: "error" | "pending" | "running" | "complete" | "timeout";
            interval: string;
            runAt: string;
        }>[];
        enabled: boolean;
        createdAt: string;
        rule: Readonly<{
            apiKeyCreatedByUser?: boolean | null | undefined;
        } & {
            id: string;
            name: string;
            schedule: Readonly<{} & {
                interval: string;
            }>;
            params: Record<string, any>;
            enabled: boolean;
            tags: string[];
            createdBy: string | null;
            createdAt: string;
            updatedBy: string | null;
            updatedAt: string;
            consumer: string;
            actions: Readonly<{
                uuid?: string | undefined;
                frequency?: Readonly<{} & {
                    summary: boolean;
                    throttle: string | null;
                    notifyWhen: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval";
                }> | undefined;
                alertsFilter?: Readonly<{
                    query?: Readonly<{
                        dsl?: string | undefined;
                    } & {
                        kql: string;
                        filters: Readonly<{
                            query?: Record<string, any> | undefined;
                            $state?: Readonly<{} & {
                                store: import("@kbn/es-query-constants").FilterStateStore;
                            }> | undefined;
                        } & {
                            meta: Record<string, any>;
                        }>[];
                    }> | undefined;
                    timeframe?: Readonly<{} & {
                        timezone: string;
                        days: (2 | 4 | 1 | 6 | 5 | 3 | 7)[];
                        hours: Readonly<{} & {
                            end: string;
                            start: string;
                        }>;
                    }> | undefined;
                } & {}> | undefined;
                useAlertDataForTemplate?: boolean | undefined;
            } & {
                id: string;
                group: string;
                params: Record<string, any>;
                actionTypeId: string;
            }>[];
            alertTypeId: string;
            apiKeyOwner: string | null;
            revision: number;
        }>;
        spaceId: string;
        initiator: "user" | "system";
    }>>;
    findBackfill: (params: FindBackfillParams) => Promise<Readonly<{} & {
        data: Readonly<{
            end?: string | undefined;
            initiatorId?: string | undefined;
            warnings?: string[] | undefined;
        } & {
            id: string;
            start: string;
            status: "error" | "pending" | "running" | "complete" | "timeout";
            duration: string;
            schedule: Readonly<{} & {
                status: "error" | "pending" | "running" | "complete" | "timeout";
                interval: string;
                runAt: string;
            }>[];
            enabled: boolean;
            createdAt: string;
            rule: Readonly<{
                apiKeyCreatedByUser?: boolean | null | undefined;
            } & {
                id: string;
                name: string;
                schedule: Readonly<{} & {
                    interval: string;
                }>;
                params: Record<string, any>;
                enabled: boolean;
                tags: string[];
                createdBy: string | null;
                createdAt: string;
                updatedBy: string | null;
                updatedAt: string;
                consumer: string;
                actions: Readonly<{
                    uuid?: string | undefined;
                    frequency?: Readonly<{} & {
                        summary: boolean;
                        throttle: string | null;
                        notifyWhen: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval";
                    }> | undefined;
                    alertsFilter?: Readonly<{
                        query?: Readonly<{
                            dsl?: string | undefined;
                        } & {
                            kql: string;
                            filters: Readonly<{
                                query?: Record<string, any> | undefined;
                                $state?: Readonly<{} & {
                                    store: import("@kbn/es-query-constants").FilterStateStore;
                                }> | undefined;
                            } & {
                                meta: Record<string, any>;
                            }>[];
                        }> | undefined;
                        timeframe?: Readonly<{} & {
                            timezone: string;
                            days: (2 | 4 | 1 | 6 | 5 | 3 | 7)[];
                            hours: Readonly<{} & {
                                end: string;
                                start: string;
                            }>;
                        }> | undefined;
                    } & {}> | undefined;
                    useAlertDataForTemplate?: boolean | undefined;
                } & {
                    id: string;
                    group: string;
                    params: Record<string, any>;
                    actionTypeId: string;
                }>[];
                alertTypeId: string;
                apiKeyOwner: string | null;
                revision: number;
            }>;
            spaceId: string;
            initiator: "user" | "system";
        }>[];
        page: number;
        perPage: number;
        total: number;
    }>>;
    deleteBackfill: (id: string) => Promise<{}>;
    getSpaceId(): string | undefined;
    getAuthorization(): import("..").AlertingAuthorization;
    getAuditLogger(): import("@kbn/security-plugin-types-server").AuditLogger | undefined;
    getTags: (params: RuleTagsParams) => Promise<Readonly<{} & {
        data: string[];
        page: number;
        perPage: number;
        total: number;
    }>>;
    getTemplate: (params: GetRuleTemplateParams) => Promise<Readonly<{
        artifacts?: Readonly<{
            investigation_guide?: Readonly<{} & {
                blob: string;
            }> | undefined;
            dashboards?: Readonly<{} & {
                id: string;
            }>[] | undefined;
        } & {}> | undefined;
        description?: string | undefined;
        alertDelay?: Readonly<{} & {
            active: number;
        }> | undefined;
        flapping?: Readonly<{
            enabled?: boolean | undefined;
        } & {
            lookBackWindow: number;
            statusChangeThreshold: number;
        }> | null | undefined;
    } & {
        id: string;
        name: string;
        schedule: Readonly<{} & {
            interval: string;
        }>;
        params: Record<string, any>;
        tags: string[];
        ruleTypeId: string;
    }>>;
    findTemplates: (params: FindRuleTemplatesParams) => Promise<import("../application/rule_template/methods/find/find_rule_templates").FindResult>;
    getScheduleFrequency: () => Promise<Readonly<{} & {
        totalScheduledPerMinute: number;
        remainingSchedulesPerMinute: number;
    }>>;
    findGaps: (params: FindGapsParams) => Promise<{
        total: number;
        data: import("../lib/rule_gaps/gap").Gap[];
        page: number;
        perPage: number;
    }>;
    fillGapById: (params: FillGapByIdParams) => Promise<(Readonly<{
        end?: string | undefined;
        initiatorId?: string | undefined;
        warnings?: string[] | undefined;
    } & {
        id: string;
        start: string;
        status: "error" | "pending" | "running" | "complete" | "timeout";
        duration: string;
        schedule: Readonly<{} & {
            status: "error" | "pending" | "running" | "complete" | "timeout";
            interval: string;
            runAt: string;
        }>[];
        enabled: boolean;
        createdAt: string;
        rule: Readonly<{
            apiKeyCreatedByUser?: boolean | null | undefined;
        } & {
            id: string;
            name: string;
            schedule: Readonly<{} & {
                interval: string;
            }>;
            params: Record<string, any>;
            enabled: boolean;
            tags: string[];
            createdBy: string | null;
            createdAt: string;
            updatedBy: string | null;
            updatedAt: string;
            consumer: string;
            actions: Readonly<{
                uuid?: string | undefined;
                frequency?: Readonly<{} & {
                    summary: boolean;
                    throttle: string | null;
                    notifyWhen: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval";
                }> | undefined;
                alertsFilter?: Readonly<{
                    query?: Readonly<{
                        dsl?: string | undefined;
                    } & {
                        kql: string;
                        filters: Readonly<{
                            query?: Record<string, any> | undefined;
                            $state?: Readonly<{} & {
                                store: import("@kbn/es-query-constants").FilterStateStore;
                            }> | undefined;
                        } & {
                            meta: Record<string, any>;
                        }>[];
                    }> | undefined;
                    timeframe?: Readonly<{} & {
                        timezone: string;
                        days: (2 | 4 | 1 | 6 | 5 | 3 | 7)[];
                        hours: Readonly<{} & {
                            end: string;
                            start: string;
                        }>;
                    }> | undefined;
                } & {}> | undefined;
                useAlertDataForTemplate?: boolean | undefined;
            } & {
                id: string;
                group: string;
                params: Record<string, any>;
                actionTypeId: string;
            }>[];
            alertTypeId: string;
            apiKeyOwner: string | null;
            revision: number;
        }>;
        spaceId: string;
        initiator: "user" | "system";
    }> | Readonly<{} & {
        error: Readonly<{
            status?: number | undefined;
        } & {
            message: string;
            rule: Readonly<{
                name?: string | undefined;
            } & {
                id: string;
            }>;
        }>;
    }>)[]>;
    bulkFillGapsByRuleIds: (params: BulkFillGapsByRuleIdsParams, options: BulkFillGapsByRuleIdsOptions) => Promise<import("../application/gaps/methods/bulk_fill_gaps_by_rule_ids/types").BulkFillGapsByRuleIdsResult>;
    getRuleIdsWithGaps: (params: GetRuleIdsWithGapsParams) => Promise<Readonly<{
        latestGapTimestamp?: number | undefined;
    } & {
        summary: Readonly<{} & {
            totalUnfilledDurationMs: number;
            totalInProgressDurationMs: number;
            totalFilledDurationMs: number;
            totalErrorDurationMs: number;
            totalDurationMs: number;
            rulesByGapFillStatus: Readonly<{} & {
                error: number;
                filled: number;
                unfilled: number;
                inProgress: number;
            }>;
        }>;
        total: number;
        ruleIds: string[];
    }>>;
    getGapsSummaryByRuleIds: (params: GetGapsSummaryByRuleIdsParams) => Promise<Readonly<{} & {
        data: Readonly<{
            gapFillStatus?: string | undefined;
        } & {
            ruleId: string;
            totalUnfilledDurationMs: number;
            totalInProgressDurationMs: number;
            totalFilledDurationMs: number;
        }>[];
    }>>;
    getRuleTypesByQuery: (params: GetRuleTypesByQueryParams) => Promise<Readonly<{} & {
        ruleTypes: string[];
    }>>;
    createGapAutoFillScheduler: (params: CreateGapAutoFillSchedulerParams) => Promise<import("../application/gaps/auto_fill_scheduler/result/types").GapAutoFillSchedulerResponse>;
    getGapAutoFillScheduler: (params: GetGapAutoFillSchedulerParams) => Promise<import("../application/gaps/auto_fill_scheduler/result/types").GapAutoFillSchedulerResponse>;
    updateGapAutoFillScheduler: (params: UpdateGapAutoFillSchedulerParams) => Promise<import("../application/gaps/auto_fill_scheduler/result/types").GapAutoFillSchedulerResponse>;
    deleteGapAutoFillScheduler: (params: GetGapAutoFillSchedulerParams) => Promise<void>;
    findGapAutoFillSchedulerLogs: (params: FindGapAutoFillSchedulerLogsParams) => Promise<Readonly<{} & {
        data: Readonly<{
            results?: Readonly<{
                status?: string | undefined;
                error?: string | undefined;
                ruleId?: string | undefined;
                processedGaps?: number | undefined;
            } & {}>[] | undefined;
            status?: string | undefined;
            message?: string | undefined;
            timestamp?: string | undefined;
        } & {
            id: string;
        }>[];
        page: number;
        perPage: number;
        total: number;
    }>>;
    getContext(): RulesClientContext;
}
