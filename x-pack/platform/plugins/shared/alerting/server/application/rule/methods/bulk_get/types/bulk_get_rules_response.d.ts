import type { SanitizedRule, SanitizedRuleWithLegacyId } from '../../../../../types';
import type { RuleParams } from '../../../types';
export interface BulkGetRulesResponse<Params extends RuleParams = never> {
    rules: Array<SanitizedRule<Params> | SanitizedRuleWithLegacyId<Params>>;
    errors: Array<{
        id: string;
        error: {
            message: string;
            statusCode?: number;
        };
    }>;
}
