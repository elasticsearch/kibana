import type { RawRule } from '../../types';
import type { UntypedNormalizedRuleType } from '../../rule_type_registry';
import type { NormalizedAlertAction, NormalizedSystemAction } from '../types';
import type { RulesClientContext } from '../types';
export type ValidateActionsData = Pick<RawRule, 'notifyWhen' | 'throttle' | 'schedule'> & {
    actions: NormalizedAlertAction[];
    systemActions?: NormalizedSystemAction[];
};
export declare function validateActions(context: RulesClientContext, ruleType: UntypedNormalizedRuleType, data: ValidateActionsData, allowMissingConnectorSecrets?: boolean): Promise<void>;
