import type { RulesClientContext } from '../../../../rules_client/types';
import type { GetScheduleFrequencyResult } from './types';
export interface SchedulesIntervalAggregationResult {
    schedule_intervals: {
        buckets: Array<{
            key: string;
            doc_count: number;
        }>;
    };
}
export declare const getScheduleFrequency: (context: RulesClientContext) => Promise<GetScheduleFrequencyResult>;
interface ValidateScheduleLimitParams {
    context: RulesClientContext;
    prevInterval?: string | string[];
    updatedInterval: string | string[];
}
export type ValidateScheduleLimitResult = {
    interval: number;
    intervalAvailable: number;
} | null;
export declare const validateScheduleLimit: (params: ValidateScheduleLimitParams) => Promise<ValidateScheduleLimitResult>;
export {};
