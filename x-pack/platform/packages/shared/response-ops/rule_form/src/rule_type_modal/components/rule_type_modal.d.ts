import React from 'react';
import type { CPSPluginStart } from '@kbn/cps/public/types';
import type { RuleTypeWithDescription, RuleTypeCountsByProducer } from '../types';
export interface RuleTypeModalProps {
    onClose: () => void;
    onSelectRuleType: (ruleTypeId: string) => void;
    onSelectTemplate: (templateId: string) => void;
    onFilterByProducer: (producer: string | null) => void;
    onChangeSearch: (search: string) => void;
    onChangeMode: (mode: 'ruleType' | 'template') => void;
    searchString: string;
    selectedProducer: string | null;
    selectedMode: 'ruleType' | 'template';
    showCategories: boolean;
    templates: Array<{
        id: string;
        name: string;
        tags: string[];
        ruleTypeId: string;
        ruleTypeName?: string;
        producer?: string;
    }>;
    templatesLoading: boolean;
    templatesLoadingMore: boolean;
    hasMoreTemplates: boolean;
    onLoadMoreTemplates: () => void;
    cps?: CPSPluginStart;
}
export interface RuleTypeModalState {
    ruleTypes: RuleTypeWithDescription[];
    ruleTypesLoading: boolean;
    ruleTypeCountsByProducer: RuleTypeCountsByProducer;
}
export declare const RuleTypeModal: React.FC<RuleTypeModalProps & RuleTypeModalState>;
