import type { GetGapsSummaryByRuleIdsParams } from '../../../../../../application/gaps/methods/get_gaps_summary_by_rule_ids/types';
import type { GetGapsSummaryByRuleIdsBodyV1 } from '../../../../../../../common/routes/gaps/apis/get_gaps_summary_by_rule_ids';
export declare const transformRequest: ({ rule_ids, start, end, excluded_reasons, gap_auto_fill_scheduler_id, }: GetGapsSummaryByRuleIdsBodyV1) => GetGapsSummaryByRuleIdsParams;
