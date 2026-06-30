import type { ActionTypeModel, RuleTypeWithDescription } from '@kbn/alerts-ui-shared';
export declare const getDefaultParams: ({ group, ruleType, actionTypeModel, }: {
    group: string;
    actionTypeModel: ActionTypeModel;
    ruleType: RuleTypeWithDescription;
}) => ActionTypeModel["defaultActionParams"];
