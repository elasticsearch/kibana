import type { RulesClientContext } from '../../../../rules_client/types';
import type { FindRuleTemplatesParams } from './types';
import type { RuleTemplate } from '../../types';
export interface FindResult {
    page: number;
    perPage: number;
    total: number;
    data: Array<RuleTemplate>;
}
export declare function findRuleTemplates(context: RulesClientContext, params: FindRuleTemplatesParams): Promise<FindResult>;
