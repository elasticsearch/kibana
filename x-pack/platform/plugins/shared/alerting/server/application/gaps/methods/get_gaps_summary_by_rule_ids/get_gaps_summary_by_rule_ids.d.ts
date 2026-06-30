import type { RulesClientContext } from '../../../../rules_client';
import type { GetGapsSummaryByRuleIdsParams } from './types';
export declare const RULE_SAVED_OBJECT_TYPE = "alert";
export declare function getGapsSummaryByRuleIds(context: RulesClientContext, params: GetGapsSummaryByRuleIdsParams): Promise<Readonly<{} & {
    data: Readonly<{
        gapFillStatus?: string | undefined;
    } & {
        ruleId: string;
        totalUnfilledDurationMs: number;
        totalInProgressDurationMs: number;
        totalFilledDurationMs: number;
    }>[];
}>>;
