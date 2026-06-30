import type { RulesClientContext } from '../../../../rules_client';
import type { GetRuleIdsWithGapsParams } from './types';
export declare const RULE_SAVED_OBJECT_TYPE = "alert";
export declare function getRuleIdsWithGaps(context: RulesClientContext, params: GetRuleIdsWithGapsParams): Promise<Readonly<{
    latestGapTimestamp?: number | undefined;
} & {
    summary: Readonly<{} & {
        totalUnfilledDurationMs: number;
        totalInProgressDurationMs: number;
        totalFilledDurationMs: number;
        totalErrorDurationMs: number;
        totalDurationMs: number;
        rulesByGapFillStatus: Readonly<{} & {
            error: number;
            filled: number;
            unfilled: number;
            inProgress: number;
        }>;
    }>;
    total: number;
    ruleIds: string[];
}>>;
