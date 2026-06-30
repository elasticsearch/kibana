import type { RuleTagsRequestQueryV1 } from '../../../../../../../common/routes/rule/apis/tags';
import type { RuleTagsParams } from '../../../../../../application/rule/methods/tags';
export declare const transformRuleTagsQueryRequest: ({ per_page: perPage, page, search, rule_type_ids: ruleTypeIds, }: RuleTagsRequestQueryV1) => RuleTagsParams;
