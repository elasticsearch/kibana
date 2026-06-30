export declare const executionLogSortableColumns: readonly ["timestamp", "execution_duration", "total_search_duration", "es_search_duration", "schedule_delay", "num_triggered_actions", "num_generated_actions", "num_active_alerts", "num_recovered_alerts", "num_new_alerts"];
export declare const actionErrorLogSortableColumns: string[];
export declare const EMPTY_EXECUTION_KPI_RESULT: {
    success: number;
    unknown: number;
    failure: number;
    warning: number;
    activeAlerts: number;
    newAlerts: number;
    recoveredAlerts: number;
    erroredActions: number;
    triggeredActions: number;
};
export declare const EMPTY_EXECUTION_SUMMARY_RESULT: {
    executions: {
        total: number;
        success: number;
    };
    latestExecutionSummary: {
        success: number;
        failure: number;
        warning: number;
    };
};
export type ExecutionLogSortFields = (typeof executionLogSortableColumns)[number];
export type ActionErrorLogSortFields = (typeof actionErrorLogSortableColumns)[number];
export interface IExecutionLog {
    id: string;
    timestamp: string;
    duration_ms: number;
    status: string;
    message: string;
    version: string;
    num_active_alerts: number;
    num_new_alerts: number;
    num_recovered_alerts: number;
    num_triggered_actions: number;
    num_generated_actions: number;
    num_succeeded_actions: number;
    num_errored_actions: number;
    total_search_duration_ms: number;
    es_search_duration_ms: number;
    schedule_delay_ms: number;
    timed_out: boolean;
    rule_id: string;
    space_ids: string[];
    rule_name: string;
    maintenance_window_ids: string[];
}
export interface IExecutionErrors {
    id: string;
    timestamp: string;
    type: string;
    message: string;
}
export interface IExecutionErrorsResult {
    totalErrors: number;
    errors: IExecutionErrors[];
}
export interface IExecutionLogResult {
    total: number;
    data: IExecutionLog[];
}
export type IExecutionKPIResult = typeof EMPTY_EXECUTION_KPI_RESULT;
