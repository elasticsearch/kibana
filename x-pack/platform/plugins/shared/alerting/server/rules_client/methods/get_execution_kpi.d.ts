import type { RulesClientContext } from '../types';
export interface GetRuleExecutionKPIParams {
    id: string;
    dateStart: string;
    dateEnd?: string;
    filter?: string;
}
export interface GetGlobalExecutionKPIParams {
    dateStart: string;
    dateEnd?: string;
    filter?: string;
    namespaces?: Array<string | undefined>;
}
export declare function getRuleExecutionKPI(context: RulesClientContext, { id, dateStart, dateEnd, filter }: GetRuleExecutionKPIParams): Promise<{
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
export declare function getGlobalExecutionKpiWithAuth(context: RulesClientContext, { dateStart, dateEnd, filter, namespaces }: GetGlobalExecutionKPIParams): Promise<{
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
