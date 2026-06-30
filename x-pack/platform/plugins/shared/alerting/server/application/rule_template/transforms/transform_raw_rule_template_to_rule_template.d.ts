import type { RawRuleTemplate } from '../../../types';
import type { RuleTemplate } from '../types';
export interface TransformRawRuleTemplateToRuleTemplateParams {
    attributes: RawRuleTemplate;
    id: string;
}
export declare const transformRawRuleTemplateToRuleTemplate: (params: TransformRawRuleTemplateToRuleTemplateParams) => RuleTemplate;
