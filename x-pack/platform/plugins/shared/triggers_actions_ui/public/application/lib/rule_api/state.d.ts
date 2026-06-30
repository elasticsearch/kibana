import type { HttpSetup } from '@kbn/core/public';
import type { RuleTaskState } from '../../../types';
export declare function loadRuleState({ http, ruleId, }: {
    http: HttpSetup;
    ruleId: string;
}): Promise<RuleTaskState>;
