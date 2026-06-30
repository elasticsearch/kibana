import type { AlertsTableSortCombinations } from './types';
declare const columns: ({
    displayAsText: string;
    id: "kibana.alert.status";
    initialWidth: number;
    schema?: undefined;
    linkField?: undefined;
} | {
    displayAsText: string;
    id: "kibana.alert.rule.consumer";
    schema: string;
    initialWidth: number;
    linkField?: undefined;
} | {
    displayAsText: string;
    id: "@timestamp";
    initialWidth: number;
    schema: string;
    linkField?: undefined;
} | {
    displayAsText: string;
    id: "kibana.alert.start";
    initialWidth: number;
    schema: string;
    linkField?: undefined;
} | {
    displayAsText: string;
    id: "kibana.alert.rule.category";
    initialWidth: number;
    schema?: undefined;
    linkField?: undefined;
} | {
    displayAsText: string;
    id: "kibana.alert.rule.name";
    initialWidth: number;
    schema?: undefined;
    linkField?: undefined;
} | {
    displayAsText: string;
    id: "kibana.alert.rule.tags";
    initialWidth: number;
    schema?: undefined;
    linkField?: undefined;
} | {
    displayAsText: string;
    id: "kibana.alert.evaluation.values";
    initialWidth: number;
    schema?: undefined;
    linkField?: undefined;
} | {
    displayAsText: string;
    id: "kibana.alert.evaluation.threshold";
    initialWidth: number;
    schema?: undefined;
    linkField?: undefined;
} | {
    displayAsText: string;
    id: "kibana.alert.reason";
    linkField: string;
    initialWidth: number;
    schema?: undefined;
} | {
    displayAsText: string;
    id: "kibana.alert.workflow_tags";
    initialWidth: number;
    schema?: undefined;
    linkField?: undefined;
} | {
    displayAsText: string;
    id: "kibana.alert.maintenance_window_ids";
    schema: string;
    initialWidth: number;
    linkField?: undefined;
})[];
export { columns as defaultAlertsTableColumns };
declare const sort: AlertsTableSortCombinations[];
export { sort as defaultAlertsTableSort };
