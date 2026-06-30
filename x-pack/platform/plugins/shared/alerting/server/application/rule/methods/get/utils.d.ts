import type { getRuleSo } from '../../../../data/rule';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { SanitizedRule } from '../../../../types';
import type { RuleParams } from '../../types';
type RuleSo = Awaited<ReturnType<typeof getRuleSo>>;
export declare function transformToSanitizedRule<Params extends RuleParams = never>(context: RulesClientContext, ruleSo: RuleSo): Promise<SanitizedRule<Params>>;
export {};
