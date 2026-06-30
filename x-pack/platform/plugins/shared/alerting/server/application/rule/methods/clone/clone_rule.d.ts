import type { SanitizedRule } from '../../../../types';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { CloneRuleParams } from './types';
import type { RuleParams } from '../../types';
export declare function cloneRule<Params extends RuleParams = never>(context: RulesClientContext, params: CloneRuleParams): Promise<SanitizedRule<Params>>;
