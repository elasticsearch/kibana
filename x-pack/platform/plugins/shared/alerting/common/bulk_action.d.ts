import type { Rule } from './rule';
export type BulkEditSkipReason = 'RULE_NOT_MODIFIED';
export type BulkGapsFillingSkipReason = 'NO_GAPS_TO_FILL';
type AllowedSkipReason = BulkEditSkipReason | BulkGapsFillingSkipReason;
interface SkipResult<SkipReason extends AllowedSkipReason> {
    id: Rule['id'];
    name?: Rule['name'];
    skip_reason: SkipReason;
}
export type BulkEditActionSkipResult = SkipResult<BulkEditSkipReason>;
export type BulkGapsFillingSkipResult = SkipResult<BulkGapsFillingSkipReason>;
export type BulkActionSkipResult = BulkEditActionSkipResult | BulkGapsFillingSkipResult;
export {};
