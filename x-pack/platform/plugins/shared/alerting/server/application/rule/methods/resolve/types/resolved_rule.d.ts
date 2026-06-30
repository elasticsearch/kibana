import type { Rule } from '../../../types';
export type ResolvedRule<Params> = Rule<Params> & {
    outcome: string;
    alias_target_id?: string;
};
