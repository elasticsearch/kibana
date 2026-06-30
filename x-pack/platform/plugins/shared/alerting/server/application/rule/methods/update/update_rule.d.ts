import type { RuleChangeTracking } from '@kbn/alerting-types';
import type { SanitizedRule } from '../../../../types';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { RuleParams } from '../../types';
import type { UpdateRuleData } from './types';
type ShouldIncrementRevision = (params?: RuleParams) => boolean;
export interface UpdateRuleParams<Params extends RuleParams = never> {
    id: string;
    data: UpdateRuleData<Params>;
    allowMissingConnectorSecrets?: boolean;
    shouldIncrementRevision?: ShouldIncrementRevision;
    changeTracking?: RuleChangeTracking;
}
export declare function updateRule<Params extends RuleParams = never>(context: RulesClientContext, updateParams: UpdateRuleParams<Params>): Promise<SanitizedRule<Params>>;
export {};
