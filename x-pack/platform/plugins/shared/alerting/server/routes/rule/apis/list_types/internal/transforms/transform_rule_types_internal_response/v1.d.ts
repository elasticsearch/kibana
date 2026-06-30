import type { RegistryAlertTypeWithAuth } from '../../../../../../../authorization';
import type { GetRuleTypesInternalResponseBodyV1 } from '../../../../../../../../common/routes/rule/apis/list_types/internal';
export declare const transformRuleTypesInternalResponse: (ruleTypes: RegistryAlertTypeWithAuth[]) => GetRuleTypesInternalResponseBodyV1;
