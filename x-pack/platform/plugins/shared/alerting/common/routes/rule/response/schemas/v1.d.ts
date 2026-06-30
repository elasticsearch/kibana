export declare const actionParamsSchema: import("@kbn/config-schema").Type<Record<string, any>>;
export declare const mappedParamsSchema: import("@kbn/config-schema").Type<Record<string, any>>;
export declare const notifyWhenSchema: import("@kbn/config-schema").Type<"onActionGroupChange" | "onActiveAlert" | "onThrottleInterval">;
export declare const ruleExecutionStatusSchema: import("@kbn/config-schema").ObjectType<{
    status: import("@kbn/config-schema").Type<"warning" | "error" | "pending" | "unknown" | "active" | "ok">;
    last_execution_date: import("@kbn/config-schema").Type<string>;
    last_duration: import("@kbn/config-schema").Type<number | undefined>;
    error: import("@kbn/config-schema").Type<Readonly<{} & {
        message: string;
        reason: "disabled" | "execute" | "validate" | "unknown" | "timeout" | "license" | "read" | "decrypt";
    }> | undefined>;
    warning: import("@kbn/config-schema").Type<Readonly<{} & {
        message: string;
        reason: "maxExecutableActions" | "maxAlerts" | "maxQueuedActions" | "ruleExecution";
    }> | undefined>;
}>;
export declare const outcome: import("@kbn/config-schema").Type<"warning" | "failed" | "succeeded">;
export declare const ruleLastRunSchema: import("@kbn/config-schema").ObjectType<{
    outcome: import("@kbn/config-schema").Type<"warning" | "failed" | "succeeded">;
    outcome_order: import("@kbn/config-schema").Type<number | undefined>;
    warning: import("@kbn/config-schema").Type<"disabled" | "execute" | "validate" | "unknown" | "timeout" | "license" | "read" | "decrypt" | "maxExecutableActions" | "maxAlerts" | "maxQueuedActions" | "ruleExecution" | null | undefined>;
    outcome_msg: import("@kbn/config-schema").Type<string[] | null | undefined>;
    alerts_count: import("@kbn/config-schema").ObjectType<{
        active: import("@kbn/config-schema").Type<number | null | undefined>;
        new: import("@kbn/config-schema").Type<number | null | undefined>;
        recovered: import("@kbn/config-schema").Type<number | null | undefined>;
        ignored: import("@kbn/config-schema").Type<number | null | undefined>;
    }>;
}>;
export declare const monitoringSchema: import("@kbn/config-schema").ObjectType<{
    run: import("@kbn/config-schema").ObjectType<{
        history: import("@kbn/config-schema").Type<Readonly<{
            duration?: number | undefined;
            outcome?: "warning" | "failed" | "succeeded" | undefined;
        } & {
            success: boolean;
            timestamp: number;
        }>[]>;
        calculated_metrics: import("@kbn/config-schema").ObjectType<{
            p50: import("@kbn/config-schema").Type<number | undefined>;
            p95: import("@kbn/config-schema").Type<number | undefined>;
            p99: import("@kbn/config-schema").Type<number | undefined>;
            success_ratio: import("@kbn/config-schema").Type<number>;
        }>;
        last_run: import("@kbn/config-schema").ObjectType<{
            timestamp: import("@kbn/config-schema").Type<string>;
            metrics: import("@kbn/config-schema").ObjectType<{
                duration: import("@kbn/config-schema").Type<number | undefined>;
                total_search_duration_ms: import("@kbn/config-schema").Type<number | null | undefined>;
                total_indexing_duration_ms: import("@kbn/config-schema").Type<number | null | undefined>;
                total_alerts_detected: import("@kbn/config-schema").Type<number | null | undefined>;
                total_alerts_created: import("@kbn/config-schema").Type<number | null | undefined>;
                gap_duration_s: import("@kbn/config-schema").Type<number | null | undefined>;
                gap_range: import("@kbn/config-schema").Type<Readonly<{} & {
                    gte: string;
                    lte: string;
                }> | null | undefined>;
            }>;
        }>;
    }>;
}>;
export declare const ruleSnoozeScheduleSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string | undefined>;
    duration: import("@kbn/config-schema").Type<number>;
    rRule: import("@kbn/config-schema").ObjectType<{
        dtstart: import("@kbn/config-schema").Type<string>;
        tzid: import("@kbn/config-schema").Type<string>;
        freq: import("@kbn/config-schema").Type<0 | 2 | 4 | 1 | 6 | 5 | 3 | undefined>;
        until: import("@kbn/config-schema").Type<string | undefined>;
        count: import("@kbn/config-schema").Type<number | undefined>;
        interval: import("@kbn/config-schema").Type<number | undefined>;
        wkst: import("@kbn/config-schema").Type<"MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU" | undefined>;
        byweekday: import("@kbn/config-schema").Type<(string | number)[] | null | undefined>;
        bymonth: import("@kbn/config-schema").Type<number[] | null | undefined>;
        bysetpos: import("@kbn/config-schema").Type<number[] | null | undefined>;
        bymonthday: import("@kbn/config-schema").Type<number[] | null | undefined>;
        byyearday: import("@kbn/config-schema").Type<number[] | null | undefined>;
        byweekno: import("@kbn/config-schema").Type<number[] | null | undefined>;
        byhour: import("@kbn/config-schema").Type<number[] | null | undefined>;
        byminute: import("@kbn/config-schema").Type<number[] | null | undefined>;
        bysecond: import("@kbn/config-schema").Type<number[] | null | undefined>;
    }>;
    skipRecurrences: import("@kbn/config-schema").Type<string[] | undefined>;
}>;
export declare const alertDelaySchema: import("@kbn/config-schema").ObjectType<{
    active: import("@kbn/config-schema").Type<number>;
}>;
export declare const dashboardsSchema: import("@kbn/config-schema").Type<Readonly<{} & {
    id: string;
}>[]>;
export declare const investigationGuideSchema: import("@kbn/config-schema").ObjectType<{
    blob: import("@kbn/config-schema").Type<string>;
}>;
export declare const artifactsSchema: import("@kbn/config-schema").ObjectType<{
    dashboards: import("@kbn/config-schema").Type<Readonly<{} & {
        id: string;
    }>[] | undefined>;
    investigation_guide: import("@kbn/config-schema").Type<Readonly<{} & {
        blob: string;
    }> | undefined>;
}>;
/**
 * This is a public schema that is used to generate the OpenAPI schema for all of our public APIs that return a rule response.
 */
export declare const ruleResponseSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    name: import("@kbn/config-schema").Type<string>;
    tags: import("@kbn/config-schema").Type<string[]>;
    rule_type_id: import("@kbn/config-schema").Type<string>;
    consumer: import("@kbn/config-schema").Type<string>;
    schedule: import("@kbn/config-schema").ObjectType<{
        interval: import("@kbn/config-schema").Type<string>;
    }>;
    actions: import("@kbn/config-schema").Type<Readonly<{
        group?: string | undefined;
        uuid?: string | undefined;
        frequency?: Readonly<{} & {
            summary: boolean;
            throttle: string | null;
            notify_when: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval";
        }> | undefined;
        alerts_filter?: Readonly<{
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
        use_alert_data_for_template?: boolean | undefined;
    } & {
        id: string;
        params: Record<string, any>;
        connector_type_id: string;
    }>[]>;
    params: import("@kbn/config-schema").Type<Record<string, any>>;
    mapped_params: import("@kbn/config-schema").Type<Record<string, any> | undefined>;
    scheduled_task_id: import("@kbn/config-schema").Type<string | undefined>;
    created_by: import("@kbn/config-schema").Type<string | null>;
    updated_by: import("@kbn/config-schema").Type<string | null>;
    created_at: import("@kbn/config-schema").Type<string>;
    updated_at: import("@kbn/config-schema").Type<string>;
    api_key_owner: import("@kbn/config-schema").Type<string | null>;
    api_key_created_by_user: import("@kbn/config-schema").Type<boolean | null | undefined>;
    throttle: import("@kbn/config-schema").Type<string | null | undefined>;
    mute_all: import("@kbn/config-schema").Type<boolean>;
    notify_when: import("@kbn/config-schema").Type<"onActionGroupChange" | "onActiveAlert" | "onThrottleInterval" | null | undefined>;
    muted_alert_ids: import("@kbn/config-schema").Type<string[]>;
    execution_status: import("@kbn/config-schema").ObjectType<{
        status: import("@kbn/config-schema").Type<"warning" | "error" | "pending" | "unknown" | "active" | "ok">;
        last_execution_date: import("@kbn/config-schema").Type<string>;
        last_duration: import("@kbn/config-schema").Type<number | undefined>;
        error: import("@kbn/config-schema").Type<Readonly<{} & {
            message: string;
            reason: "disabled" | "execute" | "validate" | "unknown" | "timeout" | "license" | "read" | "decrypt";
        }> | undefined>;
        warning: import("@kbn/config-schema").Type<Readonly<{} & {
            message: string;
            reason: "maxExecutableActions" | "maxAlerts" | "maxQueuedActions" | "ruleExecution";
        }> | undefined>;
    }>;
    last_run: import("@kbn/config-schema").Type<Readonly<{
        warning?: "disabled" | "execute" | "validate" | "unknown" | "timeout" | "license" | "read" | "decrypt" | "maxExecutableActions" | "maxAlerts" | "maxQueuedActions" | "ruleExecution" | null | undefined;
        outcome_msg?: string[] | null | undefined;
        outcome_order?: number | undefined;
    } & {
        outcome: "warning" | "failed" | "succeeded";
        alerts_count: Readonly<{
            active?: number | null | undefined;
            recovered?: number | null | undefined;
            new?: number | null | undefined;
            ignored?: number | null | undefined;
        } & {}>;
    }> | null | undefined>;
    next_run: import("@kbn/config-schema").Type<string | null | undefined>;
    revision: import("@kbn/config-schema").Type<number>;
    running: import("@kbn/config-schema").Type<boolean | null | undefined>;
    alert_delay: import("@kbn/config-schema").Type<Readonly<{} & {
        active: number;
    }> | undefined>;
    flapping: import("@kbn/config-schema").Type<Readonly<{
        enabled?: boolean | undefined;
    } & {
        look_back_window: number;
        status_change_threshold: number;
    }> | null | undefined>;
    artifacts: import("@kbn/config-schema").Type<Readonly<{
        investigation_guide?: Readonly<{} & {
            blob: string;
        }> | undefined;
        dashboards?: Readonly<{} & {
            id: string;
        }>[] | undefined;
    } & {}> | undefined>;
}>;
/**
 * This is an internal schema that is used for all of our internal APIs that return a rule response.
 */
export declare const ruleResponseInternalSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    name: import("@kbn/config-schema").Type<string>;
    tags: import("@kbn/config-schema").Type<string[]>;
    rule_type_id: import("@kbn/config-schema").Type<string>;
    consumer: import("@kbn/config-schema").Type<string>;
    schedule: import("@kbn/config-schema").ObjectType<{
        interval: import("@kbn/config-schema").Type<string>;
    }>;
    actions: import("@kbn/config-schema").Type<Readonly<{
        group?: string | undefined;
        uuid?: string | undefined;
        frequency?: Readonly<{} & {
            summary: boolean;
            throttle: string | null;
            notify_when: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval";
        }> | undefined;
        alerts_filter?: Readonly<{
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
        use_alert_data_for_template?: boolean | undefined;
    } & {
        id: string;
        params: Record<string, any>;
        connector_type_id: string;
    }>[]>;
    params: import("@kbn/config-schema").Type<Record<string, any>>;
    mapped_params: import("@kbn/config-schema").Type<Record<string, any> | undefined>;
    scheduled_task_id: import("@kbn/config-schema").Type<string | undefined>;
    created_by: import("@kbn/config-schema").Type<string | null>;
    updated_by: import("@kbn/config-schema").Type<string | null>;
    created_at: import("@kbn/config-schema").Type<string>;
    updated_at: import("@kbn/config-schema").Type<string>;
    api_key_owner: import("@kbn/config-schema").Type<string | null>;
    api_key_created_by_user: import("@kbn/config-schema").Type<boolean | null | undefined>;
    throttle: import("@kbn/config-schema").Type<string | null | undefined>;
    mute_all: import("@kbn/config-schema").Type<boolean>;
    notify_when: import("@kbn/config-schema").Type<"onActionGroupChange" | "onActiveAlert" | "onThrottleInterval" | null | undefined>;
    muted_alert_ids: import("@kbn/config-schema").Type<string[]>;
    execution_status: import("@kbn/config-schema").ObjectType<{
        status: import("@kbn/config-schema").Type<"warning" | "error" | "pending" | "unknown" | "active" | "ok">;
        last_execution_date: import("@kbn/config-schema").Type<string>;
        last_duration: import("@kbn/config-schema").Type<number | undefined>;
        error: import("@kbn/config-schema").Type<Readonly<{} & {
            message: string;
            reason: "disabled" | "execute" | "validate" | "unknown" | "timeout" | "license" | "read" | "decrypt";
        }> | undefined>;
        warning: import("@kbn/config-schema").Type<Readonly<{} & {
            message: string;
            reason: "maxExecutableActions" | "maxAlerts" | "maxQueuedActions" | "ruleExecution";
        }> | undefined>;
    }>;
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
    snooze_schedule: import("@kbn/config-schema").Type<Readonly<{
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
    active_snoozes: import("@kbn/config-schema").Type<string[] | undefined>;
    is_snoozed_until: import("@kbn/config-schema").Type<string | null | undefined>;
    last_run: import("@kbn/config-schema").Type<Readonly<{
        warning?: "disabled" | "execute" | "validate" | "unknown" | "timeout" | "license" | "read" | "decrypt" | "maxExecutableActions" | "maxAlerts" | "maxQueuedActions" | "ruleExecution" | null | undefined;
        outcome_msg?: string[] | null | undefined;
        outcome_order?: number | undefined;
    } & {
        outcome: "warning" | "failed" | "succeeded";
        alerts_count: Readonly<{
            active?: number | null | undefined;
            recovered?: number | null | undefined;
            new?: number | null | undefined;
            ignored?: number | null | undefined;
        } & {}>;
    }> | null | undefined>;
    next_run: import("@kbn/config-schema").Type<string | null | undefined>;
    revision: import("@kbn/config-schema").Type<number>;
    running: import("@kbn/config-schema").Type<boolean | null | undefined>;
    view_in_app_relative_url: import("@kbn/config-schema").Type<string | null | undefined>;
    alert_delay: import("@kbn/config-schema").Type<Readonly<{} & {
        active: number;
    }> | undefined>;
    flapping: import("@kbn/config-schema").Type<Readonly<{
        enabled?: boolean | undefined;
    } & {
        look_back_window: number;
        status_change_threshold: number;
    }> | null | undefined>;
    artifacts: import("@kbn/config-schema").Type<Readonly<{
        investigation_guide?: Readonly<{} & {
            blob: string;
        }> | undefined;
        dashboards?: Readonly<{} & {
            id: string;
        }>[] | undefined;
    } & {}> | undefined>;
}>;
export declare const scheduleIdsSchema: import("@kbn/config-schema").Type<string[] | undefined>;
