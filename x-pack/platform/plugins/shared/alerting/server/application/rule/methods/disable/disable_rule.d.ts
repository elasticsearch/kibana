import type { RulesClientContext } from '../../../../rules_client/types';
import type { DisableRuleParams } from './types';
export declare function disableRule(context: RulesClientContext, { id, untrack }: DisableRuleParams): Promise<void>;
