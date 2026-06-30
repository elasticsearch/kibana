import type { RuleChangeTracking } from '@kbn/alerting-types';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { RuleParams } from '../../types';
import type { SanitizedRule } from '../../../../types';
import type { CreateRuleData } from './types';
export interface CreateRuleOptions {
    id?: string;
}
export interface CreateRuleParams<Params extends RuleParams = never> {
    data: CreateRuleData<Params>;
    options?: CreateRuleOptions;
    changeTracking?: RuleChangeTracking;
    allowMissingConnectorSecrets?: boolean;
}
export declare function createRule<Params extends RuleParams = never>(context: RulesClientContext, createParams: CreateRuleParams<Params>): Promise<SanitizedRule<Params>>;
