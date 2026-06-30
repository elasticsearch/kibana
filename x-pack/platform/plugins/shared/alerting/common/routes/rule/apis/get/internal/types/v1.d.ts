import type { TypeOf } from '@kbn/config-schema';
import type { RuleParamsV1, RuleResponseInternalV1 } from '../../../../response';
import type { getInternalRuleRequestParamsSchemaV1 } from '..';
export type GetInternalRuleRequestParams = TypeOf<typeof getInternalRuleRequestParamsSchemaV1>;
export interface GetInternalRuleResponse<Params extends RuleParamsV1 = never> {
    body: RuleResponseInternalV1<Params>;
}
