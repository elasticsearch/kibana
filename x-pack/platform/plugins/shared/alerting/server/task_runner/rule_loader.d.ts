import type { SavedObjectReference } from '@kbn/core-saved-objects-api-server';
import type { Logger } from '@kbn/logging';
import { type RunRuleParams, type TaskRunnerContext } from './types';
import type { RawRule, RuleTypeRegistry, RuleTypeParamsValidator } from '../types';
import type { RuleTypeParams } from '../../common';
interface RuleData {
    rawRule: RawRule;
    version: string | undefined;
    references: SavedObjectReference[];
}
interface ValidateRuleAndCreateFakeRequestParams<Params extends RuleTypeParams> {
    context: TaskRunnerContext;
    logger: Logger;
    paramValidator?: RuleTypeParamsValidator<Params>;
    ruleData: RuleData;
    ruleId: string;
    ruleTypeRegistry: RuleTypeRegistry;
    spaceId: string;
}
/**
 * With the decrypted rule saved object
 * - transform from domain model to application model (rule)
 * - create a fakeRequest object using the rule API key
 * - get an instance of the RulesClient using the fakeRequest
 */
export declare function validateRuleAndCreateFakeRequest<Params extends RuleTypeParams>(params: ValidateRuleAndCreateFakeRequestParams<Params>): RunRuleParams<Params>;
/**
 * Loads the decrypted rule saved object
 */
export declare function getDecryptedRule(context: TaskRunnerContext, ruleId: string, spaceId: string): Promise<RuleData>;
export declare function getFakeKibanaRequest(context: TaskRunnerContext, spaceId: string, apiKey: RawRule['apiKey'], uiamApiKey?: RawRule['uiamApiKey'], apiKeyCreatedByUser?: RawRule['apiKeyCreatedByUser'], apiKeyOwner?: RawRule['apiKeyOwner']): import("@kbn/core-http-server").KibanaRequest<unknown, unknown, unknown, any>;
export {};
