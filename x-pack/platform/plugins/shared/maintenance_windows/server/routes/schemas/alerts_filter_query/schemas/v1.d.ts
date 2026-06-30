import { FilterStateStore } from '@kbn/es-query';
export declare const alertsFilterQuerySchema: import("@kbn/config-schema").ObjectType<{
    kql: import("@kbn/config-schema").Type<string>;
    filters: import("@kbn/config-schema").Type<Readonly<{
        query?: Record<string, any> | undefined;
        $state?: Readonly<{} & {
            store: FilterStateStore;
        }> | undefined;
    } & {
        meta: Record<string, any>;
    }>[]>;
    dsl: import("@kbn/config-schema").Type<string | undefined>;
}>;
