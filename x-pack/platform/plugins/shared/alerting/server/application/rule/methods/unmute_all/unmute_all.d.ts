import type { RulesClientContext } from '../../../../rules_client/types';
import type { UnmuteAllRuleParams } from './types';
export declare function unmuteAll(context: RulesClientContext, { id }: UnmuteAllRuleParams): Promise<void>;
