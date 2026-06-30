import type { RuleTypeIndexWithDescriptions, RuleTypeCountsByProducer, RuleTypeWithDescription } from '../../types';
export declare const filterAndCountRuleTypes: (ruleTypeIndex: RuleTypeIndexWithDescriptions, selectedProducer: string | null, searchString: string) => [RuleTypeWithDescription[], RuleTypeCountsByProducer];
