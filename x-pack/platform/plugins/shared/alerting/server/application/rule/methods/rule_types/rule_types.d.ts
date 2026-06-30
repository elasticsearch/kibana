import type { RegistryAlertTypeWithAuth } from '../../../../authorization';
import type { RulesClientContext } from '../../../../rules_client/types';
export declare function listRuleTypes(context: RulesClientContext): Promise<RegistryAlertTypeWithAuth[]>;
