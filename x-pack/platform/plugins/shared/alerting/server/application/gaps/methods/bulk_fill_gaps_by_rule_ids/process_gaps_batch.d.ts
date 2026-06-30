import type { BulkFillGapsByRuleIdsParams } from './types';
import type { Gap } from '../../../../lib/rule_gaps/gap';
import type { RulesClientContext } from '../../../../rules_client';
import type { BackfillInitiator } from '../../../../../common/constants';
import { GapFillSchedulePerRuleStatus } from './types';
interface ProcessGapsBatchParams {
    range: BulkFillGapsByRuleIdsParams['range'];
    gapsBatch: Gap[];
    maxGapsCountToProcess?: number;
    initiator: BackfillInitiator;
    initiatorId?: string;
}
export interface ProcessGapsBatchResult {
    processedGapsCount: number;
    hasErrors: boolean;
    truncatedRuleIds: string[];
    results: Array<{
        ruleId: string;
        processedGaps: number;
        status: GapFillSchedulePerRuleStatus;
        error?: string;
    }>;
}
export declare const processGapsBatch: (context: RulesClientContext, { range, gapsBatch, maxGapsCountToProcess, initiator, initiatorId }: ProcessGapsBatchParams) => Promise<ProcessGapsBatchResult>;
export {};
