import type { SavedObjectUnsanitizedDoc } from '@kbn/core-saved-objects-server';
import type { EncryptedSavedObjectsPluginSetup } from '@kbn/encrypted-saved-objects-plugin/server';
export declare const getMigrations7140: (encryptedSavedObjects: EncryptedSavedObjectsPluginSetup) => (doc: SavedObjectUnsanitizedDoc<{
    meta?: Readonly<{
        versionApiKeyLastmodified?: string | undefined;
    } & {}> | undefined;
    artifacts?: Readonly<{
        investigation_guide?: Readonly<{} & {
            blob: string;
        }> | undefined;
        dashboards?: Readonly<{} & {
            refId: string;
        }>[] | undefined;
    } & {}> | undefined;
    throttle?: string | null | undefined;
    running?: boolean | null | undefined;
    monitoring?: Readonly<{} & {
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
    }> | undefined;
    uiamApiKey?: string | null | undefined;
    lastRun?: Readonly<{
        warning?: import("@kbn/alerting-types/rule_types").RuleExecutionStatusErrorReasons | import("@kbn/alerting-types/rule_types").RuleExecutionStatusWarningReasons | null | undefined;
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
    }> | null | undefined;
    mapped_params?: Readonly<{
        severity?: string | undefined;
        risk_score?: number | undefined;
    } & {}> | undefined;
    scheduledTaskId?: string | null | undefined;
    apiKeyCreatedByUser?: boolean | null | undefined;
    notifyWhen?: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval" | null | undefined;
    snoozeSchedule?: Readonly<{
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
    }>[] | undefined;
    isSnoozedUntil?: string | null | undefined;
    nextRun?: string | null | undefined;
    alertDelay?: Readonly<{} & {
        active: number;
    }> | undefined;
    lastEnabledAt?: string | undefined;
    flapping?: Readonly<{
        enabled?: boolean | undefined;
    } & {
        lookBackWindow: number;
        statusChangeThreshold: number;
    }> | null | undefined;
    snoozedInstances?: Readonly<{
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
    }>[] | undefined;
    typeVersion?: number | undefined;
    name: string;
    schedule: {
        interval: string;
    };
    params: {
        [x: string]: any;
    };
    enabled: boolean;
    tags: string[];
    createdBy: string | null;
    createdAt: string;
    updatedBy: string | null;
    updatedAt: string;
    consumer: string;
    apiKey: string | null;
    actions: {
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
        params: {
            [x: string]: any;
        };
        uuid: string;
        actionTypeId: string;
        actionRef: string;
    }[];
    executionStatus: {
        lastDuration?: number | undefined;
        status: "warning" | "error" | "pending" | "unknown" | "active" | "ok";
        warning: Readonly<{} & {
            message: string;
            reason: import("@kbn/alerting-types/rule_types").RuleExecutionStatusWarningReasons;
        }> | null;
        error: Readonly<{} & {
            message: string;
            reason: import("@kbn/alerting-types/rule_types").RuleExecutionStatusErrorReasons;
        }> | null;
        lastExecutionDate: string;
    };
    alertTypeId: string;
    mutedInstanceIds: string[];
    apiKeyOwner: string | null;
    muteAll: boolean;
    revision: number;
    legacyId: string | null;
}>, context: import("@kbn/core-saved-objects-server").SavedObjectMigrationContext) => SavedObjectUnsanitizedDoc<{
    meta?: Readonly<{
        versionApiKeyLastmodified?: string | undefined;
    } & {}> | undefined;
    artifacts?: Readonly<{
        investigation_guide?: Readonly<{} & {
            blob: string;
        }> | undefined;
        dashboards?: Readonly<{} & {
            refId: string;
        }>[] | undefined;
    } & {}> | undefined;
    throttle?: string | null | undefined;
    running?: boolean | null | undefined;
    monitoring?: Readonly<{} & {
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
    }> | undefined;
    uiamApiKey?: string | null | undefined;
    lastRun?: Readonly<{
        warning?: import("@kbn/alerting-types/rule_types").RuleExecutionStatusErrorReasons | import("@kbn/alerting-types/rule_types").RuleExecutionStatusWarningReasons | null | undefined;
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
    }> | null | undefined;
    mapped_params?: Readonly<{
        severity?: string | undefined;
        risk_score?: number | undefined;
    } & {}> | undefined;
    scheduledTaskId?: string | null | undefined;
    apiKeyCreatedByUser?: boolean | null | undefined;
    notifyWhen?: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval" | null | undefined;
    snoozeSchedule?: Readonly<{
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
    }>[] | undefined;
    isSnoozedUntil?: string | null | undefined;
    nextRun?: string | null | undefined;
    alertDelay?: Readonly<{} & {
        active: number;
    }> | undefined;
    lastEnabledAt?: string | undefined;
    flapping?: Readonly<{
        enabled?: boolean | undefined;
    } & {
        lookBackWindow: number;
        statusChangeThreshold: number;
    }> | null | undefined;
    snoozedInstances?: Readonly<{
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
    }>[] | undefined;
    typeVersion?: number | undefined;
    name: string;
    schedule: {
        interval: string;
    };
    params: {
        [x: string]: any;
    };
    enabled: boolean;
    tags: string[];
    createdBy: string | null;
    createdAt: string;
    updatedBy: string | null;
    updatedAt: string;
    consumer: string;
    apiKey: string | null;
    actions: {
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
        params: {
            [x: string]: any;
        };
        uuid: string;
        actionTypeId: string;
        actionRef: string;
    }[];
    executionStatus: {
        lastDuration?: number | undefined;
        status: "warning" | "error" | "pending" | "unknown" | "active" | "ok";
        warning: Readonly<{} & {
            message: string;
            reason: import("@kbn/alerting-types/rule_types").RuleExecutionStatusWarningReasons;
        }> | null;
        error: Readonly<{} & {
            message: string;
            reason: import("@kbn/alerting-types/rule_types").RuleExecutionStatusErrorReasons;
        }> | null;
        lastExecutionDate: string;
    };
    alertTypeId: string;
    mutedInstanceIds: string[];
    apiKeyOwner: string | null;
    muteAll: boolean;
    revision: number;
    legacyId: string | null;
}>;
