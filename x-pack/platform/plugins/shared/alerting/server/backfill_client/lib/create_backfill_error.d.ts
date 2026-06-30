import type { ScheduleBackfillError } from '../../application/backfill/methods/schedule/types';
export declare function createBackfillError(message: string, ruleId: string, ruleName?: string): ScheduleBackfillError;
