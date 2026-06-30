import type { RulesClientContext } from '../../../../rules_client/types';
import type { GetRuleTemplateParams } from './types';
import type { RuleTemplate } from '../../types';
export declare function getRuleTemplate(context: RulesClientContext, params: GetRuleTemplateParams): Promise<RuleTemplate>;
