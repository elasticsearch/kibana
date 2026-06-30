import type { TypeOf } from '@kbn/config-schema';
import type { RuleParamsV1, RuleResponseV1 } from '../../../../response';
import type { getRuleRequestParamsSchemaV1 } from '..';
export type GetRuleRequestParams = TypeOf<typeof getRuleRequestParamsSchemaV1>;
export interface GetRuleResponse<Params extends RuleParamsV1 = never> {
    body: RuleResponseV1<Params>;
}
