import type { HttpSetup } from '@kbn/core/public';
import type { Rule, RuleType } from '../../common';
export declare function loadRuleTypes({ http }: {
    http: HttpSetup;
}): Promise<RuleType[]>;
export declare function loadRuleType({ http, id, }: {
    http: HttpSetup;
    id: RuleType['id'];
}): Promise<RuleType | undefined>;
export declare function loadRule({ http, ruleId, }: {
    http: HttpSetup;
    ruleId: string;
}): Promise<Rule>;
