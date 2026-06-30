import type { RegistryAlertTypeWithAuth } from '../../../../../../../authorization';
import type { TypesRulesResponseBodyV1 } from '../../../../../../../../common/routes/rule/apis/list_types/external';
export declare const transformRuleTypesResponse: (ruleTypes: RegistryAlertTypeWithAuth[]) => TypesRulesResponseBodyV1;
