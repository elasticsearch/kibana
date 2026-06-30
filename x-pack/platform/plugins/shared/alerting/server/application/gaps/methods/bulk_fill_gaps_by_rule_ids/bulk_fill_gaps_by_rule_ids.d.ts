import type { RulesClientContext } from '../../../../rules_client';
import { type BulkFillGapsByRuleIdsResult, type BulkFillGapsByRuleIdsParams, type BulkFillGapsByRuleIdsOptions } from './types';
export declare const bulkFillGapsByRuleIds: (context: RulesClientContext, { rules, range }: BulkFillGapsByRuleIdsParams, options: BulkFillGapsByRuleIdsOptions) => Promise<BulkFillGapsByRuleIdsResult>;
