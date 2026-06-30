import type { RuleCreationValidConsumer } from '@kbn/rule-data-utils';
import type { RuleTypeModel, RuleTypeRegistryContract, RuleTypeWithDescription } from '../common/types';
export type RuleTypeItems = Array<{
    ruleTypeModel: RuleTypeModel;
    ruleType: RuleTypeWithDescription;
}>;
export declare const getAvailableRuleTypes: ({ consumer, ruleTypes, ruleTypeRegistry, validConsumers, }: {
    consumer: string;
    ruleTypes: RuleTypeWithDescription[];
    ruleTypeRegistry: RuleTypeRegistryContract;
    validConsumers?: RuleCreationValidConsumer[];
}) => RuleTypeItems;
