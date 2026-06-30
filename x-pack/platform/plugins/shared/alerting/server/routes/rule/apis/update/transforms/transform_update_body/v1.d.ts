import type { UpdateRuleActionV1, UpdateRuleRequestBodyV1 } from '../../../../../../../common/routes/rule/apis/update';
import type { UpdateRuleData } from '../../../../../../application/rule/methods/update';
import type { RuleParams, ActionRequest, SystemActionRequest } from '../../../../../../application/rule/types';
export declare const transformUpdateBodyActions: (actions: UpdateRuleActionV1[]) => ActionRequest[];
export declare const transformUpdateBodySystemActions: (actions: UpdateRuleActionV1[]) => SystemActionRequest[];
export declare const transformUpdateBody: <Params extends RuleParams = never>({ updateBody, actions, systemActions, }: {
    updateBody: UpdateRuleRequestBodyV1<Params>;
    actions: UpdateRuleRequestBodyV1<Params>["actions"];
    systemActions: UpdateRuleRequestBodyV1<Params>["actions"];
}) => UpdateRuleData<Params>;
