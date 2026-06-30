import type { RulesClientContext } from '../../../../rules_client/types';
import type { SanitizedRule, SanitizedRuleWithLegacyId } from '../../../../types';
import type { RuleParams } from '../../types';
import type { GetRuleParams } from './types';
export declare function getRule<Params extends RuleParams = never>(context: RulesClientContext, params: GetRuleParams): Promise<SanitizedRule<Params> | SanitizedRuleWithLegacyId<Params>>;
