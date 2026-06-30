import type { RuleCreationValidConsumer } from '@kbn/rule-data-utils';
import type { RuleTypeWithDescription } from '../common/types';
export declare const getValidatedMultiConsumer: ({ multiConsumerSelection, validConsumers, }: {
    multiConsumerSelection?: RuleCreationValidConsumer | null;
    validConsumers: RuleCreationValidConsumer[];
}) => RuleCreationValidConsumer | null;
export declare const getInitialMultiConsumer: ({ multiConsumerSelection, validConsumers, ruleType, ruleTypes, }: {
    multiConsumerSelection?: RuleCreationValidConsumer | null;
    validConsumers: RuleCreationValidConsumer[];
    ruleType: RuleTypeWithDescription;
    ruleTypes: RuleTypeWithDescription[];
}) => RuleCreationValidConsumer | null;
