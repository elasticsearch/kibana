import type { HttpSetup } from '@kbn/core/public';
import type { Rule } from '../../types';
import type { CreateRuleBody } from '.';
export declare function createRule({ http, rule, }: {
    http: HttpSetup;
    rule: CreateRuleBody;
}): Promise<Rule>;
