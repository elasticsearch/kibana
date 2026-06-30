import type { Logger, SavedObjectReference } from '@kbn/core/server';
import type { Rule, RawRule, RuleTypeParams, RuleWithLegacyId, RuleTypeRegistry } from '../../types';
export interface GetAlertFromRawParams {
    id: string;
    ruleTypeId: string;
    rawRule: RawRule;
    references: SavedObjectReference[] | undefined;
}
interface GetAlertFromRawOpts {
    id: string;
    isSystemAction: (actionId: string) => boolean;
    logger: Logger;
    rawRule: RawRule;
    references: SavedObjectReference[] | undefined;
    ruleTypeId: string;
    ruleTypeRegistry: RuleTypeRegistry;
}
/**
 * @deprecated in favor of transformRuleAttributesToRuleDomain
 */
export declare function getAlertFromRaw<Params extends RuleTypeParams>(opts: GetAlertFromRawOpts): Rule | RuleWithLegacyId;
export {};
