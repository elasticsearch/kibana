import type { TypeOf } from '@kbn/config-schema';
import type { getGlobalExecutionSummarySchema, getGlobalExecutionSummaryResponseBodySchema } from '..';
export type GetGlobalExecutionSummary = TypeOf<typeof getGlobalExecutionSummarySchema>;
export type GetGlobalExecutionSummaryResponseBody = TypeOf<typeof getGlobalExecutionSummaryResponseBodySchema>;
export interface GetGlobalExecutionSummaryResponse {
    body: GetGlobalExecutionSummaryResponseBody;
}
