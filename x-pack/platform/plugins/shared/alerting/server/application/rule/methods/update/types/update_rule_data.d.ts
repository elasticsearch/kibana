import type { TypeOf } from '@kbn/config-schema';
import type { updateRuleDataSchema } from '../schemas';
import type { RuleParams } from '../../../types';
type UpdateRuleDataType = TypeOf<typeof updateRuleDataSchema>;
export interface UpdateRuleData<Params extends RuleParams = never> {
    name: UpdateRuleDataType['name'];
    tags: UpdateRuleDataType['tags'];
    throttle?: UpdateRuleDataType['throttle'];
    params: Params;
    schedule: UpdateRuleDataType['schedule'];
    actions: UpdateRuleDataType['actions'];
    systemActions?: UpdateRuleDataType['systemActions'];
    notifyWhen?: UpdateRuleDataType['notifyWhen'];
    alertDelay?: UpdateRuleDataType['alertDelay'];
    flapping?: UpdateRuleDataType['flapping'];
    artifacts?: UpdateRuleDataType['artifacts'];
}
export {};
