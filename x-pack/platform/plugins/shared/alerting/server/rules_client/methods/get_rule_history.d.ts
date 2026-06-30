import type { SortCombinations } from '@elastic/elasticsearch/lib/api/types';
import type { RuleTypeSolution } from '@kbn/alerting-types';
import type { ChangeHistoryDocument, GetHistoryResult } from '@kbn/change-history';
import type { RulesClientContext } from '../types';
import type { Rule, RuleParams } from '../../application/rule/types';
/**
 * Thrown by {@link RulesClient.getHistory} when rule change tracking is
 * disabled at the framework level (`xpack.alerting.ruleChangeTracking.enabled = false`).
 */
export declare class RuleChangeTrackingDisabledError extends Error {
    constructor(message?: string);
}
export interface GetRuleHistoryParams {
    /** Solution module that owns the rule (e.g. `'security'`). */
    module: RuleTypeSolution;
    /** Rule id to fetch history for. */
    ruleId: string;
    /** ES `from` offset. Defaults to 0. */
    from?: number;
    /** ES `size`. Defaults to 20. */
    size?: number;
    /** ES sort. When omitted, the underlying change-history client's default applies. */
    sort?: SortCombinations[];
}
/**
 * A single rule change-history document with the rule snapshot rehydrated
 * into a `SanitizedRule` shape so callers don't have to deal with the raw
 * stored `object.snapshot` directly.
 */
export interface RuleChangeHistoryDocument<Params extends RuleParams = RuleParams> extends ChangeHistoryDocument {
    rule: Rule<Params>;
}
/**
 * Page of rule change-history documents returned by {@link RulesClient.getHistory}.
 */
export interface GetRuleHistoryResult extends GetHistoryResult {
    items: RuleChangeHistoryDocument[];
}
export declare function getRuleHistory(context: RulesClientContext, { module, ruleId, from, size, sort }: GetRuleHistoryParams): Promise<GetRuleHistoryResult>;
