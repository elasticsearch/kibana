import React from 'react';
import type { CPSPluginStart } from '@kbn/cps/public/types';
import type { RuleTypeWithDescription, RuleTypeCountsByProducer } from '../types';
interface RuleTypeListProps {
    ruleTypes: RuleTypeWithDescription[];
    onSelectRuleType: (ruleTypeId: string) => void;
    onFilterByProducer: (producer: string | null) => void;
    selectedProducer: string | null;
    ruleTypeCountsByProducer: RuleTypeCountsByProducer;
    onClearFilters: () => void;
    showCategories: boolean;
    cps?: CPSPluginStart;
}
export declare const RuleTypeList: React.FC<RuleTypeListProps>;
export {};
