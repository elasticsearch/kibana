import type { RulesClientContext } from '../../../../rules_client/types';
import type { SanitizedRule } from '../../../../types';
import type { RuleParams } from '../../types';
import type { SnoozeRuleOptions } from './types';
export declare function snoozeRule<Params extends RuleParams = never>(context: RulesClientContext, { id, snoozeSchedule }: SnoozeRuleOptions): Promise<SanitizedRule<Params>>;
