export declare const scheduleIdsSchema: import("@kbn/config-schema").Type<string[] | undefined>;
export declare const bulkEditRuleSnoozeScheduleSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string | undefined>;
    duration: import("@kbn/config-schema").Type<number>;
    rRule: import("@kbn/config-schema").ObjectType<{
        dtstart: import("@kbn/config-schema").Type<string>;
        tzid: import("@kbn/config-schema").Type<string>;
        freq: import("@kbn/config-schema").Type<0 | 2 | 4 | 1 | 3 | undefined>;
        interval: import("@kbn/config-schema").Type<number | undefined>;
        until: import("@kbn/config-schema").Type<string | undefined>;
        count: import("@kbn/config-schema").Type<number | undefined>;
        byweekday: import("@kbn/config-schema").Type<string[] | undefined>;
        bymonthday: import("@kbn/config-schema").Type<number[] | undefined>;
        bymonth: import("@kbn/config-schema").Type<number[] | undefined>;
    }>;
}>;
export declare const bulkEditOperationSchema: import("@kbn/config-schema").Type<Readonly<{} & {
    value: string[];
    field: "tags";
    operation: "set" | "add" | "delete";
}> | Readonly<{} & {
    value: (Readonly<{
        uuid?: string | undefined;
        actionTypeId?: string | undefined;
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
    }> | Readonly<{
        uuid?: string | undefined;
        actionTypeId?: string | undefined;
    } & {
        id: string;
        params: Record<string, any>;
    }>)[];
    field: "actions";
    operation: "set" | "add";
}> | Readonly<{} & {
    value: Readonly<{} & {
        interval: string;
    }>;
    field: "schedule";
    operation: "set";
}> | Readonly<{} & {
    value: string | null;
    field: "throttle";
    operation: "set";
}> | Readonly<{} & {
    value: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval";
    field: "notifyWhen";
    operation: "set";
}> | Readonly<{} & {
    value: Readonly<{
        id?: string | undefined;
    } & {
        duration: number;
        rRule: Readonly<{
            count?: number | undefined;
            interval?: number | undefined;
            freq?: 0 | 2 | 4 | 1 | 3 | undefined;
            byweekday?: string[] | undefined;
            bymonthday?: number[] | undefined;
            until?: string | undefined;
            bymonth?: number[] | undefined;
        } & {
            tzid: string;
            dtstart: string;
        }>;
    }>;
    field: "snoozeSchedule";
    operation: "set";
}> | Readonly<{
    value?: string[] | undefined;
} & {
    field: "snoozeSchedule";
    operation: "delete";
}> | Readonly<{} & {
    field: "apiKey";
    operation: "set";
}>>;
export declare const bulkEditOperationsSchema: import("@kbn/config-schema").Type<(Readonly<{} & {
    value: string[];
    field: "tags";
    operation: "set" | "add" | "delete";
}> | Readonly<{} & {
    value: (Readonly<{
        uuid?: string | undefined;
        actionTypeId?: string | undefined;
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
    }> | Readonly<{
        uuid?: string | undefined;
        actionTypeId?: string | undefined;
    } & {
        id: string;
        params: Record<string, any>;
    }>)[];
    field: "actions";
    operation: "set" | "add";
}> | Readonly<{} & {
    value: Readonly<{} & {
        interval: string;
    }>;
    field: "schedule";
    operation: "set";
}> | Readonly<{} & {
    value: string | null;
    field: "throttle";
    operation: "set";
}> | Readonly<{} & {
    value: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval";
    field: "notifyWhen";
    operation: "set";
}> | Readonly<{} & {
    value: Readonly<{
        id?: string | undefined;
    } & {
        duration: number;
        rRule: Readonly<{
            count?: number | undefined;
            interval?: number | undefined;
            freq?: 0 | 2 | 4 | 1 | 3 | undefined;
            byweekday?: string[] | undefined;
            bymonthday?: number[] | undefined;
            until?: string | undefined;
            bymonth?: number[] | undefined;
        } & {
            tzid: string;
            dtstart: string;
        }>;
    }>;
    field: "snoozeSchedule";
    operation: "set";
}> | Readonly<{
    value?: string[] | undefined;
} & {
    field: "snoozeSchedule";
    operation: "delete";
}> | Readonly<{} & {
    field: "apiKey";
    operation: "set";
}>)[]>;
