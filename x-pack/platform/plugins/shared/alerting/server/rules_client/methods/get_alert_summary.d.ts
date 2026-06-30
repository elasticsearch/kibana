import type { AlertSummary } from '../../types';
import type { RulesClientContext } from '../types';
export interface GetAlertSummaryParams {
    id: string;
    dateStart?: string;
    numberOfExecutions?: number;
}
export declare function getAlertSummary(context: RulesClientContext, { id, dateStart, numberOfExecutions }: GetAlertSummaryParams): Promise<AlertSummary>;
