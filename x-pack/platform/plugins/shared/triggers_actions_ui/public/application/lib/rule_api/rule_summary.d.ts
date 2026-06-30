import type { HttpSetup } from '@kbn/core/public';
import type { RuleSummary } from '../../../types';
export declare function loadRuleSummary({ http, ruleId, numberOfExecutions, }: {
    http: HttpSetup;
    ruleId: string;
    numberOfExecutions?: number;
}): Promise<RuleSummary>;
