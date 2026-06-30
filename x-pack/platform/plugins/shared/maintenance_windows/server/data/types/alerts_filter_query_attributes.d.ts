import type { FilterStateStore } from '@kbn/es-query';
export interface AlertsFilterAttributes {
    query?: Record<string, unknown>;
    meta: Record<string, unknown>;
    $state?: {
        store: FilterStateStore;
    };
}
export interface AlertsFilterQueryAttributes {
    kql: string;
    filters: AlertsFilterAttributes[];
    dsl: string;
}
