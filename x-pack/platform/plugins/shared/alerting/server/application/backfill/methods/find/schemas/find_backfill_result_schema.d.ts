export declare const findBackfillResultSchema: import("@kbn/config-schema").ObjectType<{
    page: import("@kbn/config-schema").Type<number>;
    perPage: import("@kbn/config-schema").Type<number>;
    total: import("@kbn/config-schema").Type<number>;
    data: import("@kbn/config-schema").Type<Readonly<{
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
    }>[]>;
}>;
