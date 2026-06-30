import type { RulesClientContext } from '../../../../rules_client/types';
import type { EnableRuleParams } from './types';
export declare function enableRule(context: RulesClientContext, { id }: EnableRuleParams): Promise<void>;
