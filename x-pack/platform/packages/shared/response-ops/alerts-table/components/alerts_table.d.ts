import React from 'react';
import type { AdditionalContext, AlertsTableImperativeApi, AlertsTableProps } from '../types';
/**
 * An `EuiDataGrid` abstraction to render alert documents
 *
 * It manages the paginated and cached fetching of alerts based on the
 * provided `ruleTypeIds` and `consumers` (the final query can be refined
 * through the `query` and `sort` props). The `id` prop is required in order
 * to persist the table state in `localStorage`
 *
 * @example
 * ```tsx
 * <AlertsTable
 *   id="my-alerts-table"
 *   ruleTypeIds={ruleTypeIds}
 *   consumers={consumers}
 *   query={esQuery}
 *   sort={defaultAlertsTableSort}
 *   renderCellValue={CellValue}
 *   renderActionsCell={ActionsCell}
 *   services={{ ... }}
 * />
 * ```
 */
export declare const AlertsTable: typeof AlertsTableContent;
declare const AlertsTableContent: <AC extends AdditionalContext>(props: AlertsTableProps<AC> & React.RefAttributes<AlertsTableImperativeApi>) => React.ReactElement;
export { AlertsTable as default };
export type AlertsTable = typeof AlertsTable;
