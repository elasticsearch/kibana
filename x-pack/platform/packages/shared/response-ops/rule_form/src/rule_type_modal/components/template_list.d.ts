import React from 'react';
import type { RuleTypeModalProps } from './rule_type_modal';
interface TemplateListProps {
    templates: RuleTypeModalProps['templates'];
    onSelectTemplate: (templateId: string) => void;
    hasMore: boolean;
    onLoadMore: () => void;
    loadingMore: boolean;
}
export declare const TemplateList: React.FC<TemplateListProps>;
export {};
