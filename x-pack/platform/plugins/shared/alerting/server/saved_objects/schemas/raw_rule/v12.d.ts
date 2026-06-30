export declare const rawRuleSnoozedInstanceSchema: import("@kbn/config-schema").ObjectType<{
    instanceId: import("@kbn/config-schema").Type<string>;
    expiresAt: import("@kbn/config-schema").Type<string | undefined>;
    conditions: import("@kbn/config-schema").Type<(Readonly<{} & {
        type: "field_change";
        field: string;
    }> | Readonly<{} & {
        type: "severity_change";
    }> | Readonly<{} & {
        type: "severity_equals";
        value: "high" | "low" | "info" | "medium" | "critical";
    }>)[] | undefined>;
    conditionOperator: import("@kbn/config-schema").Type<"all" | "any" | undefined>;
    snoozeSnapshot: import("@kbn/config-schema").Type<Record<string, any> | undefined>;
    snoozedAt: import("@kbn/config-schema").Type<string>;
    snoozedBy: import("@kbn/config-schema").Type<string>;
}>;
export declare const rawRuleSchema: import("@kbn/config-schema").ObjectType<Omit<Omit<Omit<Omit<Omit<Omit<Omit<Omit<{
    name: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    consumer: import("@kbn/config-schema").Type<string>;
    tags: import("@kbn/config-schema").Type<string[]>;
    alertTypeId: import("@kbn/config-schema").Type<string>;
    apiKeyOwner: import("@kbn/config-schema").Type<string | null>;
    apiKey: import("@kbn/config-schema").Type<string | null>;
    apiKeyCreatedByUser: import("@kbn/config-schema").Type<boolean | null | undefined>;
    createdBy: import("@kbn/config-schema").Type<string | null>;
    updatedBy: import("@kbn/config-schema").Type<string | null>;
    updatedAt: import("@kbn/config-schema").Type<string>;
    createdAt: import("@kbn/config-schema").Type<string>;
    muteAll: import("@kbn/config-schema").Type<boolean>;
    mutedInstanceIds: import("@kbn/config-schema").Type<string[]>;
    throttle: import("@kbn/config-schema").Type<string | null | undefined>;
    revision: import("@kbn/config-schema").Type<number>;
    running: import("@kbn/config-schema").Type<boolean | null | undefined>;
    schedule: import("@kbn/config-schema").ObjectType<{
        interval: import("@kbn/config-schema").Type<string>;
    }>;
    legacyId: import("@kbn/config-schema").Type<string | null>;
    scheduledTaskId: import("@kbn/config-schema").Type<string | null | undefined>;
    isSnoozedUntil: import("@kbn/config-schema").Type<string | null | undefined>;
    snoozeSchedule: import("@kbn/config-schema").Type<Readonly<{
        id?: string | undefined;
        skipRecurrences?: string[] | undefined;
    } & {
        duration: number;
        rRule: Readonly<{
            count?: number | undefined;
            interval?: number | undefined;
            freq?: 0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined;
            byhour?: number[] | null | undefined;
            byminute?: number[] | null | undefined;
            byweekday?: (string | number)[] | null | undefined;
            bymonthday?: number[] | null | undefined;
            until?: string | undefined;
            wkst?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined;
            bymonth?: number[] | null | undefined;
            bysetpos?: number[] | null | undefined;
            byyearday?: number[] | null | undefined;
            byweekno?: number[] | null | undefined;
            bysecond?: number[] | null | undefined;
        } & {
            tzid: string;
            dtstart: string;
        }>;
    }>[] | undefined>;
    meta: import("@kbn/config-schema").Type<Readonly<{
        versionApiKeyLastmodified?: string | undefined;
    } & {}> | undefined>;
    actions: import("@kbn/config-schema").Type<Readonly<{
        group?: string | undefined;
        frequency?: Readonly<{} & {
            summary: boolean;
            throttle: string | null;
            notifyWhen: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval";
        }> | undefined;
        alertsFilter?: Readonly<{
            query?: Readonly<{} & {
                kql: string;
                filters: Readonly<{
                    query?: Record<string, any> | undefined;
                    $state?: Readonly<{} & {
                        store: import("@kbn/es-query-constants").FilterStateStore;
                    }> | undefined;
                } & {
                    meta: Readonly<{
                        type?: string | undefined;
                        key?: string | undefined;
                        disabled?: boolean | undefined;
                        value?: string | undefined;
                        group?: string | undefined;
                        index?: string | undefined;
                        params?: any;
                        field?: string | undefined;
                        alias?: string | null | undefined;
                        negate?: boolean | undefined;
                        controlledBy?: string | undefined;
                        isMultiIndex?: boolean | undefined;
                        relation?: "AND" | "OR" | undefined;
                    } & {}>;
                }>[];
                dsl: string;
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
        params: Record<string, any>;
        uuid: string;
        actionTypeId: string;
        actionRef: string;
    }>[]>;
    executionStatus: import("@kbn/config-schema").ObjectType<{
        status: import("@kbn/config-schema").Type<"warning" | "error" | "pending" | "unknown" | "active" | "ok">;
        lastExecutionDate: import("@kbn/config-schema").Type<string>;
        lastDuration: import("@kbn/config-schema").Type<number | undefined>;
        error: import("@kbn/config-schema").Type<Readonly<{} & {
            message: string;
            reason: import("@kbn/alerting-types").RuleExecutionStatusErrorReasons;
        }> | null>;
        warning: import("@kbn/config-schema").Type<Readonly<{} & {
            message: string;
            reason: import("@kbn/alerting-types").RuleExecutionStatusWarningReasons;
        }> | null>;
    }>;
    notifyWhen: import("@kbn/config-schema").Type<"onActionGroupChange" | "onActiveAlert" | "onThrottleInterval" | null | undefined>;
    monitoring: import("@kbn/config-schema").Type<Readonly<{} & {
        run: Readonly<{} & {
            calculated_metrics: Readonly<{
                p95?: number | undefined;
                p99?: number | undefined;
                p50?: number | undefined;
            } & {
                success_ratio: number;
            }>;
            last_run: Readonly<{} & {
                timestamp: string;
                metrics: Readonly<{
                    duration?: number | undefined;
                    total_search_duration_ms?: number | null | undefined;
                    total_indexing_duration_ms?: number | null | undefined;
                    total_alerts_detected?: number | null | undefined;
                    total_alerts_created?: number | null | undefined;
                    gap_duration_s?: number | null | undefined;
                } & {}>;
            }>;
            history: Readonly<{
                duration?: number | undefined;
                outcome?: "warning" | "failed" | "succeeded" | undefined;
            } & {
                success: boolean;
                timestamp: number;
            }>[];
        }>;
    }> | undefined>;
    lastRun: import("@kbn/config-schema").Type<Readonly<{
        warning?: import("@kbn/alerting-types").RuleExecutionStatusErrorReasons | import("@kbn/alerting-types").RuleExecutionStatusWarningReasons | null | undefined;
        outcomeOrder?: number | undefined;
        outcomeMsg?: string[] | null | undefined;
    } & {
        outcome: "warning" | "failed" | "succeeded";
        alertsCount: Readonly<{
            active?: number | null | undefined;
            recovered?: number | null | undefined;
            new?: number | null | undefined;
            ignored?: number | null | undefined;
        } & {}>;
    }> | null | undefined>;
    nextRun: import("@kbn/config-schema").Type<string | null | undefined>;
    mapped_params: import("@kbn/config-schema").Type<Readonly<{
        severity?: string | undefined;
        risk_score?: number | undefined;
    } & {}> | undefined>;
    params: import("@kbn/config-schema").Type<Record<string, any>>;
    typeVersion: import("@kbn/config-schema").Type<number | undefined>;
    alertDelay: import("@kbn/config-schema").Type<Readonly<{} & {
        active: number;
    }> | undefined>;
    flapping: import("@kbn/config-schema").Type<Readonly<{} & {
        lookBackWindow: number;
        statusChangeThreshold: number;
    }> | null | undefined>;
}, "monitoring"> & {
    monitoring: import("@kbn/config-schema").Type<Readonly<{} & {
        run: Readonly<{} & {
            calculated_metrics: Readonly<{
                p95?: number | undefined;
                p99?: number | undefined;
                p50?: number | undefined;
            } & {
                success_ratio: number;
            }>;
            last_run: Readonly<{} & {
                timestamp: string;
                metrics: Readonly<{
                    duration?: number | undefined;
                    total_search_duration_ms?: number | null | undefined;
                    total_indexing_duration_ms?: number | null | undefined;
                    total_alerts_detected?: number | null | undefined;
                    total_alerts_created?: number | null | undefined;
                    gap_duration_s?: number | null | undefined;
                    gap_range?: Readonly<{} & {
                        gte: string;
                        lte: string;
                    }> | null | undefined;
                } & {}>;
            }>;
            history: Readonly<{
                duration?: number | undefined;
                outcome?: "warning" | "failed" | "succeeded" | undefined;
            } & {
                success: boolean;
                timestamp: number;
            }>[];
        }>;
    }> | undefined>;
}, "artifacts"> & {
    artifacts: import("@kbn/config-schema").Type<Readonly<{
        dashboards?: Readonly<{} & {
            refId: string;
        }>[] | undefined;
    } & {}> | undefined>;
}, "artifacts"> & {
    artifacts: import("@kbn/config-schema").Type<Readonly<{
        investigation_guide?: Readonly<{} & {
            blob: string;
        }> | undefined;
        dashboards?: Readonly<{} & {
            refId: string;
        }>[] | undefined;
    } & {}> | undefined>;
}, "flapping"> & {
    flapping: import("@kbn/config-schema").Type<Readonly<{
        enabled?: boolean | undefined;
    } & {
        lookBackWindow: number;
        statusChangeThreshold: number;
    }> | null | undefined>;
}, "uiamApiKey"> & {
    uiamApiKey: import("@kbn/config-schema").Type<string | null | undefined>;
}, "lastEnabledAt"> & {
    lastEnabledAt: import("@kbn/config-schema").Type<string | undefined>;
}, "monitoring"> & {
    monitoring: import("@kbn/config-schema").Type<Readonly<{} & {
        run: Readonly<{} & {
            calculated_metrics: Readonly<{
                p95?: number | undefined;
                p99?: number | undefined;
                p50?: number | undefined;
            } & {
                success_ratio: number;
            }>;
            last_run: Readonly<{} & {
                timestamp: string;
                metrics: Readonly<{
                    duration?: number | undefined;
                    total_search_duration_ms?: number | null | undefined;
                    total_indexing_duration_ms?: number | null | undefined;
                    total_alerts_detected?: number | null | undefined;
                    total_alerts_created?: number | null | undefined;
                    gap_duration_s?: number | null | undefined;
                    gap_range?: Readonly<{} & {
                        gte: string;
                        lte: string;
                    }> | null | undefined;
                    gap_reason?: Readonly<{} & {
                        type: string;
                    }> | null | undefined;
                } & {}>;
            }>;
            history: Readonly<{
                duration?: number | undefined;
                outcome?: "warning" | "failed" | "succeeded" | undefined;
            } & {
                success: boolean;
                timestamp: number;
            }>[];
        }>;
    }> | undefined>;
}, "snoozedInstances"> & {
    snoozedInstances: import("@kbn/config-schema").Type<Readonly<{
        conditionOperator?: "all" | "any" | undefined;
        conditions?: (Readonly<{} & {
            type: "field_change";
            field: string;
        }> | Readonly<{} & {
            type: "severity_change";
        }> | Readonly<{} & {
            type: "severity_equals";
            value: "high" | "low" | "info" | "medium" | "critical";
        }>)[] | undefined;
        snoozeSnapshot?: Record<string, any> | undefined;
        expiresAt?: string | undefined;
    } & {
        instanceId: string;
        snoozedAt: string;
        snoozedBy: string;
    }>[] | undefined>;
}>;
