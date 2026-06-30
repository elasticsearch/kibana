import type { TypeOf } from '@kbn/config-schema';
import type { getRuleIdsWithGapsParamsSchema, getRuleIdsWithGapsResponseSchema } from '../schemas';
export type GetRuleIdsWithGapsParams = TypeOf<typeof getRuleIdsWithGapsParamsSchema>;
export type GetRuleIdsWithGapsResponse = TypeOf<typeof getRuleIdsWithGapsResponseSchema>;
