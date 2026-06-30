import type { Logger } from '@kbn/core/server';
import type { RuleAction, Rule } from '../../../types';
import type { RuleExecutorServices } from '../../..';
/**
 * @deprecated Once we are confident all rules relying on side-car actions SO's have been migrated to SO references we should remove this function
 */
interface LegacyGetBulkRuleActionsSavedObject {
    alertIds: string[];
    savedObjectsClient: RuleExecutorServices['savedObjectsClient'];
    logger: Logger;
}
/**
 * @deprecated Once we are confident all rules relying on side-car actions SO's have been migrated to SO references we should remove this function
 */
export interface LegacyActionsObj {
    ruleThrottle: string | null;
    legacyRuleActions: RuleAction[];
}
/**
 * @deprecated Once we are confident all rules relying on side-car actions SO's have been migrated to SO references we should remove this function
 * this function finds all legacy actions associated with rules in bulk
 * it's useful for such methods as find, so we do not request legacy actions in a separate request per rule
 * @params params.alertIds - list of rule ids to look for legacy actions for
 * @params params.savedObjectsClient - savedObjectsClient
 * @params params.logger - logger
 * @returns map of legacy actions objects per rule with legacy actions
 */
export declare const legacyGetBulkRuleActionsSavedObject: ({ alertIds, savedObjectsClient, logger, }: LegacyGetBulkRuleActionsSavedObject) => Promise<Record<string, LegacyActionsObj>>;
/**
 * @deprecated Once we are confident all rules relying on side-car actions SO's have been migrated to SO references we should remove this function
 * formats rules with associated SIEM legacy actions, if any legacy actions present
 * @param rules - list of rules to format
 * @param params - logger, savedObjectsClient
 * @returns
 */
export declare const formatLegacyActions: <T extends Rule>(rules: T[], { logger, savedObjectsClient }: Omit<LegacyGetBulkRuleActionsSavedObject, "alertIds">) => Promise<T[]>;
export {};
