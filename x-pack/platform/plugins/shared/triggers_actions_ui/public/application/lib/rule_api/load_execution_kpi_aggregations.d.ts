import type { HttpSetup } from '@kbn/core/public';
export interface LoadExecutionKPIAggregationsProps {
    id: string;
    outcomeFilter?: string[];
    message?: string;
    dateStart: string;
    dateEnd?: string;
    ruleTypeIds?: string[];
}
export declare const loadExecutionKPIAggregations: ({ id, http, outcomeFilter, message, dateStart, dateEnd, ruleTypeIds, }: LoadExecutionKPIAggregationsProps & {
    http: HttpSetup;
}) => Promise<{
    success: number;
    unknown: number;
    failure: number;
    warning: number;
    activeAlerts: number;
    newAlerts: number;
    recoveredAlerts: number;
    erroredActions: number;
    triggeredActions: number;
}>;
