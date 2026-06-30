import type { FindRulesInternalResponseV1 } from '../../../../../../../../common/routes/rule/apis/find/internal';
import type { FindResult } from '../../../../../../../application/rule/methods/find';
export declare const transformPartialRule: (rule: FindResult<{}>["data"][number], fields?: string[]) => FindRulesInternalResponseV1["data"][number];
export declare const transformFindRulesInternalResponse: (result: FindResult<{}>, fields?: string[]) => FindRulesInternalResponseV1;
