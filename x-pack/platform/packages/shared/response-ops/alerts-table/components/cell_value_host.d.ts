import type { GetAlertsTableProp } from '../types';
/**
 * Entry point for rendering cell values
 *
 * Renders a SystemCell for cases, maintenance windows, and alert status, the `renderCellValue`
 * provided in the `AlertsTableProps` for other fields or the default cell value renderer otherwise.
 * When the alerts or the related cases or maintenance windows are loading, a skeleton text is rendered.
 */
export declare const CellValueHost: GetAlertsTableProp<'renderCellValue'>;
