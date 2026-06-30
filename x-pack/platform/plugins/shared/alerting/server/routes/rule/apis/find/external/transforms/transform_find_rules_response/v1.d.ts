import type { FindRulesResponseV1 } from '../../../../../../../../common/routes/rule/apis/find/external';
import type { FindResult } from '../../../../../../../application/rule/methods/find';
type RuleDomainResponse = FindResult<{}>['data'][number];
export declare const transformPartialRule: (rule: RuleDomainResponse, fields?: string[]) => FindRulesResponseV1["data"][number];
export declare const transformFindRulesResponse: (result: FindResult<{}>, fields?: string[]) => FindRulesResponseV1;
export {};
