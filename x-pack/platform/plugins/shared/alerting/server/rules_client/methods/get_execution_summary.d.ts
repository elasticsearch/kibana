import type { RulesClientContext } from '../types';
export interface GetGlobalExecutionSummaryParams {
    dateStart: string;
    dateEnd?: string;
}
export declare function getGlobalExecutionSummaryWithAuth(context: RulesClientContext, { dateStart, dateEnd }: GetGlobalExecutionSummaryParams): Promise<{
    executions: {
        total: number;
        success: number;
    };
    latestExecutionSummary: {
        success: number;
        failure: number;
        warning: number;
    };
}>;
