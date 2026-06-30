import type { RuleTagsParams } from '.';
import type { RuleTagsFormattedResponse } from '../../../../../common/routes/rule/apis/tags';
import type { RulesClientContext } from '../../../../rules_client/types';
export declare function getRuleTags(context: RulesClientContext, params: RuleTagsParams): Promise<RuleTagsFormattedResponse>;
