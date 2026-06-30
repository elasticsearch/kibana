import type { RulesClientContext } from '../../../../rules_client/types';
import type { MuteAllRuleParams } from './types';
export declare function muteAll(context: RulesClientContext, { id }: MuteAllRuleParams): Promise<void>;
