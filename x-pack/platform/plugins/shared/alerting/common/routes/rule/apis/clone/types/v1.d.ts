import type { TypeOf } from '@kbn/config-schema';
import type { RuleParamsV1, RuleResponseV1 } from '../../../response';
import type { cloneRuleRequestParamsSchemaV1 } from '..';
export type CloneRuleRequestParams = TypeOf<typeof cloneRuleRequestParamsSchemaV1>;
export interface CloneRuleResponse<Params extends RuleParamsV1 = never> {
    body: RuleResponseV1<Params>;
}
