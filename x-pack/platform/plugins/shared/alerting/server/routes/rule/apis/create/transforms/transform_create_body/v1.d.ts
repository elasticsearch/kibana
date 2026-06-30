import type { CreateRuleRequestBodyV1 } from '../../../../../../../common/routes/rule/apis/create';
import type { CreateRuleData } from '../../../../../../application/rule/methods/create';
import type { RuleParams } from '../../../../../../application/rule/types';
export declare const transformCreateBody: <Params extends RuleParams = never>({ createBody, actions, systemActions, }: {
    createBody: CreateRuleRequestBodyV1<Params>;
    actions: CreateRuleRequestBodyV1<Params>["actions"];
    systemActions: CreateRuleRequestBodyV1<Params>["actions"];
}) => CreateRuleData<Params>;
