import type { GetRuleIdsWithGapsResponse } from '../../../../../../application/gaps/methods/get_rule_ids_with_gaps/types';
import type { GetRuleIdsWithGapResponseBodyV1 } from '../../../../../../../common/routes/gaps/apis/get_rules_with_gaps';
export declare const transformResponse: (response: GetRuleIdsWithGapsResponse) => GetRuleIdsWithGapResponseBodyV1;
