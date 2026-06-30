import type { RulesClientContext } from '../../../../rules_client';
import type { FillGapByIdParams } from './types';
export declare function fillGapById(context: RulesClientContext, params: FillGapByIdParams): Promise<(Readonly<{
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
