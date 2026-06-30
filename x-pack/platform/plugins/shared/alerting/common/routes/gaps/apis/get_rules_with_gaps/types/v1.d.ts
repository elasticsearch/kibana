import type { TypeOf } from '@kbn/config-schema';
import type { getRuleIdsWithGapBodySchemaV1, getRuleIdsWithGapResponseSchemaV1 } from '..';
export type GetRuleIdsWithGapBody = TypeOf<typeof getRuleIdsWithGapBodySchemaV1>;
export type GetRuleIdsWithGapResponseBody = TypeOf<typeof getRuleIdsWithGapResponseSchemaV1>;
export interface GetRuleIdsWithGapResponse {
    body: GetRuleIdsWithGapResponseBody;
}
