import type { EuiDataGridColumn } from '@elastic/eui';
import type { AlertsTableConfiguration } from '../schemas/alerts_table_configuration_schema';
interface ApplyColumnsConfigurationParams {
    defaultColumns: EuiDataGridColumn[];
    configuredColumns?: AlertsTableConfiguration['columns'];
    visibleColumns?: AlertsTableConfiguration['visibleColumns'];
}
/**
 * Merges the configured columns with the default columns.
 */
export declare const applyColumnsConfiguration: ({ defaultColumns, configuredColumns, }: ApplyColumnsConfigurationParams) => {
    id: string;
    initialWidth?: number | undefined;
}[];
export {};
