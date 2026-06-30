import { type ObjectType } from '@kbn/config-schema';
import { createRuleParamsExamplesV1 } from '@kbn/response-ops-rule-params';
export declare const actionFrequencySchema: ObjectType<{
    summary: import("@kbn/config-schema").Type<boolean>;
    notify_when: import("@kbn/config-schema").Type<"onActionGroupChange" | "onActiveAlert" | "onThrottleInterval">;
    throttle: import("@kbn/config-schema").Type<string | null>;
}>;
export declare const actionAlertsFilterSchema: ObjectType<{
    query: import("@kbn/config-schema").Type<Readonly<{
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
    }> | undefined>;
    timeframe: import("@kbn/config-schema").Type<Readonly<{} & {
        timezone: string;
        days: (2 | 4 | 1 | 6 | 5 | 3 | 7)[];
        hours: Readonly<{} & {
            end: string;
            start: string;
        }>;
    }> | undefined>;
}>;
export declare const actionSchema: ObjectType<{
    group: import("@kbn/config-schema").Type<string | undefined>;
    id: import("@kbn/config-schema").Type<string>;
    params: import("@kbn/config-schema").Type<Record<string, any>>;
    frequency: import("@kbn/config-schema").Type<Readonly<{} & {
        summary: boolean;
        throttle: string | null;
        notify_when: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval";
    }> | undefined>;
    uuid: import("@kbn/config-schema").Type<string | undefined>;
    alerts_filter: import("@kbn/config-schema").Type<Readonly<{
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
    } & {}> | undefined>;
    use_alert_data_for_template: import("@kbn/config-schema").Type<boolean | undefined>;
}>;
export { createRuleParamsExamplesV1 };
export declare const knownCreateBodySchema: import("@kbn/config-schema").Type<Readonly<{
    [x: string]: any;
} & {}>>;
export declare const fallbackCreateBodySchema: ObjectType<{
    rule_type_id: import("@kbn/config-schema").Type<string>;
    params: import("@kbn/config-schema").Type<Record<string, any>>;
    name: import("@kbn/config-schema").Type<string>;
    enabled: import("@kbn/config-schema").Type<boolean>;
    consumer: import("@kbn/config-schema").Type<string>;
    tags: import("@kbn/config-schema").Type<string[]>;
    throttle: import("@kbn/config-schema").Type<string | null | undefined>;
    schedule: ObjectType<{
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
    }>[]>;
    notify_when: import("@kbn/config-schema").Type<"onActionGroupChange" | "onActiveAlert" | "onThrottleInterval" | null | undefined>;
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
export declare const createBodySchema: import("@kbn/config-schema").Type<Readonly<{
    [x: string]: any;
} & {}> | Readonly<{
    artifacts?: Readonly<{
        investigation_guide?: Readonly<{} & {
            blob: string;
        }> | undefined;
        dashboards?: Readonly<{} & {
            id: string;
        }>[] | undefined;
    } & {}> | undefined;
    throttle?: string | null | undefined;
    flapping?: Readonly<{
        enabled?: boolean | undefined;
    } & {
        look_back_window: number;
        status_change_threshold: number;
    }> | null | undefined;
    notify_when?: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval" | null | undefined;
    alert_delay?: Readonly<{} & {
        active: number;
    }> | undefined;
} & {
    name: string;
    schedule: Readonly<{} & {
        interval: string;
    }>;
    params: Record<string, any>;
    enabled: boolean;
    tags: string[];
    consumer: string;
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
    }>[];
    rule_type_id: string;
}>>;
export declare const createParamsSchema: ObjectType<{
    id: import("@kbn/config-schema").Type<string | undefined>;
}>;
