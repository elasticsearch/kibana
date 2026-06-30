import type { TypeOf } from '@kbn/config-schema';
import type { findRulesOptionsSchema, findRulesParamsSchema } from '../schemas';
export type FindRulesOptions = TypeOf<typeof findRulesOptionsSchema>;
export type FindRulesParams = TypeOf<typeof findRulesParamsSchema>;
