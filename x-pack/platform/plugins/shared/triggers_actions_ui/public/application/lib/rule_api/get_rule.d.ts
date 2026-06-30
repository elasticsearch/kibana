import type { HttpSetup } from '@kbn/core/public';
import type { Rule } from '../../../types';
export declare function loadRule({ http, ruleId, }: {
    http: HttpSetup;
    ruleId: string;
}): Promise<Rule>;
