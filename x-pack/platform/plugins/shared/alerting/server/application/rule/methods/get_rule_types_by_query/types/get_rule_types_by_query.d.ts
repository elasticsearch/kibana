import type { TypeOf } from '@kbn/config-schema';
import type { getRuleTypesByQueryParamsSchema, getRuleTypesByQueryResponseSchema } from '../schemas';
export type GetRuleTypesByQueryParams = TypeOf<typeof getRuleTypesByQueryParamsSchema>;
export type GetRuleTypesByQueryResponse = TypeOf<typeof getRuleTypesByQueryResponseSchema>;
