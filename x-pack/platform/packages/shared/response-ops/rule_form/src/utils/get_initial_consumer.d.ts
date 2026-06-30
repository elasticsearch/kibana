import type { RuleTypeWithDescription } from '../common';
export declare const getInitialConsumer: ({ consumer, ruleType, shouldUseRuleProducer, }: {
    consumer: string;
    ruleType: RuleTypeWithDescription;
    shouldUseRuleProducer: boolean;
}) => string;
