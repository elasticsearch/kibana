import type { TypeOf } from '@kbn/config-schema';
import type { RuleParamsV1, RuleResponseV1 } from '../../../response';
import type { actionSchemaV1, actionFrequencySchemaV1, updateParamsSchemaV1, updateBodySchemaV1 } from '..';
export type UpdateRuleAction = TypeOf<typeof actionSchemaV1>;
export type UpdateRuleActionFrequency = TypeOf<typeof actionFrequencySchemaV1>;
export type UpdateRuleRequestParams = TypeOf<typeof updateParamsSchemaV1>;
type UpdateBodySchema = TypeOf<typeof updateBodySchemaV1>;
export interface UpdateRuleRequestBody<Params extends RuleParamsV1 = never> {
    name: UpdateBodySchema['name'];
    tags: UpdateBodySchema['tags'];
    schedule: UpdateBodySchema['schedule'];
    throttle?: UpdateBodySchema['throttle'];
    params: Params;
    actions: UpdateBodySchema['actions'];
    notify_when?: UpdateBodySchema['notify_when'];
    alert_delay?: UpdateBodySchema['alert_delay'];
    flapping?: UpdateBodySchema['flapping'];
    artifacts?: UpdateBodySchema['artifacts'];
}
export interface UpdateRuleResponse<Params extends RuleParamsV1 = never> {
    body: RuleResponseV1<Params>;
}
export {};
