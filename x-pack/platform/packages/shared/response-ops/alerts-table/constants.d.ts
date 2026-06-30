import type { EuiIconType } from '@elastic/eui/src/components/icon/icon';
import { AlertConsumers } from '@kbn/rule-data-utils';
import type { AlertsTableSupportedConsumers, AlertsTableSortCombinations } from './types';
interface AlertProducerData {
    displayName: string;
    icon: EuiIconType;
    subFeatureIds?: AlertConsumers[];
}
export declare const observabilityFeatureIds: AlertConsumers[];
export declare const stackFeatureIds: AlertConsumers[];
export declare const _: AlertConsumers, observabilityApps: AlertConsumers[];
export declare const alertProducersData: Record<AlertsTableSupportedConsumers, AlertProducerData>;
export declare const defaultSortCombinations: AlertsTableSortCombinations[];
export declare const queryKeys: {
    root: string;
    alerts: () => readonly [string, "alerts"];
    cases: () => readonly [string, "cases"];
    casesBulkGet: (caseIds: string[]) => readonly [string, "cases", "bulkGet", string[]];
    maintenanceWindows: () => readonly [string, "maintenanceWindows"];
    maintenanceWindowsBulkGet: (maintenanceWindowIds: string[]) => (string | string[])[];
};
export declare const mutationKeys: {
    root: string;
    bulkUntrackAlerts: () => readonly [string, "bulkUntrackAlerts"];
    bulkUntrackAlertsByQuery: () => readonly [string, "bulkUntrackAlertsByQuery"];
    bulkUpdateAlertTags: () => readonly [string, "bulkUpdateAlertTags"];
    bulkUpdateWorkflowStatus: () => readonly [string, "bulkUpdateWorkflowStatus"];
    createCsvReport: () => readonly [string, "createCsvReport"];
};
export declare const INTERNAL_BASE_ALERTING_API_PATH: "/internal/alerting";
export declare const INTERNAL_ALERTING_API_MAINTENANCE_WINDOW_PATH: "/internal/alerting/rules/maintenance_window";
export declare const MAINTENANCE_WINDOW_DATE_FORMAT = "MM/DD/YY hh:mm A";
export declare const CELL_ACTIONS_POPOVER_TEST_ID = "euiDataGridExpansionPopover";
export declare const CELL_ACTIONS_EXPAND_TEST_ID = "euiDataGridCellExpandButton";
export declare const FIELD_BROWSER_TEST_ID = "fields-browser-container";
export declare const FIELD_BROWSER_BTN_TEST_ID = "show-field-browser";
export declare const FIELD_BROWSER_CUSTOM_CREATE_BTN_TEST_ID = "field-browser-custom-create-btn";
export declare const ERROR_PROMPT_TEST_ID = "alertsTableErrorPrompt";
export declare const STACK_MANAGEMENT_RULE_PAGE_URL_PREFIX = "/app/management/insightsAndAlerting/triggersActions/rule/";
export {};
