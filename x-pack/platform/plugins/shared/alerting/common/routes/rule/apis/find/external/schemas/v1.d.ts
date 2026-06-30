export declare const findRuleParamsExamples: () => string;
export declare const findRulesRequestQuerySchema: import("@kbn/config-schema").ObjectType<{
    per_page: import("@kbn/config-schema").Type<number>;
    page: import("@kbn/config-schema").Type<number>;
    search: import("@kbn/config-schema").Type<string | undefined>;
    default_search_operator: import("@kbn/config-schema").Type<"AND" | "OR">;
    search_fields: import("@kbn/config-schema").Type<string | string[] | undefined>;
    sort_field: import("@kbn/config-schema").Type<string | undefined>;
    sort_order: import("@kbn/config-schema").Type<"desc" | "asc" | undefined>;
    has_reference: import("@kbn/config-schema").Type<Readonly<{} & {
        type: string;
        id: string;
    }> | null | undefined>;
    fields: import("@kbn/config-schema").Type<string | string[] | undefined>;
    filter: import("@kbn/config-schema").Type<string | undefined>;
    filter_consumers: import("@kbn/config-schema").Type<string[] | undefined>;
}>;
export declare const findRulesResponseSchema: import("@kbn/config-schema").ObjectType<{
    page: import("@kbn/config-schema").Type<number>;
    per_page: import("@kbn/config-schema").Type<number>;
    total: import("@kbn/config-schema").Type<number>;
    data: import("@kbn/config-schema").Type<Readonly<{
        artifacts?: Readonly<{
            investigation_guide?: Readonly<{} & {
                blob: string;
            }> | undefined;
            dashboards?: Readonly<{} & {
                id: string;
            }>[] | undefined;
        } & {}> | undefined;
        throttle?: string | null | undefined;
        running?: boolean | null | undefined;
        mapped_params?: Record<string, any> | undefined;
        flapping?: Readonly<{
            enabled?: boolean | undefined;
        } & {
            look_back_window: number;
            status_change_threshold: number;
        }> | null | undefined;
        last_run?: Readonly<{
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
        }> | null | undefined;
        notify_when?: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval" | null | undefined;
        next_run?: string | null | undefined;
        scheduled_task_id?: string | undefined;
        api_key_created_by_user?: boolean | null | undefined;
        alert_delay?: Readonly<{} & {
            active: number;
        }> | undefined;
    } & {
        id: string;
        name: string;
        schedule: Readonly<{} & {
            interval: string;
        }>;
        params: Record<string, any>;
        enabled: boolean;
        tags: string[];
        consumer: string;
        created_at: string;
        updated_at: string;
        created_by: string | null;
        updated_by: string | null;
        actions: Readonly<{
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
        }>[];
        revision: number;
        execution_status: Readonly<{
            warning?: Readonly<{} & {
                message: string;
                reason: "maxExecutableActions" | "maxAlerts" | "maxQueuedActions" | "ruleExecution";
            }> | undefined;
            error?: Readonly<{} & {
                message: string;
                reason: "disabled" | "execute" | "validate" | "unknown" | "timeout" | "license" | "read" | "decrypt";
            }> | undefined;
            last_duration?: number | undefined;
        } & {
            status: "warning" | "error" | "pending" | "unknown" | "active" | "ok";
            last_execution_date: string;
        }>;
        api_key_owner: string | null;
        mute_all: boolean;
        rule_type_id: string;
        muted_alert_ids: string[];
    }>[]>;
}>;
