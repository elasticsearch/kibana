import { FilterStateStore } from '@kbn/es-query';
export declare const actionsSchema: import("@kbn/config-schema").Type<Readonly<{
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
                    store: FilterStateStore;
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
export declare const systemActionsSchema: import("@kbn/config-schema").Type<Readonly<{
    uuid?: string | undefined;
} & {
    id: string;
    params: Record<string, any>;
}>[] | undefined>;
