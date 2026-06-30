export declare const actionParamsSchema: import("@kbn/config-schema").Type<Record<string, any>>;
export declare const actionAlertsFilterTimeFrameSchema: import("@kbn/config-schema").ObjectType<{
    days: import("@kbn/config-schema").Type<(2 | 4 | 1 | 6 | 5 | 3 | 7)[]>;
    hours: import("@kbn/config-schema").ObjectType<{
        start: import("@kbn/config-schema").Type<string>;
        end: import("@kbn/config-schema").Type<string>;
    }>;
    timezone: import("@kbn/config-schema").Type<string>;
}>;
export declare const actionAlertsFilterSchema: import("@kbn/config-schema").ObjectType<{
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
export declare const actionFrequencySchema: import("@kbn/config-schema").ObjectType<{
    summary: import("@kbn/config-schema").Type<boolean>;
    notifyWhen: import("@kbn/config-schema").Type<"onActionGroupChange" | "onActiveAlert" | "onThrottleInterval">;
    throttle: import("@kbn/config-schema").Type<string | null>;
}>;
/**
 * action schema, used by internal rules clients
 */
export declare const actionSchema: import("@kbn/config-schema").ObjectType<{
    uuid: import("@kbn/config-schema").Type<string | undefined>;
    group: import("@kbn/config-schema").Type<string>;
    id: import("@kbn/config-schema").Type<string>;
    actionTypeId: import("@kbn/config-schema").Type<string>;
    params: import("@kbn/config-schema").Type<Record<string, any>>;
    frequency: import("@kbn/config-schema").Type<Readonly<{} & {
        summary: boolean;
        throttle: string | null;
        notifyWhen: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval";
    }> | undefined>;
    alertsFilter: import("@kbn/config-schema").Type<Readonly<{
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
    useAlertDataForTemplate: import("@kbn/config-schema").Type<boolean | undefined>;
}>;
export declare const systemActionSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
    actionTypeId: import("@kbn/config-schema").Type<string>;
    params: import("@kbn/config-schema").Type<Record<string, any>>;
    uuid: import("@kbn/config-schema").Type<string | undefined>;
}>;
/**
 * request action schema, actionTypeId field is optional, it really should not be required at all but
 * security solution is passing it in.
 */
export declare const actionRequestSchema: import("@kbn/config-schema").ObjectType<{
    uuid: import("@kbn/config-schema").Type<string | undefined>;
    group: import("@kbn/config-schema").Type<string>;
    id: import("@kbn/config-schema").Type<string>;
    actionTypeId: import("@kbn/config-schema").Type<string | undefined>;
    params: import("@kbn/config-schema").Type<Record<string, any>>;
    frequency: import("@kbn/config-schema").Type<Readonly<{} & {
        summary: boolean;
        throttle: string | null;
        notifyWhen: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval";
    }> | undefined>;
    alertsFilter: import("@kbn/config-schema").Type<Readonly<{
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
    useAlertDataForTemplate: import("@kbn/config-schema").Type<boolean | undefined>;
}>;
export declare const systemActionRequestSchema: import("@kbn/config-schema").ObjectType<{
    uuid: import("@kbn/config-schema").Type<string | undefined>;
    actionTypeId: import("@kbn/config-schema").Type<string | undefined>;
    id: import("@kbn/config-schema").Type<string>;
    params: import("@kbn/config-schema").Type<Record<string, any>>;
}>;
