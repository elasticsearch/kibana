import type { HttpSetup } from '@kbn/core/public';
export interface LoadGlobalExecutionKPIAggregationsProps {
    id: string;
    outcomeFilter?: string[];
    message?: string;
    dateStart: string;
    dateEnd?: string;
    namespaces?: Array<string | undefined>;
    ruleTypeIds?: string[];
}
export declare const loadGlobalExecutionKPIAggregations: ({ id, http, outcomeFilter, message, dateStart, dateEnd, namespaces, ruleTypeIds, }: LoadGlobalExecutionKPIAggregationsProps & {
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
