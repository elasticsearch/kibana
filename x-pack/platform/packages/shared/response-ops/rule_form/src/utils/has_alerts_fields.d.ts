import type { RuleCreationValidConsumer } from '@kbn/rule-data-utils';
import type { RuleTypeWithDescription } from '../common/types';
export declare const hasAlertsFields: ({ ruleType, consumer, validConsumers, }: {
    ruleType: RuleTypeWithDescription;
    consumer: string;
    validConsumers: RuleCreationValidConsumer[];
}) => boolean;
