export declare enum BulkGapsFillStep {
    ACCESS_VALIDATION = "ACCESS_VALIDATION",
    SCHEDULING = "SCHEDULING"
}
export declare enum BulkFillGapsScheduleResult {
    BACKFILLED = "BACKFILLED",
    SKIPPED = "SKIPPED",
    ERRORED = "ERRORED"
}
export interface BulkGapFillingErroredRule {
    rule: {
        id: string;
        name: string;
    };
    step: BulkGapsFillStep;
    errorMessage: string;
}
interface RuleToBackfill {
    id: string;
    name: string;
    alertTypeId: string;
    consumer: string;
}
export interface BulkFillGapsByRuleIdsParams {
    rules: RuleToBackfill[];
    range: {
        start: string;
        end: string;
    };
}
import type { GapReasonType } from '../../../../../common/constants';
export interface BulkFillGapsByRuleIdsOptions {
    maxGapCountPerRule: number;
    maxBackfillConcurrency?: number;
    excludedReasons?: GapReasonType[];
}
export interface BulkFillGapsByRuleIdsResult {
    backfilled: RuleToBackfill[];
    skipped: RuleToBackfill[];
    errored: BulkGapFillingErroredRule[];
}
export declare enum GapFillSchedulePerRuleStatus {
    ERROR = "error",
    SUCCESS = "success"
}
export {};
