import type { TypeOf } from '@kbn/config-schema';
import type { findRuleTemplatesRequestQuerySchema } from '../schemas/v1';
import type { RuleTemplateResponseV1 } from '../../../response';
export type FindRuleTemplatesRequestQuery = TypeOf<typeof findRuleTemplatesRequestQuerySchema>;
export interface FindRuleTemplatesResponse {
    page: number;
    per_page: number;
    total: number;
    data: RuleTemplateResponseV1[];
}
