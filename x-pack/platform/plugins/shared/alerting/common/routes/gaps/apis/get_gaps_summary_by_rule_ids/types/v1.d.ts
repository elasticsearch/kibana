import type { TypeOf } from '@kbn/config-schema';
import type { getGapsSummaryByRuleIdsBodySchema, getGapsSummaryByRuleIdsResponseSchema } from '..';
export type GetGapsSummaryByRuleIdsBody = TypeOf<typeof getGapsSummaryByRuleIdsBodySchema>;
export type GetGapsSummaryByRuleIdsResponseBody = TypeOf<typeof getGapsSummaryByRuleIdsResponseSchema>;
export interface GetGapsSummaryByRuleIdsResponse {
    body: GetGapsSummaryByRuleIdsResponseBody;
}
