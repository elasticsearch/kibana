import React from 'react';
import type { RULE_EXECUTION_LOG_COLUMN_IDS, CONNECTOR_EXECUTION_LOG_COLUMN_IDS } from '../../../../constants';
export declare const DEFAULT_DATE_FORMAT = "MMM D, YYYY @ HH:mm:ss.SSS";
export type ColumnId = (typeof RULE_EXECUTION_LOG_COLUMN_IDS)[number] | (typeof CONNECTOR_EXECUTION_LOG_COLUMN_IDS)[number];
interface EventLogListCellRendererProps {
    columnId: ColumnId;
    version?: string;
    value?: string | string[];
    dateFormat?: string;
    ruleId?: string;
    spaceIds?: string[];
    useExecutionStatus?: boolean;
    getRuleDetailsRoute?: (ruleId: string) => string;
}
export declare const EventLogListCellRenderer: (props: EventLogListCellRendererProps) => React.JSX.Element | null;
export {};
