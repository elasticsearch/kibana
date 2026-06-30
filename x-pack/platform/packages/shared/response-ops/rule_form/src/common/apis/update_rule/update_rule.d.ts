import type { HttpSetup } from '@kbn/core/public';
import type { UpdateRuleBody } from './types';
import type { Rule } from '../../types';
export declare const UPDATE_FIELDS: Array<keyof UpdateRuleBody>;
export declare const UPDATE_FIELDS_WITH_ACTIONS: Array<keyof UpdateRuleBody>;
export declare function updateRule({ http, rule, id, }: {
    http: HttpSetup;
    rule: UpdateRuleBody;
    id: string;
}): Promise<Rule>;
