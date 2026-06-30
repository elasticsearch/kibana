import type { RuleCreationValidConsumer } from '@kbn/rule-data-utils';
import type { RuleTypeWithDescription } from '../common/types';
export declare const getAuthorizedConsumers: ({ ruleType, validConsumers, }: {
    ruleType: RuleTypeWithDescription;
    validConsumers: RuleCreationValidConsumer[];
}) => RuleCreationValidConsumer[];
