import type { TypeOf } from '@kbn/config-schema';
import type { ruleTagsRequestQuerySchema, ruleTagsFormattedResponseSchema } from '..';
export type RuleTagsRequestQuery = TypeOf<typeof ruleTagsRequestQuerySchema>;
export type RuleTagsFormattedResponse = TypeOf<typeof ruleTagsFormattedResponseSchema>;
